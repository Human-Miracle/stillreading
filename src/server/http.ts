import { ZodError } from "zod";
import type { ApiErrorBody } from "@/lib/api-types";
import { errorFields, log } from "./log";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: unknown,
  ) {
    super(message);
  }
}

export function json<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(err: unknown, route: string): Response {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, issues: err.issues } };
    return json(body, { status: err.status });
  }
  if (err instanceof ZodError) {
    const body: ApiErrorBody = { error: { code: "invalid", message: err.issues[0]?.message ?? "Invalid request", issues: err.issues } };
    return json(body, { status: 400 });
  }
  log.error("api_error", { route, ...errorFields(err) });
  const body: ApiErrorBody = { error: { code: "server_error", message: "Something went wrong" } };
  return json(body, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 256_000) throw new ApiError(413, "too_large", "Request body is too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be JSON");
  }
}

/**
 * The caller's IP for rate limiting. Prefer headers the hosting platform sets itself (Vercel overwrites
 * these), so a client can't dodge limits by sending its own X-Forwarded-For.
 */
export function clientIp(req: Request): string {
  const platform = req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip");
  const fwd = req.headers.get("x-forwarded-for");
  return (platform ?? fwd)?.split(",")[0]?.trim() || "unknown";
}

export function route<Ctx>(name: string, fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err, name);
    }
  };
}
