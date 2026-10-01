"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { StreakBanner } from "@/components/challenge/streak-banner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Wordmark } from "@/components/ui/misc";
import { isValidPass, normalizePass } from "@/lib/pass";
import { ApiClientError } from "@/local/api";
import { claimWithPass, claimWithReinvite } from "@/local/reader";

const noop = () => () => {};

let cachedLink: { hash: string; reinvite: string | null } | null = null;

/**
 * Reads a pass (#WORDS, from the QR) or a re-invite (#reinvite=TOKEN) from the URL fragment, which
 * browsers never send to the server, then wipes it from the address bar and history.
 */
function readLink() {
  if (!cachedLink) {
    const raw = decodeURIComponent(window.location.hash.slice(1));
    const legacy = new URLSearchParams(window.location.search).get("reinvite");
    cachedLink = raw.startsWith("reinvite=") ? { hash: "", reinvite: raw.slice(9) } : { hash: raw, reinvite: legacy };
    if (raw || legacy) window.history.replaceState(null, "", window.location.pathname);
  }
  return cachedLink;
}

function errorText(err: unknown) {
  if (err instanceof ApiClientError) {
    if (err.status === 0) return "You're offline. Connect to the internet and try again.";
    if (err.status === 429) return "Too many tries. Wait a few minutes and try again.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export default function PassPage() {
  const router = useRouter();
  const link = useSyncExternalStore(noop, readLink, () => null);
  const [typed, setValue] = useState<string | null>(null);
  // Prefilled from a scanned QR (#pass) until the person edits it.
  const value = typed ?? (link?.hash ? normalizePass(link.hash).replace(/-/g, " ") : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);

  const finish = (ids: string[]) => {
    setDone(ids);
    if (ids.length === 1) router.replace(`/c/${ids[0]}`);
  };

  const submitPass = async () => {
    const pass = normalizePass(value);
    if (!isValidPass(pass)) return setError("A Reading Pass is four words and a number, like MAPLE TIDE LANTERN ORBIT 58.");
    setError(null);
    setBusy(true);
    try {
      finish(await claimWithPass(pass));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitReinvite = async (token: string) => {
    setError(null);
    setBusy(true);
    try {
      finish(await claimWithReinvite(token));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-[440px] px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <nav className="mb-8 py-2">
        <Link href="/" aria-label="Still Reading home">
          <Wordmark className="text-[19px]" />
        </Link>
      </nav>

      <div className="rounded-sheet bg-[linear-gradient(180deg,#bdbcfa_0%,#d6d5fb_60%,#e6e4f7_100%)] px-6 pb-7 pt-6">
        <StreakBanner title="Welcome back" sub="Pick up right where you left off" />
        <h1 className="display mt-10 text-[48px]">{link?.reinvite ? "Your host sent you back in" : "Use your Reading Pass"}</h1>
        <p className="mt-3 text-[17px] leading-snug text-ink/60">
          {link?.reinvite
            ? "This one-time link reconnects you to your challenge, with all your check-ins."
            : "Enter your four words and number. Your challenges, streaks, books and private reflections come with you."}
        </p>
      </div>

      {done && done.length !== 1 ? (
        <section className="mt-8 space-y-4">
          <p className="headline text-[24px]">{done.length ? "You're back" : "You're back, but there are no active challenges yet"}</p>
          <ul className="rounded-sheet bg-surface px-5 py-1">
            {done.map((id) => (
              <li key={id} className="dotted">
                <Link href={`/c/${id}`} className="block py-4 text-[17px] font-medium tracking-[-0.02em]">
                  Open challenge →
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/" className="text-sm text-ink/60">
            Go to Still Reading
          </Link>
        </section>
      ) : link?.reinvite ? (
        <div className="mt-8 space-y-3">
          {error ? (
            <p className="text-sm text-[#c2321f]" role="alert">
              {error}
            </p>
          ) : null}
          <Button size="lg" full disabled={busy} onClick={() => void submitReinvite(link.reinvite!)}>
            {busy ? "Reconnecting…" : "Continue on this phone"}
          </Button>
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPass();
          }}
        >
          <Field label="Your Reading Pass" error={error}>
            {(p) => (
              <Input
                {...p}
                autoFocus={!link?.hash}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                placeholder="maple tide lantern orbit 58"
                className="text-lg tracking-wide uppercase placeholder:normal-case"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="lg" full disabled={busy || !value.trim()}>
            {busy ? "Bringing everything across…" : "Continue"}
          </Button>
          <p className="text-sm text-muted">Lost your pass too? Ask your challenge host to re-invite you from their Settings.</p>
        </form>
      )}
    </main>
  );
}
