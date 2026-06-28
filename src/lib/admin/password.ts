import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "scrypt:v1";
const KEY_LENGTH = 64;

export function hashAdminPassword(password: string, salt = randomBytes(16).toString("hex")) {
  if (!password) {
    throw new Error("Admin password is required.");
  }

  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `${HASH_PREFIX}:${salt}:${hash}`;
}

export function verifyAdminPassword(password: string, storedHash: string) {
  const [algorithm, version, salt, expectedHash] = storedHash.split(":");

  if (`${algorithm}:${version}` !== HASH_PREFIX || !salt || !expectedHash) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, KEY_LENGTH).toString("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.byteLength !== expected.byteLength) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
