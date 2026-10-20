import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { AppError } from "../errors/AppError.js";
import { env } from "./env.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const uploadImage = (buffer: Buffer, folder: string) =>
  new Promise<UploadApiResponse>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder: `parcelpath/${folder}`, resource_type: "image" },
        (error, result) => {
          if (error || !result) {
            console.error("Cloudinary upload failed:", error);
            return reject(
              new AppError(502, `Image upload failed: ${error?.message ?? "no response"}`),
            );
          }
          resolve(result);
        },
      )
      .end(buffer);
  });
