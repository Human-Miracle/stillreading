// Renders the PWA icons with headless Chromium. Run: node scripts/generate-icons.mjs
import { chromium } from "@playwright/test";

const svg = ({ size, maskable }) => {
  const pad = maskable ? size * 0.16 : 0;
  const radius = maskable ? 0 : size * 0.22;
  const inner = size - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#c6532a"/>
  <g transform="translate(${pad} ${pad})">
    <text x="${inner / 2}" y="${inner * 0.47}" text-anchor="middle" font-family="Fraunces" font-weight="700" font-size="${inner * 0.25}" fill="#fbf6ee">Still</text>
    <text x="${inner / 2}" y="${inner * 0.74}" text-anchor="middle" font-family="Fraunces" font-weight="700" font-style="italic" font-size="${inner * 0.25}" fill="#fbf6ee">Reading</text>
  </g>
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
    `<html><head><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,700;1,700&display=block" rel="stylesheet"><style>html,body{margin:0;background:transparent}</style></head><body>${svg(t)}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/icons/${t.file}`, omitBackground: !t.maskable });
  console.log("wrote", t.file);
}
await browser.close();
