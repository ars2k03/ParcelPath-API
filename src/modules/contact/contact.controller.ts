import type { RequestHandler } from "express";
import { sendResponse } from "../../utils/sendResponse.js";
import { contactService } from "./contact.service.js";
import type { ContactQuery } from "./contact.validation.js";

const createMessage: RequestHandler = async (req, res) => {
  const result = await contactService.createMessage(req.body);
  sendResponse(res, { statusCode: 201, message: "Message sent successfully", data: result });
};

const getMessages: RequestHandler = async (req, res) => {
  const result = await contactService.getMessages(req.query as unknown as ContactQuery);
  sendResponse(res, { message: "Messages retrieved successfully", data: result });
};

const updateMessage: RequestHandler<{ id: string }> = async (req, res) => {
  const result = await contactService.updateMessage(req.params.id, req.body.isRead);
  sendResponse(res, { message: "Message updated successfully", data: result });
};

export const contactController = {
  createMessage,
  getMessages,
  updateMessage,
};
