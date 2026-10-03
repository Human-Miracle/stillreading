import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "@/lib/validation/push";
import { pushOptions, replyPayload, vapidSubject } from "@/server/notifications";

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
    const p = replyPayload({ replier: "David", body: "x".repeat(200), to: "owner", challengeId: "ch_1", sessionId: "rs_1" });
    expect(p.title).toBe("David replied to your check-in");
    expect(p.body).toHaveLength(140);
    expect(p.body.endsWith("…")).toBe(true);
    expect(p).toMatchObject({ url: "/c/ch_1/feed/rs_1", tag: "thread-rs_1" });
    expect(replyPayload({ replier: "Amaka", body: "Hi", to: "thread", challengeId: "ch_1", sessionId: "rs_1" }).title).toBe("Amaka also replied");
  });
});

describe("vapidSubject", () => {
  it("accepts what Apple accepts and repairs common mistakes", () => {
    expect(vapidSubject("mailto:jess@example.com")).toBe("mailto:jess@example.com");
    expect(vapidSubject("mailto: jess@example.com")).toBe("mailto:jess@example.com");
    expect(vapidSubject("jess@example.com")).toBe("mailto:jess@example.com");
    expect(vapidSubject("https://stillreading.app")).toBe("https://stillreading.app");
    for (const bad of [undefined, "", "jess", "http://stillreading.app", "https://localhost", "mailto:"]) {
      expect(vapidSubject(bad)).toBe("https://github.com/pwadeveloper/stillreading");
    }
  });
});

describe("pushOptions", () => {
  it("sends no topic to Apple (it refuses ours) and an alphanumeric one elsewhere", () => {
    for (const host of ["web.push.apple.com", "api.push.apple.com"]) {
      expect(pushOptions(host, "thread-rs_01ABC")).toEqual({ TTL: 86400, urgency: "normal" });
    }
    expect(pushOptions("fcm.googleapis.com", "reminder-ch_01M412W7SEESM9K0ZDJBYKYYJJ")).toEqual({ TTL: 86400, urgency: "normal", topic: "reminderch01M412W7SEESM9K0ZDJBYK" });
  });
});
