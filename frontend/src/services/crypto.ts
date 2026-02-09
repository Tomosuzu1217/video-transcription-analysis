/**
 * AES-GCM encryption for API keys at rest.
 * Uses the shared password hash (VITE_APP_PASSWORD_HASH) as key material.
 * Encrypted values are prefixed with "enc:" for migration detection.
 */

const PASSWORD_HASH = import.meta.env.VITE_APP_PASSWORD_HASH as string;
const ENC_PREFIX = "enc:";

/** When true, encryption is unavailable — store plain text */
const ENCRYPTION_DISABLED = !PASSWORD_HASH;

let _aesKey: CryptoKey | null = null;

async function getAesKey(): Promise<CryptoKey> {
  if (_aesKey) return _aesKey;

  if (!PASSWORD_HASH) {
    throw new Error("暗号化キーが設定されていません (VITE_APP_PASSWORD_HASH)");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PASSWORD_HASH),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  _aesKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("video-cm-analysis-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return _aesKey;
}

export async function encryptString(plaintext: string): Promise<string> {
  if (ENCRYPTION_DISABLED) return plaintext;
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  // Pack: iv (12 bytes) + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Base64 encode and prefix
  const base64 = btoa(String.fromCharCode(...combined));
  return ENC_PREFIX + base64;
}

export async function decryptString(encrypted: string): Promise<string> {
  if (!encrypted.startsWith(ENC_PREFIX)) {
    // Not encrypted (legacy plain text) - return as-is
    return encrypted;
  }
  if (ENCRYPTION_DISABLED) {
    // Cannot decrypt without a key — return raw value
    return encrypted;
  }

  const key = await getAesKey();
  const base64 = encrypted.slice(ENC_PREFIX.length);
  const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

export async function encryptApiKeys(keys: string[]): Promise<string[]> {
  return Promise.all(keys.map(encryptString));
}

export async function decryptApiKeys(keys: string[]): Promise<string[]> {
  return Promise.all(keys.map(decryptString));
}
