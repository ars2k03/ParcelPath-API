import { type Options, rateLimit } from "express-rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const handler: Options["handler"] = (_req, res, _next, options) => {
  res.status(options.statusCode).json({
    success: false,
    message: "Too many requests, please try again later",
    errors: [],
  });
};

export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});

export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler,
});
