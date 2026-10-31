import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** The term shown; the explanation appears on hover or keyboard focus. */
  label: string;
  tip: string;
  children?: React.ReactNode;
}

/**
 * Inline jargon explainer.
 *
 * The bubble is rendered in a portal on <body>, positioned from the term's
 * measured box and flipped when there is no room below. That keeps it readable
 * inside scrollable tables and cards, where an absolutely-positioned child was
 * clipped or detached from the term.
 */
export default function Info(p: Props) {
  const termRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const place = useCallback(() => {
    const el = termRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const above = r.bottom + 120 > window.innerHeight;
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, place]);

  return (
    <span className="info">
      <span
        ref={termRef}
        className="info-term"
        tabIndex={0}
        role="note"
        aria-label={`${p.label}: ${p.tip}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {p.children ?? p.label}
      </span>
      {open &&
        pos &&
        createPortal(
          <span
            className="info-bubble"
            role="tooltip"
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.above ? "translateY(-100%)" : undefined,
            }}
          >
            {p.tip}
          </span>,
          document.body,
        )}
    </span>
  );
}
