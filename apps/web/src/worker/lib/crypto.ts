// AES-GCM encryption for at-rest secrets (integration credentials, calendar
// tokens). The key is derived from the global AUTH_SECRET via PBKDF2/SHA-256
// using the Web Crypto API.
//
// Stored blob layout (base64): [16-byte salt][12-byte iv][ciphertext+tag].
// The IV is random per blob, so the same plaintext never encrypts to the same
// output. The salt used to be random per blob too — which forced a fresh
// 100k-iteration PBKDF2 on *every* decrypt, i.e. on every calendar read, nudge
// poll and cron sweep. New blobs use one salt per secret (a hash of the secret
// itself, still written into the blob) so the derived key is computed once per
// isolate and cached; old blobs keep their own salt and still decrypt, they
// just pay the derivation once each. The salt never needed to be secret or
// unique per blob: with a random IV the (key, IV) pair is what must not
// repeat, and with a 32+ char random secret there is no dictionary to
// precompute against.

const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERATIONS = 100_000;
const MAX_CACHED_KEYS = 64;

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

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
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

// Module-scope caches live for the isolate. Keyed by secret + salt so a test
// (or a rotated secret) can never be served another secret's key. Bounded and
// cleared wholesale rather than LRU'd: the steady state is one entry.
const baseKeys = new Map<string, Promise<CryptoKey>>();
const derivedKeys = new Map<string, Promise<CryptoKey>>();
const defaultSalts = new Map<string, Promise<Uint8Array>>();

function baseKeyFor(secret: string): Promise<CryptoKey> {
  let p = baseKeys.get(secret);
  if (!p) {
    if (baseKeys.size >= MAX_CACHED_KEYS) baseKeys.clear();
    p = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, [
      "deriveKey",
    ]);
    baseKeys.set(secret, p);
  }
  return p;
}

function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const id = `${secret.length}:${bytesToHex(salt)}:${secret}`;
  let p = derivedKeys.get(id);
  if (!p) {
    if (derivedKeys.size >= MAX_CACHED_KEYS) derivedKeys.clear();
    p = baseKeyFor(secret).then((baseKey) =>
      crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      ),
    );
    // A failed derivation must not poison the cache.
    p.catch(() => derivedKeys.delete(id));
    derivedKeys.set(id, p);
  }
  return p;
}

/** The per-secret salt new blobs carry: the first 16 bytes of SHA-256(secret). */
function defaultSaltFor(secret: string): Promise<Uint8Array> {
  let p = defaultSalts.get(secret);
  if (!p) {
    if (defaultSalts.size >= MAX_CACHED_KEYS) defaultSalts.clear();
    p = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(`timetracker-credential-salt:${secret}`))
      .then((d) => new Uint8Array(d).slice(0, SALT_LEN));
    defaultSalts.set(secret, p);
  }
  return p;
}

/** Encrypt a JSON-serialisable value into a self-contained base64 blob. */
export async function encryptJSON(secret: string, value: unknown): Promise<string> {
  assertSecret(secret);
  const salt = await defaultSaltFor(secret);
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

/** Decrypt a blob produced by encryptJSON (any vintage) back into its typed value. */
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
