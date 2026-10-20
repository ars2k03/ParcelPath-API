import { Router } from "express";
import { Role } from "../../../generated/prisma/client.js";
import { auth } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { shipmentController } from "./shipment.controller.js";
import {
  assignCourierSchema,
  cancelShipmentSchema,
  createShipmentSchema,
  priceEstimateSchema,
  shipmentIdParamSchema,
  shipmentQuerySchema,
  shipmentSearchSchema,
  trackingNumberParamSchema,
  updateShipmentSchema,
  updateStatusSchema,
} from "./shipment.validation.js";

const router = Router();

router.post(
  "/price-estimate",
  validateRequest({ body: priceEstimateSchema }),
  shipmentController.estimatePrice,
);
router.get(
  "/track/:trackingNumber",
  validateRequest({ params: trackingNumberParamSchema }),
  shipmentController.trackShipment,
);
router.get(
  "/search",
  auth(),
  validateRequest({ query: shipmentSearchSchema }),
  shipmentController.searchShipments,
);
router.get(
  "/my-assigned",
  auth(Role.COURIER),
  validateRequest({ query: shipmentQuerySchema }),
  shipmentController.getMyAssignedShipments,
);
router.get("/courier-stats", auth(Role.COURIER), shipmentController.getCourierStats);

router.post(
  "/",
  auth(Role.CUSTOMER),
  validateRequest({ body: createShipmentSchema }),
  shipmentController.createShipment,
);
router.get(
  "/",
  auth(),
  validateRequest({ query: shipmentQuerySchema }),
  shipmentController.getShipments,
);
router.get(
  "/:id",
  auth(),
  validateRequest({ params: shipmentIdParamSchema }),
  shipmentController.getShipmentById,
);
router.patch(
  "/:id",
  auth(Role.CUSTOMER),
  validateRequest({ params: shipmentIdParamSchema, body: updateShipmentSchema }),
  shipmentController.updateShipment,
);
router.delete(
  "/:id",
  auth(Role.CUSTOMER, Role.ADMIN),
  validateRequest({ params: shipmentIdParamSchema }),
  shipmentController.deleteShipment,
);

router.post(
  "/:id/assign",
  auth(Role.ADMIN),
  validateRequest({ params: shipmentIdParamSchema, body: assignCourierSchema }),
  shipmentController.assignCourier,
);
router.patch(
  "/:id/status",
  auth(Role.COURIER, Role.ADMIN),
  upload.single("proofOfDelivery"),
  validateRequest({ params: shipmentIdParamSchema, body: updateStatusSchema }),
  shipmentController.updateShipmentStatus,
);
router.post(
  "/:id/cancel",
  auth(Role.CUSTOMER, Role.ADMIN),
  validateRequest({ params: shipmentIdParamSchema, body: cancelShipmentSchema }),
  shipmentController.cancelShipment,
);

export const shipmentRoutes = router;
