/**
 * Reading Pass format, shared by client and server:
 * four everyday words + two digits, e.g. MAPLE-TIDE-LANTERN-ORBIT-58 (~50 bits of entropy).
 */
export const PASS_PATTERN = /^(?:[A-Z]{3,8}-){4}\d{2}$/;

/** Accepts any spacing, case or separators people type: "maple tide, lantern orbit 58". */
export function normalizePass(input: string): string {
  const parts = input
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  // Allow the number glued to the last word ("ORBIT58").
  const last = parts[parts.length - 1];
  if (parts.length === 4 && last && /^[A-Z]+\d{2}$/.test(last)) {
    parts.splice(3, 1, last.slice(0, -2), last.slice(-2));
  }
  return parts.join("-");
}

export function isValidPass(pass: string): boolean {
  return PASS_PATTERN.test(pass);
}

/** Wrapped note key: "v1.<salt>.<iv>.<ciphertext>" (base64url). */
export const WRAPPED_KEY_PATTERN = /^v1\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{12,32}\.[A-Za-z0-9_-]{40,128}$/;

/** Encrypted note: "v1.<iv>.<ciphertext>" (base64url). */
export const SEALED_NOTE_PATTERN = /^v1\.[A-Za-z0-9_-]{12,32}\.[A-Za-z0-9_-]{16,4000}$/;
