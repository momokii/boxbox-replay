import { useState } from "react";
import { downloadFile, toCsv } from "../export";
import type { DownloadDataset } from "../downloads";
import Modal from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionKey: number;
  sessionName: string;
  datasets: DownloadDataset[];
}

type Format = "csv" | "json";

/** Explicit, client-side data export for the current session. */
export default function DownloadPanel({ open, onClose, sessionKey, sessionName, datasets }: Props) {
  const [selected, setSelected] = useState<string[]>(datasets.length ? [datasets[0].key] : []);
  const [format, setFormat] = useState<Format>("csv");

  const chosen = datasets.filter((dataset) => selected.includes(dataset.key));
  const csvBlocked = format === "csv" && chosen.length !== 1;

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );

  const run = () => {
    if (!chosen.length) return;
    const stem = `boxbox-${sessionKey}-${sessionName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    if (format === "json") {
      const payload = {
        session_key: sessionKey,
        session: sessionName,
        exported_at: new Date().toISOString(),
        data: Object.fromEntries(chosen.map((dataset) => [dataset.key, dataset.rows])),
      };
      downloadFile(`${stem}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
      onClose();
      return;
    }
    const dataset = chosen[0];
    downloadFile(
      `${stem}-${dataset.key}.csv`,
      toCsv(dataset.rows, dataset.columns),
      "text/csv;charset=utf-8",
    );
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Download session data" subtitle="Client-side export. No new API requests and no secrets." size="wide">
      <div className="download-intro">
        <p className="dim small">
          CSV opens directly in Excel. JSON is a single bundle of every selected
          dataset and is the better choice when you need several tables at once.
        </p>
      </div>

      <div className="download-actions">
        <button type="button" className="chip" onClick={() => setSelected(datasets.map((d) => d.key))}>
          Select all
        </button>
        <button type="button" className="chip" onClick={() => setSelected([])}>
          Clear
        </button>
        <label className="download-format">
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            <option value="csv">CSV (opens in Excel)</option>
            <option value="json">JSON bundle</option>
          </select>
        </label>
      </div>

      <div className="download-grid">
        {datasets.map((dataset) => (
          <label key={dataset.key} className={dataset.rows.length ? "download-item" : "download-item empty"}>
            <input
              type="checkbox"
              checked={selected.includes(dataset.key)}
              disabled={!dataset.rows.length}
              onChange={() => toggle(dataset.key)}
            />
            <span>
              <strong>{dataset.label}</strong>
              <small className="dim">{dataset.description}</small>
              <small className="dim">{dataset.rows.length} rows</small>
            </span>
          </label>
        ))}
      </div>

      {csvBlocked && (
        <p className="dim small">
          CSV exports one table per file. Select one dataset, or switch to JSON
          bundle to include several datasets in one file.
        </p>
      )}
      <div className="download-footer">
        <span className="dim small">
          {chosen.length} dataset{chosen.length === 1 ? "" : "s"} selected
        </span>
        <button type="button" className="primary" disabled={!chosen.length || csvBlocked} onClick={run}>
          Download {format.toUpperCase()}
        </button>
      </div>
    </Modal>
  );
}
