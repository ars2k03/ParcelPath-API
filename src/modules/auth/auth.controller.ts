import type { RequestHandler } from "express";
import { sendResponse } from "../../utils/sendResponse.js";
import { authService } from "./auth.service.js";

const register: RequestHandler = async (req, res) => {
  const result = await authService.register(req.body);
  sendResponse(res, { statusCode: 201, message: "Account registered successfully", data: result });
};

const login: RequestHandler = async (req, res) => {
  const result = await authService.login(req.body);
  sendResponse(res, { message: "Logged in successfully", data: result });
};

const loginWithGoogle: RequestHandler = async (req, res) => {
  const result = await authService.loginWithGoogle(req.body.idToken);
  sendResponse(res, { message: "Logged in with Google successfully", data: result });
};

const refreshToken: RequestHandler = async (req, res) => {
  const result = await authService.refreshTokens(req.body.refreshToken);
  sendResponse(res, { message: "Tokens refreshed successfully", data: result });
};

const logout: RequestHandler = async (req, res) => {
  const result = await authService.logout(req.body.refreshToken);
  sendResponse(res, { message: "Logged out successfully", data: result });
};

export const authController = {
  register,
  login,
  loginWithGoogle,
  refreshToken,
  logout,
};
