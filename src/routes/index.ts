import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.route.js";
import { hubRoutes } from "../modules/hub/hub.route.js";
import { shipmentRoutes } from "../modules/shipment/shipment.route.js";
import { userRoutes } from "../modules/user/user.route.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/hubs", hubRoutes);
router.use("/shipments", shipmentRoutes);

export default router;
