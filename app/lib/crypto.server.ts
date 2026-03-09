// app/lib/crypto.server.ts
// Symmetric encryption using Node.js built-in AES-256-GCM
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const IV_BYTES = 12; // 96-bit IV for GCM
const AUTH_TAG_BYTES = 16;

function getKey(): Buffer {
  const keyB64 = process.env.ENCRYPTION_KEY;
  if (!keyB64) throw new Error("ENCRYPTION_KEY not set");
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes");
  return key;
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string: IV (12 bytes) + authTag (16 bytes) + ciphertext
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt a previously encrypted string.
 */
export async function decrypt(encryptedB64: string): Promise<string> {
  const key = getKey();
  const combined = Buffer.from(encryptedB64, "base64");
  const iv = combined.subarray(0, IV_BYTES);
  const authTag = combined.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = combined.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Safely decrypt – returns empty string on error (for optional fields).
 */
export async function safeDecrypt(encryptedB64: string): Promise<string> {
  if (!encryptedB64) return "";
  try {
    return await decrypt(encryptedB64);
  } catch {
    return "";
  }
}
