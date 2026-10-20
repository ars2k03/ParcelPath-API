import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "./AppError.js";

type DriverAdapterCause = {
  table?: string;
  constraint?: { index?: string; fields?: string[] };
};

const getDuplicateField = (error: Prisma.PrismaClientKnownRequestError) => {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(", ");

  const cause = (error.meta?.driverAdapterError as { cause?: DriverAdapterCause } | undefined)
    ?.cause;
  if (cause?.constraint?.fields) return cause.constraint.fields.join(", ");
  if (cause?.constraint?.index) {
    return cause.constraint.index.replace(`${cause.table}_`, "").replace(/_key$/, "");
  }
  return "field";
};

export const handlePrismaError = (error: Prisma.PrismaClientKnownRequestError) => {
  switch (error.code) {
    case "P2002": {
      const field = getDuplicateField(error);
      return new AppError(409, `A record with this ${field} already exists`, [
        { path: field, message: `${field} must be unique` },
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
