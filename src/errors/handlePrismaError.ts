import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "./AppError.js";

const getTargetFields = (error: Prisma.PrismaClientKnownRequestError) => {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(", ");
  if (typeof target === "string") return target;
  return "field";
};

export const handlePrismaError = (error: Prisma.PrismaClientKnownRequestError) => {
  switch (error.code) {
    case "P2002": {
      const fields = getTargetFields(error);
      return new AppError(409, `A record with this ${fields} already exists`, [
        { path: fields, message: "Value must be unique" },
      ]);
    }
    case "P2003":
      return new AppError(400, "Referenced record does not exist");
    case "P2025":
      return new AppError(404, "Requested record was not found");
    default:
      return new AppError(400, "Database request could not be processed");
  }
};
