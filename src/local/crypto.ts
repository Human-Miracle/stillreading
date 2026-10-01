/**
 * End-to-end encryption for private reflections (Web Crypto, browsers and Node).
 *
 * Each reader has a random 256-bit note key. Notes are sealed with AES-GCM under that key. The key is
 * stored on the server only "wrapped" with a key derived from the Reading Pass (PBKDF2), so the
 * server holds ciphertext it cannot open, and a new device holding the pass can unwrap it.
 */

const PBKDF2_ITERATIONS = 310_000;
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** A fresh random note key (base64url of 32 bytes). */
export function newNoteKey(): string {
  return toB64url(random(32));
}

async function passKey(pass: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const noteCryptoKey = (noteKey: string) => subtle().importKey("raw", fromB64url(noteKey), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

/** "v1.<salt>.<iv>.<ciphertext>" */
export async function wrapNoteKey(noteKey: string, pass: string): Promise<string> {
  const salt = random(16);
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, await passKey(pass, salt), fromB64url(noteKey)));
  return `v1.${toB64url(salt)}.${toB64url(iv)}.${toB64url(ct)}`;
}

export async function unwrapNoteKey(wrapped: string, pass: string): Promise<string> {
  const [v, salt, iv, ct] = wrapped.split(".");
  if (v !== "v1" || !salt || !iv || !ct) throw new Error("Unsupported key format");
  const raw = await subtle().decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await passKey(pass, fromB64url(salt)), fromB64url(ct));
  return toB64url(new Uint8Array(raw));
}

/** "v1.<iv>.<ciphertext>" */
export async function sealNote(text: string, noteKey: string): Promise<string> {
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, await noteCryptoKey(noteKey), enc.encode(text)));
  return `v1.${toB64url(iv)}.${toB64url(ct)}`;
}

export async function openNote(sealed: string, noteKey: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("Unsupported note format");
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await noteCryptoKey(noteKey), fromB64url(ct));
  return dec.decode(pt);
}
