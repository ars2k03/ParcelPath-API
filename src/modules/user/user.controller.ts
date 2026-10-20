import type { RequestHandler } from "express";
import { sendResponse } from "../../utils/sendResponse.js";
import { userService } from "./user.service.js";

const getMyProfile: RequestHandler = async (req, res) => {
  const result = await userService.getMyProfile(req.user.id);
  sendResponse(res, { message: "Profile retrieved successfully", data: result });
};

const updateMyProfile: RequestHandler = async (req, res) => {
  const result = await userService.updateMyProfile(req.user.id, req.body, req.file);
  sendResponse(res, { message: "Profile updated successfully", data: result });
};

export const userController = {
  getMyProfile,
  updateMyProfile,
};
