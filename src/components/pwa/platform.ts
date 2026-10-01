/**
 * Works out how this visitor can install the app. Pure (takes UA + capability flags) so every branch
 * is unit-tested. Browsers keep changing, so unknown cases fall back to the most generic instructions.
 */

export type InstallMethod =
  /** The browser gave us `beforeinstallprompt`: one-tap native install. */
  | "prompt"
  /** iPhone/iPad Safari: Share → Add to Home Screen. */
  | "ios-safari"
  /** Chrome / Edge / Firefox / others on iOS 16.4+: their Share menu → Add to Home Screen. */
  | "ios-browser"
  /** Non-Safari browser on iOS < 16.4: only Safari can add to the home screen. */
  | "ios-open-safari"
  /** Android browser without a native prompt (yet): browser menu → Install app / Add to Home screen. */
  | "android-menu"
  /** Desktop Chromium (Chrome, Edge, Dia, Brave, Opera, Arc…) without a prompt: menu / address-bar install. */
  | "desktop-chromium"
  /** Safari on macOS 14+: File → Add to Dock. */
  | "desktop-safari"
  /** Desktop browser with no install support (e.g. Firefox): use the phone instead. */
  | "desktop-unsupported"
  /** In-app browser (Instagram, Facebook, TikTok…): must open in the real browser first. */
  | "in-app";

export type Os = "ios" | "android" | "desktop";

export interface Platform {
  os: Os;
  browser: string;
  /** Name of the in-app browser host, e.g. "Instagram". */
  inApp: string | null;
  iosVersion: number | null;
  method: InstallMethod;
}

const IN_APP: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/Messenger|MessengerForiOS/i, "Messenger"],
  [/\bLine\//i, "LINE"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Twitter|XWebView/i, "X"],
  [/Pinterest/i, "Pinterest"],
  [/WhatsApp/i, "WhatsApp"],
  [/Telegram/i, "Telegram"],
  [/GSA\//i, "Google app"],
];

export function detectPlatform(input: { ua: string; platform?: string; maxTouchPoints?: number; hasPrompt: boolean }): Platform {
  const ua = input.ua;
  const iPadOs = input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1;
  const ios = /iPhone|iPad|iPod/i.test(ua) || iPadOs;
  const android = /Android/i.test(ua);
  const os: Os = ios ? "ios" : android ? "android" : "desktop";

  const inApp = IN_APP.find(([re]) => re.test(ua))?.[1] ?? (android && /; wv\)/.test(ua) ? "this app" : null);

  let browser = "your browser";
  if (ios) {
    if (/CriOS/i.test(ua)) browser = "Chrome";
    else if (/FxiOS/i.test(ua)) browser = "Firefox";
    else if (/EdgiOS/i.test(ua)) browser = "Edge";
    else if (/OPiOS|OPT\//i.test(ua)) browser = "Opera";
    else if (/DuckDuckGo|Ddg\//i.test(ua)) browser = "DuckDuckGo";
    else browser = "Safari";
  } else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Dia\//i.test(ua)) browser = "Dia";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  const v = ua.match(/OS (\d+)[_.](\d+)/);
  const iosVersion = ios ? (v ? Number(v[1]) + Number(v[2]) / 100 : 26) : null;

  let method: InstallMethod;
  if (inApp) method = "in-app";
  else if (input.hasPrompt) method = "prompt";
  else if (ios) method = browser === "Safari" ? "ios-safari" : (iosVersion ?? 0) >= 16.04 ? "ios-browser" : "ios-open-safari";
  else if (android) method = "android-menu";
  else if (browser === "Safari") method = "desktop-safari";
  else if (browser === "Firefox") method = "desktop-unsupported";
  else method = "desktop-chromium";

  return { os, browser, inApp, iosVersion, method };
}
