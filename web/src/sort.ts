import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

/**
 * Sort rows by a value getter. Pure and stable: ties keep their input order,
 * so the table never shuffles between renders.
 */
export function sortRows<T>(
  rows: T[],
  get: (row: T, key: string) => string | number | null | undefined,
  state: SortState | null,
): T[] {
  if (!state) return rows;
  const dir = state.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const va = get(a.row, state.key);
      const vb = get(b.row, state.key);
      const aNull = va == null || va === "";
      const bNull = vb == null || vb === "";
      // Empty cells always sort last, in both directions.
      if (aNull && bNull) return a.index - b.index;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return va === vb ? a.index - b.index : (va - vb) * dir;
      }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return cmp === 0 ? a.index - b.index : cmp * dir;
    })
    .map((x) => x.row);
}

/**
 * Click-to-sort state for a table. First click on a numeric column sorts
 * descending (biggest lap first is rarely useful, but biggest wear or slowest
 * lap often is), text columns ascending.
 */
export function useSort(initial: SortState | null = null) {
  const [state, setState] = useState<SortState | null>(initial);
  const toggle = (key: string, numeric = false) =>
    setState((cur) => {
      if (cur?.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
      return { key, dir: numeric ? "desc" : "asc" };
    });
  return { state, toggle };
}

export function ariaSort(state: SortState | null, key: string): "ascending" | "descending" | "none" {
  if (state?.key !== key) return "none";
  return state.dir === "asc" ? "ascending" : "descending";
}

/** Arrow shown next to a sorted header. */
export function sortMark(state: SortState | null, key: string): string {
  if (state?.key !== key) return "";
  return state.dir === "asc" ? "▲" : "▼";
}

/** Memoised sorting for a table body. */
export function useSortedRows<T>(
  rows: T[],
  get: (row: T, key: string) => string | number | null | undefined,
  state: SortState | null,
): T[] {
  return useMemo(() => sortRows(rows, get, state), [rows, get, state]);
}
