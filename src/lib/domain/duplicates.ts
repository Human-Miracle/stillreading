/** First name, lowercased, without accents or punctuation: "Témi O." → "temi". */
export function nameKey(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  return first
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Same first name, or one is the start of the other ("Temi" / "Temitope"), at 3+ letters. */
function alike(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

/**
 * Members who may have joined twice (another browser, the Home Screen app, cleared storage): groups
 * of two or more whose names look alike. A device can only join once, so duplicates always have
 * different devices and names are the best signal on the phone.
 */
export function possibleDuplicates<T extends { id: string; displayName: string }>(members: readonly T[]): T[][] {
  const keys = members.map((m) => nameKey(m.displayName));
  const group = members.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)));
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) if (alike(keys[i]!, keys[j]!)) group[root(j)] = root(i);
  }
  const byRoot = new Map<number, T[]>();
  members.forEach((m, i) => byRoot.set(root(i), [...(byRoot.get(root(i)) ?? []), m]));
  return [...byRoot.values()].filter((g) => g.length > 1);
}
