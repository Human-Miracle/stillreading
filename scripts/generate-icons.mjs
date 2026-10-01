// Renders the PWA icons with headless Chromium. Run: node scripts/generate-icons.mjs
import { chromium } from "@playwright/test";

// Brand mark: the segmented pastel ring with a red "today" dot, on warm paper.
const svg = ({ size, maskable }) => {
  const radius = maskable ? 0 : size * 0.23;
  const c = size / 2;
  const r = size * (maskable ? 0.25 : 0.3);
  const w = size * (maskable ? 0.105 : 0.125);
  const arcs = [
    [-78, 8, "#f6dd8b"],
    [30, 112, "#abc07f"],
    [134, 220, "#f4bbd9"],
    [242, 262, "#c8c7fb"],
  ];
  const pt = (deg) => [c + r * Math.cos((deg * Math.PI) / 180), c + r * Math.sin((deg * Math.PI) / 180)];
  const paths = arcs
    .map(([a, b, color]) => {
      const [x1, y1] = pt(a);
      const [x2, y2] = pt(b);
      return `<path d="M${x1} ${y1} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2} ${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#f6f2ea"/>
  ${paths}
  <circle cx="${c}" cy="${c}" r="${size * 0.045}" fill="#ff4b36"/>
</svg>`;
};

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: true },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><head><style>html,body{margin:0;background:transparent}</style></head><body>${svg(t)}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/icons/${t.file}`, omitBackground: !t.maskable });
  console.log("wrote", t.file);
}
await browser.close();
