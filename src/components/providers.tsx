"use client";
import { SerwistProvider } from "@serwist/turbopack/react";
import { useEffect, type ReactNode } from "react";
import { getSyncEngine } from "@/local/sync/engine";
import { getDevice } from "@/local/device";
import { listenForInstallPrompt } from "./pwa/install-state";

function SyncBoot() {
  useEffect(() => {
    void getDevice();
    // Ask the browser not to evict our IndexedDB under storage pressure.
    void navigator.storage?.persist?.().catch(() => {});
    const engine = getSyncEngine();
    engine.start();
    const off = listenForInstallPrompt();
    return () => {
      engine.stop();
      off();
    };
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
      <SyncBoot />
      {children}
    </SerwistProvider>
  );
}
