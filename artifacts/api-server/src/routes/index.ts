import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import communityRouter from "./community";
import contactRouter from "./contact";
import messagingRouter from "./messaging";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(communityRouter);
router.use(contactRouter);
router.use(messagingRouter);
router.use(notificationsRouter);

export default router;
