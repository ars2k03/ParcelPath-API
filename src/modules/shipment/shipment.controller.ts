import type { Request, RequestHandler } from "express";
import { sendResponse } from "../../utils/sendResponse.js";
import { shipmentService } from "./shipment.service.js";
import type { ShipmentQuery, ShipmentSearchQuery } from "./shipment.validation.js";

type IdParams = { id: string };

const actorOf = (req: Request) => ({ ...req.user, ip: req.ip });

const estimatePrice: RequestHandler = async (req, res) => {
  const result = await shipmentService.estimatePrice(req.body);
  sendResponse(res, { message: "Delivery charge calculated successfully", data: result });
};

const createShipment: RequestHandler = async (req, res) => {
  const result = await shipmentService.createShipment(actorOf(req), req.body);
  sendResponse(res, { statusCode: 201, message: "Shipment created successfully", data: result });
};

const getShipments: RequestHandler = async (req, res) => {
  const result = await shipmentService.getShipments(
    req.user,
    req.query as unknown as ShipmentQuery,
  );
  sendResponse(res, { message: "Shipments retrieved successfully", data: result });
};

const searchShipments: RequestHandler = async (req, res) => {
  const result = await shipmentService.searchShipments(
    req.user,
    req.query as unknown as ShipmentSearchQuery,
  );
  sendResponse(res, { message: "Search results retrieved successfully", data: result });
};

const getMyAssignedShipments: RequestHandler = async (req, res) => {
  const result = await shipmentService.getMyAssignedShipments(
    req.user,
    req.query as unknown as ShipmentQuery,
  );
  sendResponse(res, { message: "Assigned shipments retrieved successfully", data: result });
};

const getCourierStats: RequestHandler = async (req, res) => {
  const result = await shipmentService.getCourierStats(req.user);
  sendResponse(res, { message: "Courier statistics retrieved successfully", data: result });
};

const trackShipment: RequestHandler<{ trackingNumber: string }> = async (req, res) => {
  const result = await shipmentService.trackShipment(req.params.trackingNumber);
  sendResponse(res, { message: "Shipment tracking retrieved successfully", data: result });
};

const getShipmentById: RequestHandler<IdParams> = async (req, res) => {
  const result = await shipmentService.getShipmentById(req.user, req.params.id);
  sendResponse(res, { message: "Shipment retrieved successfully", data: result });
};

const updateShipment: RequestHandler<IdParams> = async (req, res) => {
  const result = await shipmentService.updateShipment(actorOf(req), req.params.id, req.body);
  sendResponse(res, { message: "Shipment updated successfully", data: result });
};

const deleteShipment: RequestHandler<IdParams> = async (req, res) => {
  const result = await shipmentService.deleteShipment(actorOf(req), req.params.id);
  sendResponse(res, { message: "Shipment deleted successfully", data: result });
};

const assignCourier: RequestHandler<IdParams> = async (req, res) => {
  const result = await shipmentService.assignCourier(
    actorOf(req),
    req.params.id,
    req.body.courierId,
  );
  sendResponse(res, { message: "Courier assigned successfully", data: result });
};

const updateShipmentStatus: RequestHandler<IdParams> = async (req, res) => {
  const result = await shipmentService.updateShipmentStatus(
    actorOf(req),
    req.params.id,
    req.body,
    req.file,
  );
  sendResponse(res, { message: "Shipment status updated successfully", data: result });
};

const cancelShipment: RequestHandler<IdParams> = async (req, res) => {
  const result = await shipmentService.cancelShipment(actorOf(req), req.params.id, req.body.reason);
  sendResponse(res, { message: "Shipment cancelled successfully", data: result });
};

export const shipmentController = {
  estimatePrice,
  createShipment,
  getShipments,
  searchShipments,
  getMyAssignedShipments,
  getCourierStats,
  trackShipment,
  getShipmentById,
  updateShipment,
  deleteShipment,
  assignCourier,
  updateShipmentStatus,
  cancelShipment,
};
