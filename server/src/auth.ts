import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

const COOKIE_NAME = "vip_session";
const TOKEN_TTL_DAYS = 30;

// Read the secret lazily so it's resolved after dotenv has loaded .env.
let cachedSecret: string | null = null;
function secret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) {
    cachedSecret = fromEnv;
  } else {
    cachedSecret = randomBytes(32).toString("hex");
    console.warn(
      "\n⚠️  JWT_SECRET is not set — using a temporary secret. Sessions will reset on\n" +
        "   restart. Set JWT_SECRET in .env for stable logins.\n",
    );
  }
  return cachedSecret;
}

export interface AuthedRequest extends Request {
  userId?: string;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function setSessionCookie(res: Response, userId: string): void {
  const token = jwt.sign({ uid: userId }, secret(), { expiresIn: `${TOKEN_TTL_DAYS}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    // Require HTTPS in production (Azure terminates TLS; trust proxy is set on the app).
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

/** Express middleware: require a valid session cookie; sets req.userId. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  try {
    const payload = jwt.verify(token, secret()) as { uid: string };
    (req as AuthedRequest).userId = payload.uid;
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}
