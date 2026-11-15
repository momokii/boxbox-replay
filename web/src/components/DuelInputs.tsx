import { useEffect, useState } from "react";
import { beginDraw, themeColors, useCanvasSize } from "../chart";
import type { DuelInputs as Inputs, DuelPayload } from "../duel";

interface Props {
  payload: DuelPayload;
  colors: Map<number, string>;
  codes: Map<number, string>;
}

const H = 180;

function value(arr: (number | null)[] | undefined, index: number): number | null {
  return arr && index >= 0 ? arr[index] ?? null : null;
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  values: (number | null)[],
  X: (i: number) => number,
  Y: (v: number) => number,
  colour: string,
  width = 1.6,
) {
  ctx.beginPath();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  let started = false;
  values.forEach((raw, i) => {
    if (raw == null) return;
    if (!started) {
      ctx.moveTo(X(i), Y(raw));
      started = true;
    } else {
      ctx.lineTo(X(i), Y(raw));
    }
  });
  ctx.stroke();
}

/** Throttle/brake for both duel laps, aligned on the same progress grid. */
export default function DuelInputs({ payload, colors, codes }: Props) {
  const { canvasRef, wrapRef, width, dpr } = useCanvasSize(H);
  const [hover, setHover] = useState<{ progress: number; x: number } | null>(null);
  const a = payload.inputs?.a;
  const b = payload.inputs?.b;
  const count = Math.max(a?.throttle.length ?? 0, b?.throttle.length ?? 0);
  const index = hover ? Math.round(hover.progress * (count - 1)) : -1;
  const colourA = colors.get(payload.a.driver_number) ?? "var(--ink)";
  const colourB = colors.get(payload.b.driver_number) ?? "var(--ink)";
  const codeA = codes.get(payload.a.driver_number) ?? `#${payload.a.driver_number}`;
  const codeB = codes.get(payload.b.driver_number) ?? `#${payload.b.driver_number}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !a || !b || !count) return;
    const draw = beginDraw(canvas, width, H, dpr);
    if (!draw) return;
    const { ctx, w, h } = draw;
    const tokens = themeColors();
    const padL = 38;
    const padR = 10;
    const padT = 10;
    const throttleBottom = h * 0.62;
    const brakeTop = h * 0.76;
    const brakeBottom = h - 22;
    const X = (i: number) => padL + (i / Math.max(1, count - 1)) * (w - padL - padR);
    const YThrottle = (v: number) => padT + (1 - v / 100) * (throttleBottom - padT);
    const YBrake = (v: number) => brakeBottom - (v > 0 ? 1 : 0) * (brakeBottom - brakeTop);

    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    for (const v of [0, 50, 100]) {
      const y = YThrottle(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillStyle = tokens.dim;
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(`${v}%`, 3, y + 3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = tokens.dim;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("throttle", 3, padT + 9);
    ctx.fillText("brake", 3, brakeTop + 9);

    drawLine(ctx, a.throttle, X, YThrottle, colourA);
    drawLine(ctx, b.throttle, X, YThrottle, colourB);
    drawLine(ctx, a.brake, X, YBrake, colourA, 2.2);
    drawLine(ctx, b.brake, X, YBrake, colourB, 2.2);

    if (hover && index >= 0) {
      ctx.strokeStyle = tokens.amber;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(index), padT);
      ctx.lineTo(X(index), h - 18);
      ctx.stroke();
      for (const [arr, colour, y] of [
        [a.throttle, colourA, YThrottle],
        [b.throttle, colourB, YThrottle],
      ] as const) {
        const v = value(arr, index);
        if (v != null) {
          ctx.beginPath();
          ctx.arc(X(index), y(v), 3, 0, Math.PI * 2);
          ctx.fillStyle = colour;
          ctx.fill();
        }
      }
    }

    ctx.fillStyle = tokens.dim;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("lap start", padL, h - 6);
    ctx.fillText("lap end", w - padR - 38, h - 6);
  }, [a, b, count, width, dpr, hover, index, colourA, colourB]);

  if (!a || !b) return <p className="dim small">No input channels for these laps.</p>;

  const readOne = (key: keyof Inputs, side: "a" | "b") => {
    const entry = side === "a" ? a : b;
    const raw = value(entry[key], index);
    if (raw == null) return "—";
    if (key === "brake") return raw >= 50 ? "on" : "off";
    if (key === "drs") return raw >= 8 ? "open" : "shut";
    if (key === "throttle") return `${Math.round(Math.min(100, Math.max(0, raw)))}%`;
    return `${Math.round(raw)}`;
  };

  return (
    <section className="duel-inputs" aria-label="Duel input comparison">
      <div className="duel-inputs-head">
        <h3>Inputs at the same lap progress</h3>
        <div className="line-legend">
          <span><i style={{ background: colourA }} /> A · {codeA}</span>
          <span><i style={{ background: colourB }} /> B · {codeB}</span>
        </div>
      </div>
      <div className="lab-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="duel-input-canvas"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const progress = Math.max(
              0,
              Math.min(1, (e.clientX - rect.left - 38) / Math.max(1, rect.width - 48)),
            );
            setHover({ progress, x: e.clientX - rect.left });
          }}
          onMouseLeave={() => setHover(null)}
        />
      </div>
      <div className="duel-inputs-readout mono">
        {index < 0 ? (
          <span className="dim small">Hover the chart to compare throttle, brake, gear and DRS.</span>
        ) : (
          <>
            <span><b>{codeA}</b> thr {readOne("throttle", "a")} · brk {readOne("brake", "a")} · g{readOne("gear", "a")} · DRS {readOne("drs", "a")}</span>
            <span><b>{codeB}</b> thr {readOne("throttle", "b")} · brk {readOne("brake", "b")} · g{readOne("gear", "b")} · DRS {readOne("drs", "b")}</span>
            <span className="dim">at {(index / Math.max(1, count - 1) * 100).toFixed(0)}% of the lap</span>
          </>
        )}
      </div>
    </section>
  );
}
