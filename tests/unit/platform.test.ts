import { describe, expect, it } from "vitest";
import { detectPlatform } from "@/components/pwa/platform";

const UA = {
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  iosChromeOld: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0 Mobile/15E148 Safari/604.1",
  iosFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  iosInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  androidFacebook: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0;]",
  androidWebview: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:131.0) Gecko/20100101 Firefox/131.0",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
};

const d = (ua: string, extra: Partial<Parameters<typeof detectPlatform>[0]> = {}) => detectPlatform({ ua, hasPrompt: false, ...extra });

describe("install platform detection", () => {
  it("iOS Safari → Share → Add to Home Screen", () => {
    expect(d(UA.iosSafari)).toMatchObject({ os: "ios", browser: "Safari", method: "ios-safari", iosVersion: 18.03 });
  });
  it("iPadOS (desktop UA + touch) is treated as iOS Safari", () => {
    expect(d(UA.macSafari, { platform: "MacIntel", maxTouchPoints: 5 })).toMatchObject({ os: "ios", method: "ios-safari" });
  });
  it("Chrome/Firefox on iOS 16.4+ can add to home screen; older iOS must use Safari", () => {
    expect(d(UA.iosChrome)).toMatchObject({ browser: "Chrome", method: "ios-browser" });
    expect(d(UA.iosFirefox)).toMatchObject({ browser: "Firefox", method: "ios-browser" });
    expect(d(UA.iosChromeOld).method).toBe("ios-open-safari");
  });
  it("in-app browsers must open in the real browser", () => {
    expect(d(UA.iosInstagram)).toMatchObject({ inApp: "Instagram", method: "in-app" });
    expect(d(UA.androidFacebook, { hasPrompt: true })).toMatchObject({ inApp: "Facebook", method: "in-app" });
    expect(d(UA.androidWebview).method).toBe("in-app");
  });
  it("Android uses the native prompt when available, the browser menu otherwise", () => {
    expect(d(UA.androidChrome, { hasPrompt: true })).toMatchObject({ os: "android", browser: "Chrome", method: "prompt" });
    expect(d(UA.androidChrome).method).toBe("android-menu");
    expect(d(UA.androidSamsung).browser).toBe("Samsung Internet");
    expect(d(UA.androidFirefox)).toMatchObject({ browser: "Firefox", method: "android-menu" });
  });
  it("desktop browsers", () => {
    expect(d(UA.macChrome, { hasPrompt: true }).method).toBe("prompt");
    expect(d(UA.macChrome).method).toBe("desktop-chromium");
    expect(d(UA.winEdge)).toMatchObject({ browser: "Edge", method: "desktop-chromium" });
    expect(d(UA.macSafari, { platform: "MacIntel", maxTouchPoints: 0 }).method).toBe("desktop-safari");
    expect(d(UA.macFirefox).method).toBe("desktop-unsupported");
  });
});
