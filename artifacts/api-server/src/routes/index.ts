import { Router, type IRouter } from "express";
import healthRouter from "./health";
import actionsRouter from "./actions";
import transcribeRouter from "./transcribe";
import followUpPlansRouter from "./followUpPlans";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/actions", requireAuth, actionsRouter);
router.use("/transcribe", requireAuth, transcribeRouter);
router.use("/follow-up-plans", requireAuth, followUpPlansRouter);

export default router;
