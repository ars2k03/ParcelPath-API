import type { ErrorRequestHandler } from "express";
import jwt from "jsonwebtoken";
import { MulterError } from "multer";
import Stripe from "stripe";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client.js";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { handlePrismaError } from "../errors/handlePrismaError.js";
import { handleZodError } from "../errors/handleZodError.js";

const isBodyParserError = (error: unknown): error is { type: string; status: number } =>
  typeof error === "object" && error !== null && "type" in error && "status" in error;

const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return handleZodError(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) return handlePrismaError(error);
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(400, "Invalid data provided to the database");
  }
  if (error instanceof jwt.TokenExpiredError) {
    return new AppError(401, "Token has expired");
  }
  if (error instanceof jwt.JsonWebTokenError) {
    return new AppError(401, "Invalid token");
  }
  if (error instanceof MulterError) {
    return new AppError(
      400,
      error.code === "LIMIT_FILE_SIZE" ? "File is too large" : error.message,
      [{ path: error.field ?? "file", message: error.message }],
    );
  }
  if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
    return new AppError(400, "Invalid Stripe webhook signature");
  }
  if (error instanceof Stripe.errors.StripeError) {
    return new AppError(502, `Payment provider error: ${error.message}`);
  }
  if (isBodyParserError(error)) {
    if (error.type === "entity.parse.failed") return new AppError(400, "Malformed JSON body");
    if (error.type === "entity.too.large") return new AppError(413, "Request body is too large");
  }
  return new AppError(500, "Internal server error");
};

export const globalErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = normalizeError(error);

  if (appError.statusCode >= 500 || env.NODE_ENV === "development") {
    console.error(error);
  }

  res.status(appError.statusCode).json({
    success: false,
    message: appError.message,
    errors: appError.errors,
  });
};
