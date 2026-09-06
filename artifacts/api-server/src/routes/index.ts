import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import communityRouter from "./community";
import contactRouter from "./contact";
import messagingRouter from "./messaging";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(communityRouter);
router.use(contactRouter);
router.use(messagingRouter);

export default router;
