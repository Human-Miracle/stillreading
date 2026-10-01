"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/local/db";
import type { LocalReader } from "@/local/reader";

/** undefined while loading. */
export function useLocalReader(): { reader: LocalReader | null; promptDone: boolean } | undefined {
  return useLiveQuery(async () => {
    const db = getLocalDb();
    const [r, done] = await Promise.all([db.kv.get("reader"), db.kv.get("pref:passPromptDone")]);
    return { reader: (r?.value as LocalReader | undefined) ?? null, promptDone: done?.value === true };
  }, []);
}

export async function markPassPromptDone() {
  await getLocalDb().kv.put({ key: "pref:passPromptDone", value: true });
}
