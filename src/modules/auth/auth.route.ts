import { Router } from "express";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { authController } from "./auth.controller.js";
import {
  googleLoginSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from "./auth.validation.js";

const router = Router();

router.post(
  "/register",
  authLimiter,
  validateRequest({ body: registerSchema }),
  authController.register,
);
router.post("/login", authLimiter, validateRequest({ body: loginSchema }), authController.login);
router.post(
  "/google",
  authLimiter,
  validateRequest({ body: googleLoginSchema }),
  authController.loginWithGoogle,
);
router.post(
  "/refresh-token",
  validateRequest({ body: refreshTokenSchema }),
  authController.refreshToken,
);
router.post("/logout", validateRequest({ body: refreshTokenSchema }), authController.logout);

export const authRoutes = router;
