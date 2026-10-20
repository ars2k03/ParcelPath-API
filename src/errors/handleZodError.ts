import type { ZodError } from "zod";
import { AppError } from "./AppError.js";

export const handleZodError = (error: ZodError) =>
  new AppError(
    400,
    "Validation failed",
    error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  );
