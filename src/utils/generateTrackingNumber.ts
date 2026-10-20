import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const generateTrackingNumber = () => {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ALPHABET.charAt(randomInt(ALPHABET.length));
  }
  return `PP${date}${suffix}`;
};
