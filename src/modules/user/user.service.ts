import type { Prisma } from "../../../generated/prisma/client.js";
import { uploadImage } from "../../config/cloudinary.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/AppError.js";
import type { UpdateProfileInput } from "./user.validation.js";

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const getMyProfile = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: publicUserSelect,
  });
  if (!user) {
    throw new AppError(404, "User not found");
  }
  return user;
};

const updateMyProfile = async (
  userId: string,
  payload: UpdateProfileInput,
  avatar?: Express.Multer.File,
) => {
  if (!payload.name && !payload.phone && !avatar) {
    throw new AppError(400, "Provide at least one field to update");
  }

  const avatarUrl = avatar ? (await uploadImage(avatar.buffer, "avatars")).secure_url : undefined;

  return prisma.user.update({
    where: { id: userId },
    data: { ...payload, ...(avatarUrl && { avatarUrl }) },
    select: publicUserSelect,
  });
};

export const userService = {
  getMyProfile,
  updateMyProfile,
};
