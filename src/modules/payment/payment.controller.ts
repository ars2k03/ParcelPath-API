import type { RequestHandler } from "express";
import { sendResponse } from "../../utils/sendResponse.js";
import { paymentService } from "./payment.service.js";
import type { PaymentQuery } from "./payment.validation.js";

const initiatePayment: RequestHandler = async (req, res) => {
  const result = await paymentService.initiatePayment(req.user, req.body.shipmentId);
  sendResponse(res, {
    statusCode: 201,
    message: "Checkout session created successfully",
    data: result,
  });
};

const handleWebhook: RequestHandler = async (req, res) => {
  const result = await paymentService.handleWebhook(req.body, req.get("stripe-signature"));
  sendResponse(res, { message: "Webhook processed successfully", data: result });
};

const verifySuccess: RequestHandler = async (req, res) => {
  const result = await paymentService.verifySuccess(String(req.query.session_id));
  sendResponse(res, {
    message:
      result.status === "PAID" ? "Payment verified successfully" : "Payment is still processing",
    data: result,
  });
};

const cancelCheckout: RequestHandler = async (req, res) => {
  const result = await paymentService.cancelCheckout(String(req.query.payment_id));
  sendResponse(res, { message: "Checkout cancellation handled", data: result });
};

const getMyPayments: RequestHandler = async (req, res) => {
  const result = await paymentService.getMyPayments(req.user, req.query as unknown as PaymentQuery);
  sendResponse(res, { message: "Payments retrieved successfully", data: result });
};

const getPaymentById: RequestHandler<{ id: string }> = async (req, res) => {
  const result = await paymentService.getPaymentById(req.user, req.params.id);
  sendResponse(res, { message: "Payment retrieved successfully", data: result });
};

export const paymentController = {
  initiatePayment,
  handleWebhook,
  verifySuccess,
  cancelCheckout,
  getMyPayments,
  getPaymentById,
};
