import express from 'express'
import { isAuth } from '../middleware/auth.js';
import { createCompany, deleteCompany ,createJob, updateJob, getAllCompany, getCompanyDetails, getAllActiveJobs, getSingleJob, getAllApplicationsForJob, updateApplication} from '../controllers/job.js';
import uploadFile from '../middleware/multer.js';

const router=express.Router();

router.post("/company/new",isAuth,uploadFile,createCompany);

router.delete("/company/:companyId",isAuth,deleteCompany);

router.post("/new",isAuth,createJob);
router.put("/:jobId",isAuth,updateJob);
router.get("/company/all",isAuth,getAllCompany);
router.get("/company/:companyId",isAuth,getCompanyDetails);
router.get("/all",getAllActiveJobs);
router.get("/:jobId",isAuth,getSingleJob);
router.get("/application/:jobId",isAuth,getAllApplicationsForJob);
router.put("/application/update/:applicationId",isAuth,updateApplication);


export default router;