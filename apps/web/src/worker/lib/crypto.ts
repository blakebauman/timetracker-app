// AES-GCM encryption for at-rest secrets (integration credentials).
// The key is derived from the global AUTH_SECRET via PBKDF2/SHA-256 using the
// Web Crypto API, which is hardware-accelerated in Cloudflare Workers.
//
// Stored blob layout (base64): [16-byte salt][12-byte iv][ciphertext+tag].
// Salt is per-blob so the same plaintext never encrypts to the same output.

const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERATIONS = 100_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// TextEncoder coerces undefined to the literal string "undefined", so an unset
// AUTH_SECRET would silently derive a publicly-known constant key and encryption
// would appear to work. Fail loudly instead.
function assertSecret(secret: string | undefined): asserts secret is string {
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set — refusing to encrypt/decrypt credentials (wrangler secret put AUTH_SECRET)",
    );
  }
}

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt a JSON-serialisable value into a self-contained base64 blob. */
export async function encryptJSON(secret: string, value: unknown): Promise<string> {
  assertSecret(secret);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(secret, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );

  const out = new Uint8Array(salt.length + iv.length + ciphertext.length);
  out.set(salt, 0);
  out.set(iv, salt.length);
  out.set(ciphertext, salt.length + iv.length);
  return bytesToBase64(out);
}

/** Decrypt a blob produced by encryptJSON back into its typed value. */
export async function decryptJSON<T>(secret: string, blob: string): Promise<T> {
  assertSecret(secret);
  const bytes = base64ToBytes(blob);
  const salt = bytes.slice(0, SALT_LEN);
  const iv = bytes.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = bytes.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(secret, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
