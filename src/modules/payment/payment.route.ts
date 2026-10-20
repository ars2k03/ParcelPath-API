import { Router } from "express";
import { Role } from "../../../generated/prisma/client.js";
import { auth } from "../../middlewares/auth.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { paymentController } from "./payment.controller.js";
import {
  initiatePaymentSchema,
  paymentCancelQuerySchema,
  paymentIdParamSchema,
  paymentQuerySchema,
  paymentSuccessQuerySchema,
} from "./payment.validation.js";

const router = Router();

router.post("/webhook", paymentController.handleWebhook);
router.post(
  "/initiate",
  auth(Role.CUSTOMER),
  validateRequest({ body: initiatePaymentSchema }),
  paymentController.initiatePayment,
);
router.get(
  "/success",
  validateRequest({ query: paymentSuccessQuerySchema }),
  paymentController.verifySuccess,
);
router.get(
  "/cancel",
  validateRequest({ query: paymentCancelQuerySchema }),
  paymentController.cancelCheckout,
);
router.get(
  "/my",
  auth(Role.CUSTOMER),
  validateRequest({ query: paymentQuerySchema }),
  paymentController.getMyPayments,
);
router.get(
  "/:id",
  auth(),
  validateRequest({ params: paymentIdParamSchema }),
  paymentController.getPaymentById,
);

export const paymentRoutes = router;
