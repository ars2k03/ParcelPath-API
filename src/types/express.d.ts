import type { Role } from "../../generated/prisma/client.js";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}
