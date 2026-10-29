import { useEffect, useState } from "react";

export type Theme = "night" | "day";

const KEY = "boxbox.theme";

function initial(): Theme {
  if (typeof window === "undefined") return "night";
  const stored = window.localStorage.getItem(KEY);
  return stored === "day" ? "day" : "night";
}

/** Theme is a document-level attribute; the toggle is the only writer. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(KEY, theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "night" ? "day" : "night")) };
}
