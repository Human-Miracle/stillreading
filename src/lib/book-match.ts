/**
 * Whether an Open Library result is the same book as the one a reader typed. A wrong cover is worse
 * than none, so a result counts only when its title matches (ignoring case, punctuation, a leading
 * article, a subtitle and a small typo) and, when the reader gave an author, one of its authors
 * shares that author's surname.
 */

/** Drops a subtitle or series note: "Atomic Habits: An Easy Way…" → "Atomic Habits", "Dune (Dune #1)" → "Dune". */
export function mainTitle(title: string): string {
  return title
    .replace(/\s*[([].*$/, "")
    .replace(/\s*[:;–—]\s.*$|\s+-\s.*$|:.*$/, "")
    .trim();
}

function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/** Edit distance, stopping early once it's over `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > max) return false;
    prev = row;
  }
  return prev[b.length]! <= max;
}

/** Same text, allowing a typo in a word of 8+ letters, two in a title of 20+. */
function close(a: string, b: string): boolean {
  if (!a || !b) return false;
  const n = Math.min(a.length, b.length);
  return a === b || within(a, b, n < 8 ? 0 : n < 20 ? 1 : 2);
}

export function titlesMatch(typed: string, found: string): boolean {
  const [t, f] = [normalize(typed), normalize(found)];
  const [tm, fm] = [normalize(mainTitle(typed)), normalize(mainTitle(found))];
  return close(t, f) || close(tm, fm) || close(t, fm) || close(tm, f);
}

export function authorsMatch(typed: string, found: readonly string[]): boolean {
  const words = normalize(typed).split(" ").filter((w) => w.length > 1);
  const surname = words.at(-1);
  if (!surname) return true;
  return found.some((name) => normalize(name).split(" ").some((w) => close(w, surname)));
}

export function sameBook(typed: { title: string; author: string | null }, found: { title: string; authors: readonly string[] }): boolean {
  if (!titlesMatch(typed.title, found.title)) return false;
  return !typed.author?.trim() || authorsMatch(typed.author, found.authors);
}
