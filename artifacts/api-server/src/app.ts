import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

function resolveWebRoot(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "artifacts/clarity-web/dist/public"),
    path.resolve(process.cwd(), "dist/public"),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, "index.html"))) ?? null;
}

const app: Express = express();
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: isProduction ? (allowedOrigins.length > 0 ? allowedOrigins : false) : true,
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 600,
  }),
);

app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  skip: (req) => req.path === "/healthz" || req.path === "/api/healthz",
});
app.use("/api", apiLimiter);

app.use("/api", router);

const webRoot = resolveWebRoot();
if (webRoot) {
  logger.info({ webRoot }, "Serving Clarity web UI");
  app.use(express.static(webRoot, { index: false, fallthrough: true }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webRoot, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Request failed";
  if (message === "Unsupported audio type") {
    return res.status(415).json({ error: "Unsupported audio type" });
  }
  if (message.toLowerCase().includes("file too large")) {
    return res.status(413).json({ error: "Audio file too large" });
  }
  req.log?.error({ err: { message } }, "unhandled error");
  return res.status(500).json({ error: "Internal error" });
});

export default app;
