import { Router, type IRouter } from "express";
import healthRouter from "./health";
import thoughtsRouter from "./thoughts";
import actionsRouter from "./actions";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/thoughts", thoughtsRouter);
router.use("/actions", actionsRouter);

export default router;
