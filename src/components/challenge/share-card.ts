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

  const display = cssVar("--font-fraunces", "Georgia, serif");
  const sans = cssVar("--font-inter", "system-ui, sans-serif");

  // Background
  ctx.fillStyle = "#fbf6ee";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f8e1d5";
  ctx.beginPath();
  ctx.arc(W - 120, 160, 360, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c6532a";
  ctx.fillRect(0, H - 24, W, 24);

  // Wordmark
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 76px ${display}`;
  ctx.fillStyle = "#221b16";
  ctx.fillText("READ", 90, 170);
  const readW = ctx.measureText("READ").width;
  ctx.fillStyle = "#c6532a";
  ctx.fillText("30", 90 + readW, 170);

  // Headline
  ctx.fillStyle = "#221b16";
  ctx.font = `600 64px ${display}`;
  wrap(ctx, `I completed ${data.challengeName}.`, 90, 330, W - 180, 76);

  // Stats
  const rows: [string, string][] = [
    [`${data.readingDays}`, `reading day${data.readingDays === 1 ? "" : "s"} of ${data.durationDays}`],
    [data.totalsLine, ""],
    [`${data.books}`, `book${data.books === 1 ? "" : "s"} finished`],
    [`${data.longestStreak}`, `day longest streak 🔥`],
  ];
  let y = 600;
  for (const [big, small] of rows) {
    ctx.font = `600 84px ${display}`;
    ctx.fillStyle = "#221b16";
    ctx.fillText(big, 90, y);
    if (small) {
      const w = ctx.measureText(big).width;
      ctx.font = `500 40px ${sans}`;
      ctx.fillStyle = "#4a3f36";
      ctx.fillText(small, 90 + w + 22, y);
    }
    y += 130;
  }

  if (data.goalPercent !== null) {
    ctx.fillStyle = "#2f6b4f";
    roundRect(ctx, 90, y - 30, W - 180, 110, 55);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 46px ${sans}`;
    ctx.fillText(`${data.goalPercent}% of my goal`, 140, y + 40);
  }

  ctx.fillStyle = "#74675b";
  ctx.font = `500 34px ${sans}`;
  ctx.fillText(data.host, 90, H - 80);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render image"))), "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
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
