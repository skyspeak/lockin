import { SignJWT, jwtVerify } from "jose";

const rawSecret = process.env.JWT_SECRET || process.env.API_SECRET;

if (!rawSecret || rawSecret.length < 32) {
  throw new Error("JWT_SECRET or API_SECRET must be set and at least 32 characters.");
}

const secret = new TextEncoder().encode(rawSecret);

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
