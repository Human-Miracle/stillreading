/** Renders the Reading Pass as an image people can keep in their photos. Entirely on-device. */
export async function renderPassImage(pass: string, host: string): Promise<Blob> {
  await document.fonts?.ready;
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  const font = getComputedStyle(document.documentElement).getPropertyValue("--font-geist").trim() || "system-ui, sans-serif";
  const spacing = (px: number) => {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
  };

  ctx.fillStyle = "#f6f2ea";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 120, 0, 1180);
  g.addColorStop(0, "#bdbcfa");
  g.addColorStop(1, "#e4e2f6");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(80, 120, W - 160, 1060, 64);
  ctx.fill();
  // Ticket notches + perforation.
  ctx.fillStyle = "#f6f2ea";
  for (const x of [80, W - 80]) {
    ctx.beginPath();
    ctx.arc(x, 820, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(17,17,17,0.25)";
  ctx.setLineDash([4, 14]);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(140, 820);
  ctx.lineTo(W - 140, 820);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(17,17,17,0.6)";
  ctx.font = `500 34px ${font}`;
  spacing(0);
  ctx.fillText("Still Reading · Reading Pass", 150, 230);
  ctx.fillStyle = "#111111";
  ctx.font = `500 96px ${font}`;
  spacing(-3);
  const parts = pass.split("-");
  parts.forEach((w, i) => ctx.fillText(w, 150, 380 + i * 96));

  ctx.fillStyle = "rgba(17,17,17,0.65)";
  ctx.font = `400 34px ${font}`;
  spacing(0);
  ctx.fillText(`New phone? Open ${host}/pass`, 150, 920);
  ctx.fillText("and enter these words to carry on.", 150, 970);
  ctx.fillStyle = "#ff4b36";
  ctx.beginPath();
  ctx.arc(162, 1066, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.font = `500 32px ${font}`;
  ctx.fillText("Keep it private. It opens your account.", 186, 1077);

  ctx.fillStyle = "#8b877f";
  ctx.font = `400 28px ${font}`;
  ctx.textAlign = "center";
  ctx.fillText("Powered by Pursion", W / 2, H - 80);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not render image"))), "image/png"));
}
