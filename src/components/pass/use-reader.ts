"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/local/db";
import { PASS_NOTICE_KEY, type LocalReader } from "@/local/reader";

/** undefined while loading. */
export function useLocalReader(): { reader: LocalReader | null; promptDone: boolean } | undefined {
  return useLiveQuery(async () => {
    const db = getLocalDb();
    const [r, done] = await Promise.all([db.kv.get("reader"), db.kv.get(PASS_NOTICE_KEY)]);
    return { reader: (r?.value as LocalReader | undefined) ?? null, promptDone: done?.value === true };
  }, []);
}

export async function markPassPromptDone() {
  await getLocalDb().kv.put({ key: PASS_NOTICE_KEY, value: true });
}
