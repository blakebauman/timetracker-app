import { test, expect } from "@playwright/test";
import { encryptJSON, decryptJSON } from "../src/worker/lib/crypto";

// The at-rest encryption changed how it picks a salt (one per secret, cached
// key) without changing the blob layout. Old blobs — random salt per blob —
// must keep decrypting, and two encryptions of the same value must still
// differ (random IV). Pure Web Crypto, exercised directly.
const SECRET = "e2e-secret-that-is-comfortably-longer-than-32-chars";

async function legacyEncrypt(secret: string, value: unknown): Promise<string> {
  // The pre-change algorithm: fresh random salt per blob.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value))));
  const out = new Uint8Array(16 + 12 + ct.length);
  out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
  return btoa(String.fromCharCode(...out));
}

test.describe("credential encryption", () => {
  test("round-trips, never repeats, and still reads legacy blobs", async () => {
    const value = { refreshToken: "r-1", accessToken: "a-1", expiresAt: 1, accountEmail: "x@example.com" };

    const a = await encryptJSON(SECRET, value);
    const b = await encryptJSON(SECRET, value);
    expect(a).not.toBe(b); // random IV per blob
    expect(await decryptJSON(SECRET, a)).toEqual(value);
    expect(await decryptJSON(SECRET, b)).toEqual(value);

    // Same salt for the same secret (the cache hit), different from a legacy blob's.
    expect(a.slice(0, 20)).toBe(b.slice(0, 20));
    const legacy = await legacyEncrypt(SECRET, value);
    expect(legacy.slice(0, 20)).not.toBe(a.slice(0, 20));
    expect(await decryptJSON(SECRET, legacy)).toEqual(value);

    // Wrong secret fails loudly; a missing secret is refused before any work.
    await expect(decryptJSON("another-secret-that-is-also-long-enough-123456", a)).rejects.toThrow();
    await expect(encryptJSON("", value)).rejects.toThrow(/AUTH_SECRET/);
  });
});
