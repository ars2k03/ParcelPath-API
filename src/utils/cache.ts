import { getRedis } from "../config/redis.js";

export const remember = async <T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> => {
  try {
    const client = await getRedis();
    const cached = await client.get(key);
    if (cached) return JSON.parse(cached) as T;

    const value = await loader();
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    return value;
  } catch (error) {
    console.warn(`Cache unavailable for ${key}:`, (error as Error).message);
    return loader();
  }
};

export const invalidateCache = async (...patterns: string[]) => {
  try {
    const client = await getRedis();
    for (const pattern of patterns) {
      for await (const keys of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        if (keys.length > 0) await client.del(keys);
      }
    }
  } catch (error) {
    console.warn("Cache invalidation failed:", (error as Error).message);
  }
};
