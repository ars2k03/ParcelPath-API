import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const getPagination = (page: number, limit: number) => ({
  skip: (page - 1) * limit,
  take: limit,
});

export const buildPaginatedResult = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
) => ({
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
  items,
});
