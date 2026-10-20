import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { buildPaginatedResult, getPagination } from "../../utils/pagination.js";
import type { ContactQuery, CreateContactMessageInput } from "./contact.validation.js";

const createMessage = (payload: CreateContactMessageInput) =>
  prisma.contactMessage.create({
    data: payload,
    select: { id: true, createdAt: true },
  });

const getMessages = async (query: ContactQuery) => {
  const { page, limit, sortOrder, searchTerm, isRead } = query;

  const where: Prisma.ContactMessageWhereInput = {
    ...(isRead !== undefined && { isRead }),
    ...(searchTerm && {
      OR: [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { email: { contains: searchTerm, mode: "insensitive" } },
        { subject: { contains: searchTerm, mode: "insensitive" } },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: sortOrder },
      ...getPagination(page, limit),
    }),
    prisma.contactMessage.count({ where }),
  ]);

  return buildPaginatedResult(items, total, page, limit);
};

const updateMessage = async (id: string, isRead: boolean) => {
  const existing = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError(404, "Message not found");
  }
  return prisma.contactMessage.update({ where: { id }, data: { isRead } });
};

export const contactService = {
  createMessage,
  getMessages,
  updateMessage,
};
