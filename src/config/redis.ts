import { createClient } from "redis";
import { env } from "./env.js";

export const redis = createClient({ url: env.REDIS_URL });

redis.on("error", (error) => {
  console.error("Redis error:", error.message);
});

let connecting: Promise<unknown> | null = null;

export const getRedis = async () => {
  if (!redis.isOpen) {
    connecting ??= redis.connect().finally(() => {
      connecting = null;
    });
    await connecting;
  }
  return redis;
};
