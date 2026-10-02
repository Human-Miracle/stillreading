// Prefixed, roughly time-sortable random ids. Works in browsers and Node (Web Crypto).
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export type IdPrefix = "dvc" | "rd" | "ch" | "pt" | "gl" | "bk" | "rs" | "rp" | "op";

function randomString(length: number, alphabet: string): string {
  // Rejection sampling keeps the distribution uniform.
  const out: string[] = [];
  const max = 256 - (256 % alphabet.length);
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < max) out.push(alphabet[b % alphabet.length]!);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

function timePart(now: number): string {
  let t = now;
  let s = "";
  for (let i = 0; i < 10; i++) {
    s = CROCKFORD[t % 32] + s;
    t = Math.floor(t / 32);
  }
  return s;
}

/** e.g. `pt_01JAB3...` — 10 time chars + 16 random chars (80 bits). */
export function newId(prefix: IdPrefix, now: number = Date.now()): string {
  return `${prefix}_${timePart(now)}${randomString(16, CROCKFORD)}`;
}

export const ID_PATTERN = (prefix: IdPrefix) => new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`);

/** Unguessable join code: 12 base62 chars ≈ 71 bits. */
export function newJoinCode(): string {
  return randomString(12, BASE62);
}

/** 256-bit device secret, base62. */
export function newDeviceSecret(): string {
  return randomString(43, BASE62);
}

/** Reactions are unique per (session, participant, type), so their id is derived. */
export function reactionId(sessionId: string, participantId: string, type: string): string {
  return `rx_${sessionId.slice(3)}.${participantId.slice(3)}.${type}`;
}
