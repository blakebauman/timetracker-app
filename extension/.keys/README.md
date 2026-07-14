# Extension signing key

This directory holds the RSA private key that pins the extension's ID. **It is
gitignored — never commit `extension.pem`.** Only the corresponding *public* key
is committed, as the `"key"` field in `../manifest.json`.

Pinning the ID lets the worker trust the extension by origin
(`chrome-extension://<id>` in `trustedOrigins`, see `src/worker/auth.ts`) in both
local dev (unpacked) and production.

## Current values

- **Extension ID:** `nogikmhdpnnedmfldanickgpikmifcje`
- **Public key:** in `manifest.json` `"key"`.

## Regenerating (only if the key is lost — this changes the ID)

```bash
openssl genrsa > extension/.keys/extension.pem            # private key (keep secret)

# manifest "key" value (public key, base64 DER):
openssl rsa -in extension/.keys/extension.pem -pubout -outform DER | base64 | tr -d '\n'

# derive the extension ID:
openssl rsa -in extension/.keys/extension.pem -pubout -outform DER \
  | openssl dgst -sha256 -binary | xxd -p -c 32 | head -c 32 | tr '0-9a-f' 'a-p'
```

If you regenerate, update `manifest.json` `"key"` and the `chrome-extension://<id>`
entry in `src/worker/auth.ts` `trustedOrigins`.
