import { ariaSort, sortMark, type SortState } from "../sort";

interface Props {
  label: string;
  column: string;
  state: SortState | null;
  onSort: (key: string, numeric?: boolean) => void;
  numeric?: boolean;
  title?: string;
}

/** A table header cell that sorts on click, with proper aria-sort semantics. */
export default function SortHeader(p: Props) {
  return (
    <th aria-sort={ariaSort(p.state, p.column)}>
      <button
        className="sort-btn"
        onClick={() => p.onSort(p.column, p.numeric)}
        title={p.title ?? `Sort by ${p.label}`}
      >
        {p.label}
        <span className="sort-mark">{sortMark(p.state, p.column)}</span>
      </button>
    </th>
  );
}
