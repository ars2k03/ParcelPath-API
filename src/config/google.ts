import { OAuth2Client } from "google-auth-library";
import { env } from "./env.js";

const googleClient = new OAuth2Client();

export const verifyGoogleIdToken = async (idToken: string) => {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
};
