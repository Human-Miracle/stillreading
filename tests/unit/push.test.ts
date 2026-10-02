import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "@/lib/validation/push";
import { describeTest } from "@/local/notifications";
import { replyPayload } from "@/server/notifications";

describe("isAllowedPushEndpoint", () => {
  it("accepts the browser vendors' push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://api.push.apple.com/3/device/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com.attacker.dev/x",
      "https://push.apple.com/x",
      "https://localhost/x",
      "not a url",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });
});

describe("replyPayload", () => {
  it("names the replier, previews long replies and links to the thread", () => {
    const p = replyPayload({ replier: "David", body: "x".repeat(200), toOwner: true, challengeId: "ch_1", sessionId: "rs_1" });
    expect(p.title).toBe("David replied to your check-in");
    expect(p.body).toHaveLength(140);
    expect(p.body.endsWith("…")).toBe(true);
    expect(p).toMatchObject({ url: "/c/ch_1/feed/rs_1", tag: "thread-rs_1" });
    expect(replyPayload({ replier: "Amaka", body: "Hi", toOwner: false, challengeId: "ch_1", sessionId: "rs_1" }).title).toBe("Amaka also replied");
  });
});

describe("describeTest", () => {
  it("explains each outcome in plain words", () => {
    expect(describeTest([])).toMatchObject({ ok: false, message: expect.stringContaining("isn't registered") });
    expect(describeTest([{ result: "sent", host: "web.push.apple.com", status: 201, detail: null }])).toMatchObject({ ok: true, message: expect.stringContaining("Sent") });
    expect(describeTest([{ result: "gone", host: "fcm.googleapis.com", status: 410, detail: null }]).message).toContain("dropped");
    expect(describeTest([{ result: "failed", host: "web.push.apple.com", status: 403, detail: "BadJwtToken" }]).message).toBe("Apple refused the notification (403: BadJwtToken).");
  });
});
