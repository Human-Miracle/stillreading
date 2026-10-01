"use client";
import { SerwistProvider } from "@serwist/turbopack/react";
import { useEffect, type ReactNode } from "react";
import { getSyncEngine } from "@/local/sync/engine";
import { getDevice } from "@/local/device";
import { listenForInstallPrompt } from "./pwa/install-state";
import { InstallModal } from "./pwa/install-modal";
import { getLocalDb } from "@/local/db";
import { ensureReadingPass } from "@/local/reader";

function SyncBoot() {
  useEffect(() => {
    void getDevice();
    // Ask the browser not to evict our IndexedDB under storage pressure.
    void navigator.storage?.persist?.().catch(() => {});
    const engine = getSyncEngine();
    engine.start();
    const off = listenForInstallPrompt();
    // Every reader with a challenge gets a Reading Pass (existing readers too, on their next visit).
    const ensurePass = () => {
      void getLocalDb()
        .challenges.count()
        .then((n) => (n > 0 ? ensureReadingPass() : null))
        .catch(() => undefined);
    };
    ensurePass();
    window.addEventListener("online", ensurePass);
    return () => {
      engine.stop();
      off();
      window.removeEventListener("online", ensurePass);
    };
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
      <SyncBoot />
      {children}
      <InstallModal />
    </SerwistProvider>
  );
}
