import { useEffect, useRef, useState } from "react";

/**
 * Keep a canvas exactly the size of its container, at device pixel ratio.
 *
 * Charts used to measure their container once and keep that width, which left
 * a chart drawn in a quarter of the pane after a tab switch or a resize.
 */
export function useCanvasSize(height: number) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; dpr: number }>({ w: 0, dpr: 1 });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const apply = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(200, wrap.clientWidth || 0);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = "100%";
      canvas.style.height = `${height}px`;
      setSize({ w, dpr });
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height]);

  return { canvasRef, wrapRef, width: size.w, dpr: size.dpr };
}

/** Context for one draw pass (theme colours + DPR-transformed ctx). */
export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

export function beginDraw(canvas: HTMLCanvasElement, width: number, height: number, dpr: number): DrawCtx | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, w: width, h: height };
}

/** Read the theme tokens once per draw so charts follow day/night. */
export function themeColors(): {
  line: string;
  dim: string;
  ink: string;
  amber: string;
  green: string;
} {
  const s = getComputedStyle(document.documentElement);
  return {
    line: s.getPropertyValue("--line").trim(),
    dim: s.getPropertyValue("--dim").trim(),
    ink: s.getPropertyValue("--ink").trim(),
    amber: s.getPropertyValue("--amber").trim(),
    green: s.getPropertyValue("--green").trim(),
  };
}
