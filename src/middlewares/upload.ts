import multer from "multer";
import { AppError } from "../errors/AppError.js";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new AppError(400, "Only JPEG, PNG or WEBP images are allowed"));
  },
});
