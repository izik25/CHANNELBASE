import jwt from "jsonwebtoken";
import { env } from "@channelbase/config";

export interface AccessTokenClaims {
  sub: string; // userId
  role: "USER" | "ADMIN";
  sessionId: string;
}

const TOKEN_TTL = "7d";

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenClaims;
}
