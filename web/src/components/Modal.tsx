import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra class for size variants (e.g. "wide"). */
  size?: "default" | "wide";
}

/**
 * Accessible dialog for inspecting data in depth.
 *
 * Used only when the user explicitly asks for a fuller view (NN/g: modals
 * interrupt, so they must be deliberate). Escape closes, focus is trapped and
 * restored, background scroll is locked.
 */
export default function Modal(p: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!p.open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        p.onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || !nodes.length) return;
      const list = Array.from(nodes).filter((n) => !n.hasAttribute("disabled"));
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    // Focus the dialog itself first so screen readers announce it.
    window.setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [p.open, p.onClose]);

  if (!p.open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div
        ref={panelRef}
        className={p.size === "wide" ? "modal-panel wide" : "modal-panel"}
        role="dialog"
        aria-modal="true"
        aria-label={p.title}
        tabIndex={-1}
      >
        <header className="modal-head">
          <div>
            <h2>{p.title}</h2>
            {p.subtitle && <p className="dim small">{p.subtitle}</p>}
          </div>
          <button className="ghost" onClick={p.onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{p.children}</div>
      </div>
    </div>,
    document.body,
  );
}
