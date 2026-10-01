export interface ShareCardData {
  challengeName: string;
  readingDays: number;
  durationDays: number;
  totalsLine: string;
  books: number;
  longestStreak: number;
  goalPercent: number | null;
  host: string;
}

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Draws the completion card on a canvas, entirely on-device (no upload, no Blob storage). */
export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  await document.fonts?.ready;
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  const font = cssVar("--font-geist", "system-ui, sans-serif");
  const spacing = (px: number) => {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
  };

  // Golden gradient hero fading to white (reference: the activity screen).
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#b77b09");
  g.addColorStop(0.35, "#d9a535");
  g.addColorStop(0.6, "#f2dca2");
  g.addColorStop(0.8, "#ffffff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `500 40px ${font}`;
  spacing(-0.5);
  ctx.fillText(data.challengeName, W / 2, 150);

  ctx.fillStyle = "#ffffff";
  ctx.font = `500 380px ${font}`;
  spacing(-18);
  ctx.fillText(String(data.readingDays), W / 2, 530);

  ctx.font = `500 46px ${font}`;
  spacing(-1);
  ctx.fillText(`days I showed up, of ${data.durationDays}`, W / 2, 620);

  // Frosted tiles
  const tiles: [string, string][] = [
    ["Read", data.totalsLine.split(" · ")[0] ?? data.totalsLine],
    ["Books", String(data.books)],
    ["Best streak", `${data.longestStreak} days`],
  ];
  const tw = 290;
  const gap = 25;
  const x0 = (W - (tw * 3 + gap * 2)) / 2;
  tiles.forEach(([label, value], i) => {
    const x = x0 + i * (tw + gap);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    roundRect(ctx, x, 720, tw, 170, 36);
    ctx.fill();
    ctx.fillStyle = "rgba(17,17,17,0.55)";
    ctx.font = `500 30px ${font}`;
    spacing(0);
    ctx.fillText(label, x + tw / 2, 785);
    ctx.fillStyle = "#111111";
    ctx.font = `500 46px ${font}`;
    spacing(-1.5);
    ctx.fillText(value, x + tw / 2, 850);
  });

  if (data.goalPercent !== null) {
    ctx.fillStyle = "#111111";
    roundRect(ctx, W / 2 - 260, 960, 520, 110, 55);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `500 44px ${font}`;
    spacing(-1);
    ctx.fillText(`${data.goalPercent}% of my goal`, W / 2, 1030);
  }

  ctx.fillStyle = "#111111";
  ctx.font = `500 44px ${font}`;
  spacing(-1.5);
  ctx.fillText("Still Reading", W / 2, H - 120);
  ctx.fillStyle = "#8b877f";
  ctx.font = `400 30px ${font}`;
  spacing(0);
  ctx.fillText(`${data.host} · Powered by Pursion`, W / 2, H - 70);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render image"))), "image/png"));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
