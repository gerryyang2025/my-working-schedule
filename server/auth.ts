import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
const PASSWORD_HASH_ITERATIONS = 210_000;
const PASSWORD_HASH_KEY_LENGTH = 32;
const SESSION_HASH_PREFIX = "sha256";

export type UserRole = "admin" | "scheduler" | "viewer";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  staffId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  staffId: string | null;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

function derivePasswordHash(password: string, salt: string, iterations: number): string {
  return pbkdf2Sync(password, salt, iterations, PASSWORD_HASH_KEY_LENGTH, "sha256").toString("base64url");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const digest = derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_HASH_ITERATIONS}$${salt}$${digest}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [prefix, iterationsText, salt, expectedDigest] = passwordHash.split("$");
  const iterations = Number(iterationsText);

  if (prefix !== PASSWORD_HASH_PREFIX || !Number.isInteger(iterations) || !salt || !expectedDigest) {
    return false;
  }

  const actualDigest = derivePasswordHash(password, salt, iterations);
  const actualBuffer = Buffer.from(actualDigest);
  const expectedBuffer = Buffer.from(expectedDigest);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  const digest = pbkdf2Sync(token, SESSION_HASH_PREFIX, 1, 32, "sha256").toString("base64url");
  return `${SESSION_HASH_PREFIX}$${digest}`;
}

export function toPublicAuthUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    staffId: user.staffId
  };
}
