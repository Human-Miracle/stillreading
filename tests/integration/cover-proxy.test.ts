import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/covers/[file]/route";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const get = (file: string) => GET(new Request(`http://stillreading.test/covers/${file}`), { params: Promise.resolve({ file }) });

function stub(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return respond(String(input));
  }) as typeof fetch;
  return calls;
}

describe("GET /covers/:file", () => {
  it("serves the Open Library cover from our origin with a long cache", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const calls = stub(() => new Response(jpeg, { headers: { "content-type": "image/jpeg" } }));
    const res = await get("8259443-M.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
    expect(calls).toEqual(["https://covers.openlibrary.org/b/id/8259443-M.jpg?default=false"]);
  });

  it("rejects anything that isn't a cover id without calling upstream", async () => {
    const calls = stub(() => new Response("x"));
    for (const file of ["../secret.jpg", "123-X.jpg", "abc-M.jpg", "123-M.png", "1234567890123-M.jpg"]) {
      expect((await get(file)).status, file).toBe(404);
    }
    expect(calls).toHaveLength(0);
  });

  it("passes through missing covers and never caches failures", async () => {
    stub(() => new Response("missing", { status: 404 }));
    expect((await get("1-M.jpg")).status).toBe(404);

    stub(() => new Response("<html>", { headers: { "content-type": "text/html" } }));
    const notImage = await get("1-M.jpg");
    expect(notImage.status).toBe(502);
    expect(notImage.headers.get("cache-control")).toBe("no-store");

    stub(() => Promise.reject(new TypeError("fetch failed")));
    expect((await get("1-M.jpg")).status).toBe(502);
  });
});
