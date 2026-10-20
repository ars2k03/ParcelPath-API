import { createClient } from "redis";
import { env } from "./env.js";

export const redis = createClient({
  url: env.REDIS_URL,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) =>
      retries > 3 ? new Error("Redis connection failed") : Math.min(retries * 200, 1000),
  },
});

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
