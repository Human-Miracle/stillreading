import { newDeviceSecret, newId } from "@/lib/ids";
import { getLocalDb } from "./db";

export interface DeviceIdentity {
  deviceId: string;
  deviceSecret: string;
  createdAt: string;
}

const KEY = "device";
let cached: DeviceIdentity | null = null;

/** The anonymous device identity, created on first use and persisted in IndexedDB. */
export async function getDevice(): Promise<DeviceIdentity> {
  if (cached) return cached;
  const db = getLocalDb();
  const identity = await db.transaction("rw", db.kv, async () => {
    const existing = (await db.kv.get(KEY))?.value as DeviceIdentity | undefined;
    if (existing) return existing;
    const created: DeviceIdentity = { deviceId: newId("dvc"), deviceSecret: newDeviceSecret(), createdAt: new Date().toISOString() };
    await db.kv.put({ key: KEY, value: created });
    return created;
  });
  cached = identity;
  return identity;
}

export function resetDeviceCache() {
  cached = null;
}

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  const row = await getLocalDb().kv.get(`pref:${key}`);
  return (row?.value as T | undefined) ?? fallback;
}

export async function setPref(key: string, value: unknown): Promise<void> {
  await getLocalDb().kv.put({ key: `pref:${key}`, value });
}
