import { DEVICE_HEADER, SECRET_HEADER, type ApiErrorBody } from "@/lib/api-types";
import { getDevice } from "./device";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
  /** Worth retrying later (network, server, rate limit). */
  get transient(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429 || this.status === 408;
  }
}

let fetchImpl: typeof fetch = (...args) => fetch(...args);
let baseUrl = "";

/** Test hook: route requests elsewhere. */
export function configureApi(opts: { fetch?: typeof fetch; baseUrl?: string }) {
  if (opts.fetch) fetchImpl = opts.fetch;
  if (opts.baseUrl !== undefined) baseUrl = opts.baseUrl;
}

export async function apiRequest<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.auth !== false) {
    const device = await getDevice();
    headers[DEVICE_HEADER] = device.deviceId;
    headers[SECRET_HEADER] = device.deviceSecret;
  }
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal ?? AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new ApiClientError(0, "network", err instanceof Error ? err.message : "Network error");
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON (e.g. offline fallback page or proxy error)
  }
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? "http_error", err?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
