import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { Role } from "../../generated/prisma/client.js";
import { env } from "../config/env.js";

export type AccessTokenPayload = {
  sub: string;
  role: Role;
};

export const signAccessToken = (payload: AccessTokenPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
  });

export const signRefreshToken = (userId: string) =>
  jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
    jwtid: randomUUID(),
  });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload & AccessTokenPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload & { sub: string; exp: number };
