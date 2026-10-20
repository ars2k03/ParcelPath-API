import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { globalErrorHandler } from "./middlewares/globalErrorHandler.js";
import { notFound } from "./middlewares/notFound.js";
import { apiLimiter } from "./middlewares/rateLimiter.js";
import router from "./routes/index.js";
import { sendResponse } from "./utils/sendResponse.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) }));
app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get(["/", "/api/v1"], (_req, res) => {
  sendResponse(res, {
    message: "ParcelPath API is running",
    data: { name: "ParcelPath", version: "v1" },
  });
});

app.use("/api/v1", apiLimiter, router);
app.use(notFound);
app.use(globalErrorHandler);

export default app;
