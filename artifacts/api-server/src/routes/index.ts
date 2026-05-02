import { Router, type IRouter } from "express";
import healthRouter from "./health";
import actionsRouter from "./actions";
import transcribeRouter from "./transcribe";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/actions", actionsRouter);
router.use("/transcribe", transcribeRouter);

export default router;
