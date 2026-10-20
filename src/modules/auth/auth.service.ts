import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { type Role, type User, UserStatus } from "../../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { verifyGoogleIdToken } from "../../config/google.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt.js";
import { publicUserSelect } from "../user/user.service.js";
import type { LoginInput, RegisterInput } from "./auth.validation.js";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const issueTokens = async (user: { id: string; role: Role }) => {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken(user.id);
  const { exp } = verifyRefreshToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(exp * 1000),
    },
  });

  return { accessToken, refreshToken };
};

const assertCanSignIn = (user: Pick<User, "status" | "deletedAt">) => {
  if (user.deletedAt) {
    throw new AppError(401, "Invalid email or password");
  }
  if (user.status === UserStatus.BLOCKED) {
    throw new AppError(403, "Your account has been blocked");
  }
};

const withTokens = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: publicUserSelect,
  });
  return { user, ...(await issueTokens(user)) };
};

const register = async (payload: RegisterInput) => {
  const existing = await prisma.user.findUnique({
    where: { email: payload.email },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, "An account with this email already exists", [
      { path: "email", message: "Email is already registered" },
    ]);
  }

  const user = await prisma.user.create({
    data: {
      ...payload,
      password: await bcrypt.hash(payload.password, env.BCRYPT_SALT_ROUNDS),
    },
    select: { id: true },
  });

  return withTokens(user.id);
};

const login = async ({ email, password }: LoginInput) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    throw new AppError(401, "Invalid email or password");
  }
  assertCanSignIn(user);

  return withTokens(user.id);
};

const loginWithGoogle = async (idToken: string) => {
  const profile = await verifyGoogleIdToken(idToken).catch(() => {
    throw new AppError(401, "Invalid Google ID token");
  });

  if (!profile?.email || !profile.email_verified) {
    throw new AppError(401, "Google account email is not verified");
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId: profile.sub }, { email: profile.email.toLowerCase() }] },
  });

  if (existing) {
    assertCanSignIn(existing);
    if (!existing.googleId) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { googleId: profile.sub, avatarUrl: existing.avatarUrl ?? profile.picture ?? null },
      });
    }
    return withTokens(existing.id);
  }

  const user = await prisma.user.create({
    data: {
      name: profile.name ?? profile.email.split("@")[0] ?? "ParcelPath User",
      email: profile.email.toLowerCase(),
      googleId: profile.sub,
      avatarUrl: profile.picture ?? null,
    },
    select: { id: true },
  });

  return withTokens(user.id);
};

const refreshTokens = async (refreshToken: string) => {
  const { sub } = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const revoked = await prisma.refreshToken.updateMany({
    where: { tokenHash, userId: sub, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });

  if (revoked.count === 0) {
    await prisma.refreshToken.updateMany({
      where: { userId: sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, "Refresh token is invalid or has already been used");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: sub } });
  assertCanSignIn(user);

  return issueTokens(user);
};

const logout = async (refreshToken: string) => {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return null;
};

export const authService = {
  register,
  login,
  loginWithGoogle,
  refreshTokens,
  logout,
};
