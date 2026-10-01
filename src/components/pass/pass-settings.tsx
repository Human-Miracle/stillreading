"use client";
import { useEffect, useState } from "react";
import { rotatePass } from "@/local/reader";
import { Button } from "../ui/button";
import { Card, Eyebrow } from "../ui/card";
import { PassActions, PassTicket } from "./pass-ticket";
import { useLocalReader } from "./use-reader";

function TransferQr({ pass }: { pass: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // The pass rides in the URL fragment, which browsers never send to the server.
    const url = `${window.location.origin}/pass#${pass}`;
    void import("qrcode").then((QR) => QR.toString(url, { type: "svg", margin: 0, color: { dark: "#111111", light: "#00000000" } }).then((s) => alive && setSvg(s)));
    return () => {
      alive = false;
    };
  }, [pass]);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
      <div className="size-28 shrink-0 rounded-xl bg-white p-2" role="img" aria-label="QR code that moves your Reading Pass to a new phone" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
      <p className="text-[15px] leading-snug text-ink/70">
        <span className="font-medium text-ink">Scan with your new phone&apos;s camera.</span> It opens Still Reading there and brings everything across.
      </p>
    </div>
  );
}

/** Always-available Reading Pass section in Settings (even if the reader skipped the prompt). */
export function PassSettings() {
  const state = useLocalReader();
  const [revealed, setRevealed] = useState(false);
  const [qr, setQr] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pass = state?.reader?.pass ?? null;

  const rotate = async () => {
    setBusy(true);
    setError(null);
    try {
      await rotatePass();
      setRevealed(true);
      setConfirmRotate(false);
    } catch {
      setError("Couldn't make a new pass. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-4" aria-labelledby="pass-settings-title">
      <div>
        <Eyebrow id="pass-settings-title">Your Reading Pass</Eyebrow>
        <p className="mt-1 text-ink/70">Use it to carry on from a new phone. No sign-in, no email.</p>
      </div>

      {state === undefined ? null : !state.reader ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-ink/70">Your pass will appear here once you&apos;re online.</p>
      ) : !pass ? (
        <div className="space-y-3">
          <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-ink/70">Your pass was changed on another device. Make a new one here to see it on this phone.</p>
          <Button onClick={rotate} disabled={busy}>
            {busy ? "Making…" : "Make a new pass"}
          </Button>
        </div>
      ) : (
        <>
          <PassTicket pass={pass} hidden={!revealed} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRevealed((v) => !v)}>
              {revealed ? "Hide" : "Show pass"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setQr((v) => !v)}>
              {qr ? "Hide QR" : "Move to a new phone"}
            </Button>
          </div>
          {qr ? <TransferQr pass={pass} /> : null}
          {revealed ? <PassActions pass={pass} /> : null}
          <div className="border-t border-line pt-4">
            {confirmRotate ? (
              <div className="space-y-2">
                <p className="text-sm text-ink/70">Your current pass will stop working. Use this if someone else has seen it.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" onClick={rotate} disabled={busy}>
                    {busy ? "Making…" : "Yes, make a new pass"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(true)}>
                Make a new pass
              </Button>
            )}
          </div>
        </>
      )}
      {error ? (
        <p className="text-sm text-[#c2321f]" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
