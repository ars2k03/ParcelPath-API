import { Router } from "express";
import { Role } from "../../../generated/prisma/client.js";
import { auth } from "../../middlewares/auth.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { hubController } from "./hub.controller.js";
import {
  createHubSchema,
  hubIdParamSchema,
  hubQuerySchema,
  updateHubSchema,
} from "./hub.validation.js";

const router = Router();

router.post(
  "/",
  auth(Role.ADMIN),
  validateRequest({ body: createHubSchema }),
  hubController.createHub,
);
router.get("/public", hubController.getPublicHubs);
router.get("/", auth(), validateRequest({ query: hubQuerySchema }), hubController.getHubs);
router.get("/:id", auth(), validateRequest({ params: hubIdParamSchema }), hubController.getHubById);
router.patch(
  "/:id",
  auth(Role.ADMIN),
  validateRequest({ params: hubIdParamSchema, body: updateHubSchema }),
  hubController.updateHub,
);
router.delete(
  "/:id",
  auth(Role.ADMIN),
  validateRequest({ params: hubIdParamSchema }),
  hubController.deleteHub,
);

export const hubRoutes = router;
