import type { RequestHandler } from "express";
import { type Role, UserStatus } from "../../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../errors/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const auth =
  (...roles: Role[]): RequestHandler =>
  async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "Authentication token is missing");
    }

    const payload = verifyAccessToken(header.slice(7));
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, role: true, status: true },
    });

    if (!user) {
      throw new AppError(401, "User account no longer exists");
    }
    if (user.status === UserStatus.BLOCKED) {
      throw new AppError(403, "Your account has been blocked");
    }
    if (roles.length > 0 && !roles.includes(user.role)) {
      throw new AppError(403, "You do not have permission to perform this action");
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  };
