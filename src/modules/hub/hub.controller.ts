import type { Request, RequestHandler } from "express";
import { sendResponse } from "../../utils/sendResponse.js";
import { hubService } from "./hub.service.js";
import type { HubQuery } from "./hub.validation.js";

const actorOf = (req: Request) => ({ id: req.user.id, ip: req.ip });

const createHub: RequestHandler = async (req, res) => {
  const result = await hubService.createHub(actorOf(req), req.body);
  sendResponse(res, { statusCode: 201, message: "Hub created successfully", data: result });
};

const getHubs: RequestHandler = async (req, res) => {
  const result = await hubService.getHubs(req.query as unknown as HubQuery);
  sendResponse(res, { message: "Hubs retrieved successfully", data: result });
};

const getPublicHubs: RequestHandler = async (_req, res) => {
  const result = await hubService.getPublicHubs();
  sendResponse(res, { message: "Active hubs retrieved successfully", data: result });
};

const getHubById: RequestHandler<{ id: string }> = async (req, res) => {
  const result = await hubService.getHubById(req.params.id);
  sendResponse(res, { message: "Hub retrieved successfully", data: result });
};

const updateHub: RequestHandler<{ id: string }> = async (req, res) => {
  const result = await hubService.updateHub(actorOf(req), req.params.id, req.body);
  sendResponse(res, { message: "Hub updated successfully", data: result });
};

const deleteHub: RequestHandler<{ id: string }> = async (req, res) => {
  const result = await hubService.deleteHub(actorOf(req), req.params.id);
  sendResponse(res, { message: "Hub deleted successfully", data: result });
};

export const hubController = {
  createHub,
  getHubs,
  getPublicHubs,
  getHubById,
  updateHub,
  deleteHub,
};
