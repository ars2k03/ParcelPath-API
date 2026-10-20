import { Router } from "express";
import { auth } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { userController } from "./user.controller.js";
import { updateProfileSchema } from "./user.validation.js";

const router = Router();

router.get("/me", auth(), userController.getMyProfile);
router.patch(
  "/me",
  auth(),
  upload.single("avatar"),
  validateRequest({ body: updateProfileSchema }),
  userController.updateMyProfile,
);

export const userRoutes = router;
