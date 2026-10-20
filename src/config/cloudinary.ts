import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
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
            return reject(error ?? new Error("Image upload failed"));
          }
          resolve(result);
        },
      )
      .end(buffer);
  });
