import { Router } from "express";
import { Role } from "../../../generated/prisma/client.js";
import { auth } from "../../middlewares/auth.js";
import { contactLimiter } from "../../middlewares/rateLimiter.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { contactController } from "./contact.controller.js";
import {
  contactIdParamSchema,
  contactQuerySchema,
  createContactMessageSchema,
  updateContactMessageSchema,
} from "./contact.validation.js";

const router = Router();

router.post(
  "/",
  contactLimiter,
  validateRequest({ body: createContactMessageSchema }),
  contactController.createMessage,
);
router.get(
  "/",
  auth(Role.ADMIN),
  validateRequest({ query: contactQuerySchema }),
  contactController.getMessages,
);
router.patch(
  "/:id",
  auth(Role.ADMIN),
  validateRequest({ params: contactIdParamSchema, body: updateContactMessageSchema }),
  contactController.updateMessage,
);

export const contactRoutes = router;
