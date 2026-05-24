import getBuffer from "../utils/buffer.js";//
import {sql} from "../utils/db.js";
import ErrorHandler from "../utils/errorHandler.js";//
import {TryCatch} from "../utils/TryCatch.js";
import bcrypt from 'bcrypt';//
import axios from "axios";//
import jwt from "jsonwebtoken";
import { forgotPasswordTemplate } from "../templete.js";
import { publishToTopic } from "../producer.js";
import { redisClient } from "../index.js";


export const registerUser=TryCatch(async(req,res,next)=>{
     const {name,email,password,phoneNumber,role,bio}=req.body;
     console.log("BODY:", req.body);
console.log("FILE:", req.file);
     if(!name||!email||!password||!phoneNumber||!role){
          throw new ErrorHandler(400,"please fill all details");
     }

     const existingUser = await sql`SELECT * FROM users WHERE email=${email}`;
     if(existingUser.length>0){
          throw new ErrorHandler(409,"user with this email already exists");
     }
     const hashPassword=await bcrypt.hash(password,10);

     let registeredUser;
     if(role==="recruiter"){
           const [user]=await sql`
          INSERT INTO users (name,email,password,phone_number,role)
          VALUES (${name},${email},${hashPassword},${phoneNumber},${role})
          RETURNING user_id,name,email,phone_number,role,created_at
          `;
          registeredUser=user;
     }
     else if(role==="jobseeker"){
            const file=req.file;
            if(!file){
               throw new ErrorHandler(400,"Resume file is required for jobseekers");
            }
            const fileBuffer=getBuffer(file);
            if(!fileBuffer||!fileBuffer.content){
               throw new ErrorHandler(500,"Failed to generate buffer");

            }
            console.log("UPLOAD URL:", process.env.UPLOAD_SERVICES_URL);
            const {data}=await axios.post(`${process.env.UPLOAD_SERVICES_URL}/api/utils/upload`,
                { buffer: fileBuffer.content });
            
            const [user]=await sql`     
            INSERT INTO users (name,email,password,phone_number,role,bio,resume,resume_public_id)
            VALUES (${name},${email},${hashPassword},${phoneNumber},${role},${bio},${data.url},${data.public_id})
            RETURNING user_id,name,email,phone_number,role,bio,resume,created_at
            `;
            
            registeredUser=user;
     }


            const token=jwt.sign({id:registeredUser?.user_id},
                process.env.JWT_SEC as string,
                {expiresIn:"15d" });

           res.json({
             message:"user Registered",
             registeredUser,
             token
         });
});
export const loginUser=TryCatch(async(req,res,next)=>{
     const {email,password}=req.body;
     if(!email||!password){
          throw new ErrorHandler(400,"please provide email and password");
     }

     const user=await sql`
     SELECT u.user_id,u.name,u.email,u.password,u.phone_number,u.role,u.bio,u.resume,u.profile_pic,u.subscription,
     ARRAY_AGG(s.name) FILTER (WHERE s.name IS NOT NULL) AS skills
     FROM users u
     LEFT JOIN user_skills us ON u.user_id = us.user_id
     LEFT JOIN skills s ON us.skill_id = s.skill_id
     WHERE u.email=${email}
     GROUP BY u.user_id
     `;

     if(user.length===0){
          throw new ErrorHandler(404,"Invalid credentials");
     }

     const userObject=user[0];


     const matchPassword=await bcrypt.compare(password,userObject.password);
     if(!matchPassword){
          throw new ErrorHandler(400,"Invalid credentials");
     }

     userObject.skills=userObject.skills||[];

     delete userObject.password;

     const token=jwt.sign({id:userObject?.user_id},
                process.env.JWT_SEC as string,
                {expiresIn:"15d" });
           console.log("SECRET while SIGN:", process.env.JWT_SEC);
           res.json({
             message:"user loggedin",
             userObject,
             token
         });
});

export const forgotPassword=TryCatch(async(req,res,_next)=>{
     const {email}=req.body; 
     if(!email){
          throw new ErrorHandler(400,"please provide email");
     }
     const users=await sql`
     SELECT user_id, email FROM users WHERE email=${email}
     `; 

     if(users.length===0){
          return res.json({
               message:"If that email exists,we have sent a resent link",
          });
     }

     const user=users[0];

     const resetToken=jwt.sign({
          email:user.email,
          type:"reset"
     },process.env.JWT_SEC as string,{expiresIn:"15m"});

     console.log("SECRET while VERIFY:", process.env.JWT_SEC);

     const resetLink=`${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
       
       await redisClient.set(`forgot:${email}`,resetToken,{
          EX:900,
       })


     const message={
          to:email,
          subject:"RESET YOUR PASSWORD - TalentSync",
          html:forgotPasswordTemplate(resetLink),
     }

  publishToTopic("send-mail",message).catch((error)=>{ 
    console.error("Failed to publish reset password email",error);
  });  
    res.json({
         message:"If that email exists,we have sent a resent link",
    })
});


export const resetPassword = TryCatch(async (req, res, _next) => {
     const { token: rawToken } = req.query as { token: string };
     const { password } = req.body;

     if (!rawToken) {
          throw new ErrorHandler(400, "Token missing");
     }

     if (!password) {
          throw new ErrorHandler(400, "Please provide a new password");
     }

     if (password.length < 6) {
          throw new ErrorHandler(400, "Password must be at least 6 characters");
     }

     let decoded: any;
     try {
          decoded = jwt.verify(rawToken, process.env.JWT_SEC as string);
          console.log( process.env.JWT_SEC as string);
     } catch (error) {
          throw new ErrorHandler(400, "Invalid or expired token");
     }

     const email = decoded?.email?.toLowerCase();

     if (!email || decoded?.type !== "reset") {
          throw new ErrorHandler(400, "Invalid token");
     }

     const storedToken = await redisClient.get(`forgot:${email}`);

     if (!storedToken || storedToken !== rawToken) {
          throw new ErrorHandler(400, "Token has expired or is invalid");
     }

     const hashPassword = await bcrypt.hash(password, 10);

     await sql`
     UPDATE users SET password=${hashPassword} WHERE email=${email}
     `;

     await redisClient.del(`forgot:${email}`);

     res.json({
          message: "Password changed successfully"
     });
});