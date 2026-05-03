import { Router, type IRouter } from "express";
import healthRouter from "./health";
import actionsRouter from "./actions";
import transcribeRouter from "./transcribe";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/actions", requireAuth, actionsRouter);
router.use("/transcribe", requireAuth, transcribeRouter);

export default router;
