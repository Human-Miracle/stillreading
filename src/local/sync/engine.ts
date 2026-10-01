import type { ChallengeSnapshot, PushResult } from "@/lib/api-types";
import { MAX_OPS_PER_PUSH } from "@/lib/validation/ops";
import { ApiClientError, apiRequest } from "../api";
import { getLocalDb, type SyncOpRecord } from "../db";
import { applyServerRecord, applySnapshot, markEntityFailed, markEntitySynced } from "../merge";
import { onLocalMutation } from "../repo";

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastError: string | null;
  lastSyncedAt: string | null;
}

export interface SyncEngineOptions {
  isOnline?: () => boolean;
  now?: () => number;
  random?: () => number;
}

const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const PERIODIC_MS = 30_000;
const MUTATION_DEBOUNCE_MS = 400;

export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

/**
 * Pushes queued operations and pulls challenge deltas. Single-flight: concurrent calls share one run
 * (and `navigator.locks` serialises tabs). Never drops an operation on transient failure.
 */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private rerun = false;
  private listeners = new Set<() => void>();
  private cleanup: (() => void)[] = [];
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private opts: Required<SyncEngineOptions>;
  state: SyncState = { online: true, syncing: false, pendingCount: 0, failedCount: 0, lastError: null, lastSyncedAt: null };

  constructor(opts: SyncEngineOptions = {}) {
    this.opts = {
      isOnline: opts.isOnline ?? (() => (typeof navigator === "undefined" || navigator.onLine !== false)),
      now: opts.now ?? Date.now,
      random: opts.random ?? Math.random,
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = () => this.state;

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Wire up browser triggers: online, visibility, periodic, local mutations. */
  start() {
    if (typeof window === "undefined" || this.cleanup.length) return;
    const kick = () => void this.sync();
    const onOnline = () => {
      this.setState({ online: true });
      kick();
    };
    const onOffline = () => this.setState({ online: false });
    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") kick();
    }, PERIODIC_MS);
    const offMutation = onLocalMutation(() => this.requestSync());
    this.cleanup.push(
      () => window.removeEventListener("online", onOnline),
      () => window.removeEventListener("offline", onOffline),
      () => document.removeEventListener("visibilitychange", onVisible),
      () => clearInterval(timer),
      offMutation,
    );
    this.setState({ online: this.opts.isOnline() });
    void this.refreshCounts();
    kick();
  }

  stop() {
    for (const fn of this.cleanup.splice(0)) fn();
    if (this.debounce) clearTimeout(this.debounce);
  }

  /** Debounced trigger used after local writes. */
  requestSync() {
    void this.refreshCounts();
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.sync(), MUTATION_DEBOUNCE_MS);
  }

  sync(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rerun = false;
          await this.withLock(() => this.runOnce());
        } while (this.rerun);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async withLock(fn: () => Promise<void>) {
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (locks?.request) {
      await locks.request("read30-sync", fn);
    } else {
      await fn();
    }
  }

  private async runOnce() {
    const online = this.opts.isOnline();
    this.setState({ online });
    if (!online) {
      await this.refreshCounts();
      return;
    }
    this.setState({ syncing: true });
    let error: string | null = null;
    try {
      error = await this.pushAll();
      const pullError = await this.pullAll();
      error = error ?? pullError;
    } finally {
      await this.refreshCounts();
      this.setState({ syncing: false, lastError: error, ...(error ? {} : { lastSyncedAt: new Date(this.opts.now()).toISOString() }) });
    }
  }

  async refreshCounts() {
    const db = getLocalDb();
    const [pendingCount, failedCount] = await Promise.all([
      db.syncQueue.where("status").equals("pending").count(),
      db.syncQueue.where("status").equals("failed").count(),
    ]);
    this.setState({ pendingCount, failedCount });
  }

  /** Returns a user-facing error string if pushing stopped on a transient failure. */
  async pushAll(): Promise<string | null> {
    const db = getLocalDb();
    for (let round = 0; round < 20; round++) {
      const now = this.opts.now();
      const due = await db.syncQueue
        .orderBy("createdAt")
        .filter((op) => op.status === "pending" && op.nextAttemptAt <= now)
        .limit(MAX_OPS_PER_PUSH)
        .toArray();
      if (!due.length) return null;

      let results: PushResult[];
      try {
        const res = await apiRequest<{ results: PushResult[] }>("/api/sync", {
          method: "POST",
          body: { ops: due.map(({ opId, challengeId, type, payload }) => ({ opId, challengeId, type, payload })) },
        });
        results = res.results;
      } catch (err) {
        const e = err instanceof ApiClientError ? err : new ApiClientError(0, "network", String(err));
        if (e.transient || e.status === 401) {
          await this.deferAll(due, e.message);
          return e.status === 0 ? "offline" : e.message;
        }
        // The whole batch was malformed: surface rather than retry forever.
        for (const op of due) await this.fail(op, e.message, e.code);
        continue;
      }

      const byId = new Map(results.map((r) => [r.opId, r]));
      let transient = false;
      for (const op of due) {
        const r = byId.get(op.opId);
        if (!r || r.status === "error") {
          transient = true;
          await this.defer(op, r?.message ?? "No result");
          continue;
        }
        await this.settle(op, r);
      }
      if (transient) return "Some changes couldn't sync yet";
    }
    return null;
  }

  private async settle(op: SyncOpRecord, r: PushResult) {
    const db = getLocalDb();
    if (r.status === "rejected") {
      await this.fail(op, r.message ?? "Rejected", r.code);
      return;
    }
    await db.syncQueue.delete(op.opId);
    if (r.entity) await applyServerRecord(r.entity.kind, r.entity.record, { force: r.status === "stale" });
    await markEntitySynced(op.entityKind, op.entityId);
  }

  private async fail(op: SyncOpRecord, message: string, code?: string) {
    const db = getLocalDb();
    if (code === "removed" || code === "archived") {
      // Not the user's fault and not fixable by retrying: drop the op, reflect the new access state.
      await db.syncQueue.delete(op.opId);
      if (code === "removed") await db.challenges.update(op.challengeId, { access: "removed" });
      else await db.challenges.update(op.challengeId, { status: "archived" });
      return;
    }
    console.warn("[read30] sync op rejected", op.type, code);
    await db.syncQueue.update(op.opId, { status: "failed", lastError: message, attempts: op.attempts + 1 });
    await markEntityFailed(op.entityKind, op.entityId);
  }

  private async defer(op: SyncOpRecord, message: string) {
    const attempts = op.attempts + 1;
    await getLocalDb().syncQueue.update(op.opId, {
      attempts,
      lastError: message,
      nextAttemptAt: this.opts.now() + backoffMs(attempts, this.opts.random),
    });
  }

  private async deferAll(ops: SyncOpRecord[], message: string) {
    for (const op of ops) await this.defer(op, message);
  }

  async pullAll(): Promise<string | null> {
    const db = getLocalDb();
    const challenges = await db.challenges.where("id").notEqual("").filter((c) => c.access === "ok").toArray();
    let error: string | null = null;
    for (const c of challenges) {
      try {
        await this.pull(c.id);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
    return error;
  }

  async pull(challengeId: string) {
    const db = getLocalDb();
    const c = await db.challenges.get(challengeId);
    if (!c) return;
    const qs = c.cursor ? `?since=${encodeURIComponent(c.cursor)}` : "";
    try {
      const snapshot = await apiRequest<ChallengeSnapshot>(`/api/challenges/${challengeId}/sync${qs}`);
      await applySnapshot(snapshot);
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 403 || err.status === 404)) {
        const access = err.code === "removed" ? "removed" : err.code === "left" ? "left" : "gone";
        await db.challenges.update(challengeId, { access });
        return;
      }
      throw err;
    }
  }
}

let engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!engine) engine = new SyncEngine();
  return engine;
}
