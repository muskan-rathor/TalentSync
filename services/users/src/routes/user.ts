import express from 'express';
import { isAuth } from '../middleware/auth.js';
import {updateProfile, getUserProfile, myProfile, updateProfilePic, updateResume, addSkillToUser, deleteSkillFromUser, applyForJob, getAllApplications } from '../controllers/user.js';
import uploadFile from '../middleware/multer.js';



const router=express.Router();

router.get("/me",isAuth,myProfile);
router.get("/:userId",isAuth,getUserProfile); 
router.put("/update/profile",isAuth,updateProfile); 
router.put("/update/pic",isAuth,uploadFile,updateProfilePic); 
router.put("/update/resume",isAuth,uploadFile,updateResume); 
router.post("/skill/add",isAuth,addSkillToUser);
router.delete("/skill/delete",isAuth,deleteSkillFromUser);
router.post("/apply/job",isAuth,applyForJob);
router.get("/application/all",isAuth,getAllApplications);

export default router;