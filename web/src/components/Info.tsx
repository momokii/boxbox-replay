import { useState } from "react";

interface Props {
  /** The term shown; the explanation appears on hover or keyboard focus. */
  label: string;
  tip: string;
  children?: React.ReactNode;
}

/** Inline jargon explainer — hover/focus a dotted-underline term. */
export default function Info(p: Props) {
  const [open, setOpen] = useState(false);
  return (
    <span className="info">
      <span
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
      {open && (
        <span className="info-bubble" role="tooltip">
          {p.tip}
        </span>
      )}
    </span>
  );
}
