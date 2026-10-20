import type { Response } from "express";

type SuccessPayload<T> = {
  statusCode?: number;
  message: string;
  data: T;
};

export const sendResponse = <T>(
  res: Response,
  { statusCode = 200, message, data }: SuccessPayload<T>,
) => {
  res.status(statusCode).json({ success: true, message, data });
};
