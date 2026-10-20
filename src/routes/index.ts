import { Router } from "express";
import { adminRoutes } from "../modules/admin/admin.route.js";
import { authRoutes } from "../modules/auth/auth.route.js";
import { contactRoutes } from "../modules/contact/contact.route.js";
import { hubRoutes } from "../modules/hub/hub.route.js";
import { paymentRoutes } from "../modules/payment/payment.route.js";
import { shipmentRoutes } from "../modules/shipment/shipment.route.js";
import { userRoutes } from "../modules/user/user.route.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/hubs", hubRoutes);
router.use("/shipments", shipmentRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin", adminRoutes);
router.use("/contact", contactRoutes);

export default router;
