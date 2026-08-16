import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import actionsRouter from "./actions";
import captureRouter from "./capture";
import transcribeRouter from "./transcribe";
import followUpPlansRouter from "./followUpPlans";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/capture", requireAuth, captureRouter);
router.use("/actions", requireAuth, actionsRouter);
router.use("/transcribe", requireAuth, transcribeRouter);
router.use("/follow-up-plans", requireAuth, followUpPlansRouter);

export default router;
