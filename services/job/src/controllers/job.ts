import { TryCatch } from "../utils/TryCatch.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import ErrorHandler from "../utils/errorHandler.js";
import { sql } from "../utils/db.js";
import axios from "axios";
import getBuffer from "../utils/buffer.js";
import { applicationStatusUpdateTemplate } from "../template.js";
import { publishToTopic } from "../producer.js";

export const createCompany =TryCatch(async(req:AuthenticatedRequest,res)=>{
   
    const user=req.user;

    if(!user){
        throw new ErrorHandler(401,"Authentication required");
    }

    if(user.role !== "recruiter"){
        throw new ErrorHandler(403,"Forbidden: Only recruiter can create a company");
    }

    const {name,description,website}=req.body;

    if(!name||!description||!website){
        throw new ErrorHandler(400,"All field are required")
    }

    const existingCompanies = await sql`
  SELECT company_id FROM companies WHERE name=${name}
`;

    if(existingCompanies.length>0){
        throw new ErrorHandler(409,`A company with the name ${name} already exists`);
    }
    const file=req.file;
    if(!file){
        throw new ErrorHandler(400,"Company Logo file is required");
    }

    const fileBuffer =getBuffer(file);

    if(!fileBuffer||!fileBuffer.content){
        throw new ErrorHandler(500,"Failed to create file buffer");
    }

    const {data}= await axios.post(`${process.env.UPLOAD_SERVICES_URL}/api/utils/upload`,{buffer:fileBuffer.content});

    const [newCompany]=await sql `INSERT INTO companies (name,description,website,logo,logo_public_id,recruiter_id) VALUES (${name},${description},${website},${data.url},${data.public_id},${req.user?.user_id}) RETURNING *`;

    res.json({
        message:"Company created successfully",
        company:newCompany,
    })
})


export const deleteCompany = TryCatch(async(req:AuthenticatedRequest,res)=>{
    const user=req.user;  
    
    const {companyId}=req.params;

    const company=await sql `SELECT logo_public_id FROM companies WHERE company_id=${companyId} AND recruiter_id=${user?.user_id}`;

    if(!company){
        throw new ErrorHandler(404,"Company not found or you don't have permission to delete it");
    }

    await sql `DELETE FROM companies WHERE company_id=${companyId}`;

    res.json({
        message:"Company and all its associated jobs and applications deleted successfully"
    })

});

export const createJob = TryCatch(async(req:AuthenticatedRequest,res)=>{
    const user=req.user;
    if(!user){
        throw new ErrorHandler(401,"Authentication required");
    }
    
    if(user.role !== "recruiter"){
        throw new ErrorHandler(403,"Forbidden: Only recruiter can create a job");
    }


    const {title,description,salary,location,job_type,openings,role,work_location,company_id}=req.body;

    if(!title||!description||!job_type||!openings||!role||!work_location||!company_id){
        throw new ErrorHandler(400,"All fields except salary and location are required");
    }   

    if(!title||!description||!salary||!location||!openings||!role){
        throw new ErrorHandler(400,"All field are required")
    }

    const company=await sql `SELECT company_id FROM companies WHERE company_id=${company_id} AND recruiter_id=${user?.user_id}`;

    if(!company){
        throw new ErrorHandler(404,"Company not found ");
    }

    const [newJob]=await sql `INSERT INTO jobs (title,description,salary,location,job_type,openings,role,work_location,company_id,posted_by_recruiter_id) VALUES (${title},${description},${salary},${location},${job_type},${openings},${role},${work_location},${company_id},${user.user_id}) RETURNING *`;

    res.json({
        message:"Job created successfully",
        job:newJob,
    });
});


export const updateJob = TryCatch(async(req:AuthenticatedRequest,res)=>{  
        const user=req.user;
    if(!user){
        throw new ErrorHandler(401,"Authentication required");
    }
    
    if(user.role !== "recruiter"){
        throw new ErrorHandler(403,"Forbidden: Only recruiter can create a job");
    }


    const {title,description,salary,location,job_type,openings,role,work_location,company_id,is_active,}=req.body;

    const [existingJob]=await sql `SELECT posted_by_recruiter_id FROM jobs WHERE job_id=${req.params.jobId} `;

    if(!existingJob){
        throw new ErrorHandler(404,"Job not found");
    }

    if(existingJob.posted_by_recruiter_id !== user.user_id){
        throw new ErrorHandler(403,"Forbidden: You are not allowed");
    }

    const [updatedJob]=await sql `UPDATE jobs SET 
    title=${title}, 
    description=${description} ,salary=${salary}, 
    location=${location}, job_type=${job_type},
    openings=${openings}, 
    role=${role},
    work_location=${work_location}, is_active=${is_active} WHERE job_id=${req.params.jobId} RETURNING *`;

    res.json({
        message:"Job updated successfully",
        job:updatedJob,
    });

  });

  export const getAllCompany=TryCatch(async(req:AuthenticatedRequest,res)=>{  
    const companies=await sql `SELECT * FROM companies WHERE recruiter_id=${req.user?.user_id}`;

    res.json({
        companies,  
    });
    });

    export const getCompanyDetails=TryCatch(async(req:AuthenticatedRequest,res)=>{
        const {companyId}=req.params;
         
        if(!companyId){
            throw new ErrorHandler(400,"Company ID is required");
        }
        const [companyData]=await sql `SELECT c.*,COALESCE(
        (
        SELECT JSON_AGG(j.*) 
        FROM  jobs j WHERE c.company_id = j.company_id 
        ),
        '[]'::JSON
        ) AS jobs FROM companies c WHERE c.company_id=${companyId} 
         GROUP BY c.company_id ;
    `; 
    
        if(!companyData){
            throw new ErrorHandler(404,"Company not found");
        }
        res.json({
            companyData
        });
    });

    export const getAllActiveJobs=TryCatch(async(req:AuthenticatedRequest,res)=>{   
        const{title,location,}=req.query as{
            title?:string;
            location?:string;
        };

       let querySting=`SELECT j.job_id,j.title,j.description,j.salary,j.location,j.job_type,j.role,j.work_location,j.created_at,c.name AS company_name,c.logo AS company_logo,c.company_id AS company_id  FROM jobs j JOIN companies c ON j.company_id = c.company_id WHERE j.is_active=true `;
        
        const values=[];
        let paramIndex=1;

        if(title && title.trim()){
            querySting+=` AND j.title ILIKE $${paramIndex}`;
            values.push(`%${title.trim()}%`);
            paramIndex++;
        } 
        
        if(location && location.trim()){
            querySting+=` AND j.location ILIKE $${paramIndex}`;
           values.push(`%${location.trim()}%`);
            paramIndex++;
        } 

        querySting+=" ORDER BY j.created_at DESC";
        

        const jobs=(await sql.query(querySting,values)) as any[];

        res.json({
            jobs,
        });
    });
     


 export const getSingleJob=TryCatch(async(req:AuthenticatedRequest,res)=>{
    const [job]=await sql `SELECT * FROM jobs WHERE job_id=${req.params.jobId}`;

    res.json(job);
    });

export const getAllApplicationsForJob=TryCatch(async(req:AuthenticatedRequest,res)=>{ 
    
    
    const user=req.user;
    
    if(!user){
        throw new ErrorHandler(401,"Authentication required");
    }
    if(user.role !== "recruiter"){
        throw new ErrorHandler(403,"Forbidden: Only recruiter can view applications");
    }

    const {jobId}=req.params;
    const [job]=await sql `
    SELECT posted_by_recruiter_id FROM jobs WHERE job_id=${jobId}`;

    if(!job){
        throw new ErrorHandler(404,"Job not found");
    }
   

    if(job.posted_by_recruiter_id !== user.user_id){
        throw new ErrorHandler(403,"Forbidden: You are not allowed to view applications for this job");
    }

    const applications=await sql `SELECT * FROM applications  WHERE job_id=${jobId} ORDER BY subscribed DESC,applied_at ASC`;
    
    res.json(applications );
 });


 export const updateApplication=TryCatch(async(req:AuthenticatedRequest,res)=>{
    const user=req.user;
     if(!user){
        throw new ErrorHandler(401,"Authentication required");
    }
    if(user.role !== "recruiter"){
        throw new ErrorHandler(403,"Forbidden: Only recruiter can view applications");
    }

    const {applicationId}=req.params;
    const [application]= await sql `SELECT * FROM applications WHERE application_id=${applicationId}`;

    if(!application){
        throw new ErrorHandler(404,"Application not found");
    }

    const[job]=await sql `SELECT posted_by_recruiter_id,title FROM jobs WHERE job_id=${application.job_id}`;

    if(!job){
        throw new ErrorHandler(404,"Job not found");
    }

    if(job.posted_by_recruiter_id !== user.user_id){
        throw new ErrorHandler(403,"Forbidden: You are not allowed to update application for this job");
    }

    const [updatedApplication]=await sql `UPDATE applications SET status=${req.body.status} WHERE application_id=${applicationId} RETURNING *`;

    const message={
        to:application.applicant_email,
        subject:"Application Update -Job portal",
        html:applicationStatusUpdateTemplate(job.title),
    }

    publishToTopic("send-mail",message).catch((error)=>{
        console.error("Failed to publish message to Kafka:", error);
    });

    res.json({
        message:"Application updated successfully",
        job,
        updatedApplication,
    })
 });