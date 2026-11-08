/**
 * 1200×630 share card, drawn client-side. Pure layout maths are separable so
 * they can be tested without a canvas.
 */

export interface CardCar {
  x: number;
  y: number;
  color: string;
  code: string;
  /** Only the leading cars get a label; the rest are dots to avoid clutter. */
  label?: boolean;
}

export interface CardData {
  title: string;
  subtitle: string;
  lap: string;
  clock: string;
  outline: [number, number][];
  cars: CardCar[];
}

export const CARD_W = 1200;
export const CARD_H = 630;

export interface CardLayout {
  scale: number;
  ox: number;
  oy: number;
  X: (x: number) => number;
  Y: (y: number) => number;
}

/** Fit the circuit outline inside a box, preserving aspect ratio. */
export function layoutTrack(
  outline: [number, number][],
  x: number,
  y: number,
  width: number,
  height: number,
): CardLayout {
  if (!outline.length) {
    return { scale: 1, ox: x, oy: y, X: (v) => v, Y: (v) => v };
  }
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    width / Math.max(1, maxX - minX),
    height / Math.max(1, maxY - minY),
  );
  const ox = x + (width - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = y + (height - (maxY - minY) * scale) / 2 + maxY * scale;
  return {
    scale,
    ox,
    oy,
    X: (v: number) => ox + v * scale,
    Y: (v: number) => oy - v * scale,
  };
}

function draw(ctx: CanvasRenderingContext2D, data: CardData, theme: "night" | "day" = "night") {
  const bg = theme === "day" ? "#F2F4F7" : "#0B0E13";
  const panel = theme === "day" ? "#FFFFFF" : "#14181F";
  const ink = theme === "day" ? "#0E1420" : "#E9EEF5";
  const dim = theme === "day" ? "#5C6878" : "#8592A3";
  const amber = theme === "day" ? "#A86A00" : "#FFB224";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, CARD_W, 92);
  ctx.fillStyle = amber;
  ctx.fillRect(48, 34, 6, 26);

  ctx.fillStyle = ink;
  ctx.font = "700 34px 'Barlow Condensed', system-ui, sans-serif";
  ctx.fillText("BoxBox Replay", 68, 58);
  ctx.fillStyle = dim;
  ctx.font = "500 16px system-ui, sans-serif";
  ctx.fillText("Historical F1 telemetry · OpenF1", 68, 80);

  ctx.fillStyle = ink;
  ctx.font = "600 30px 'Barlow Condensed', system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(data.clock, CARD_W - 48, 56);
  ctx.fillStyle = dim;
  ctx.font = "500 16px system-ui, sans-serif";
  ctx.fillText(data.lap, CARD_W - 48, 78);
  ctx.textAlign = "left";

  ctx.fillStyle = ink;
  ctx.font = "600 30px 'Barlow Condensed', system-ui, sans-serif";
  ctx.fillText(data.title, 48, 140);
  ctx.fillStyle = dim;
  ctx.font = "400 17px system-ui, sans-serif";
  ctx.fillText(data.subtitle, 48, 168);

  const layout = layoutTrack(data.outline, 48, 190, CARD_W - 96, 360);
  if (data.outline.length) {
    ctx.beginPath();
    data.outline.forEach(([x, y], i) => {
      const px = layout.X(x);
      const py = layout.Y(y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = theme === "day" ? "#B9C2CE" : "#39424F";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // Labels overlap when cars are wheel to wheel; keep the first and skip the
  // rest rather than printing an unreadable pile.
  const labels: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const car of data.cars) {
    const px = layout.X(car.x);
    const py = layout.Y(car.y);
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = car.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ink;
    ctx.stroke();

    if (!car.label) continue;
    ctx.font = "600 12px 'Barlow Condensed', system-ui, sans-serif";
    const width = ctx.measureText(car.code).width;
    const box = { x1: px + 11, y1: py - 10, x2: px + 15 + width, y2: py + 5 };
    const overlaps = labels.some(
      (other) => box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1,
    );
    if (overlaps) continue;
    labels.push(box);
    ctx.fillStyle = ink;
    ctx.fillText(car.code, px + 12, py + 4);
  }

  ctx.fillStyle = dim;
  ctx.font = "400 14px system-ui, sans-serif";
  ctx.fillText("boxbox-replay · free, open-source · data: OpenF1", 48, CARD_H - 28);
}

export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  theme: "night" | "day" = "night",
): void {
  draw(ctx, data, theme);
}

export function renderShareCard(data: CardData, theme: "night" | "day" = "night"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  draw(ctx, data, theme);
  return canvas;
}

/** Trigger a PNG download. Resolves once the browser has started it. */
export function downloadShareCard(data: CardData, theme: "night" | "day" = "night"): Promise<void> {
  const canvas = renderShareCard(data, theme);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `boxbox-${data.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      link.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}
