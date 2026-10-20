import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type RequestSchemas = {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
};

export const validateRequest =
  (schemas: RequestSchemas): RequestHandler =>
  async (req, _res, next) => {
    if (schemas.params) {
      req.params = (await schemas.params.parseAsync(req.params)) as typeof req.params;
    }
    if (schemas.query) {
      const query = await schemas.query.parseAsync(req.query);
      Object.defineProperty(req, "query", { value: query, writable: true, enumerable: true });
    }
    if (schemas.body) {
      req.body = await schemas.body.parseAsync(req.body ?? {});
    }
    next();
  };
