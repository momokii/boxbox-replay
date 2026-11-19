import { useState } from "react";
import { api } from "../api";
import { buildSessionDatasets, type DownloadDataset } from "../downloads";
import DownloadPanel from "./DownloadPanel";

interface Props {
  sessionKey: number;
  sessionName: string;
}

/** Session-wide download, reachable directly from the header. */
export default function SessionDownloadButton({ sessionKey, sessionName }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [datasets, setDatasets] = useState<DownloadDataset[] | null>(null);

  const start = async () => {
    if (datasets) {
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const [laps, stints, weather, control, radio, pit, overtakes, result] = await Promise.all([
        api.laps(sessionKey),
        api.stints(sessionKey),
        api.weather(sessionKey),
        api.raceControl(sessionKey),
        api.radio(sessionKey),
        api.sessionPit(sessionKey),
        api.sessionOvertakes(sessionKey),
        api.sessionResult(sessionKey),
      ]);
      setDatasets(
        buildSessionDatasets({
          laps,
          stints,
          weather,
          control,
          radio,
          pitStops: pit.stops,
          pitSummary: pit.summary,
          overtakeCounts: overtakes.counts,
          result,
        }),
      );
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="archive-open"
        onClick={start}
        disabled={loading}
        title="Download session-wide data as CSV or JSON"
      >
        {loading ? "Preparing…" : "Download"}
      </button>
      {open && datasets && (
        <DownloadPanel
          open={open}
          onClose={() => setOpen(false)}
          sessionKey={sessionKey}
          sessionName={sessionName}
          datasets={datasets}
        />
      )}
    </>
  );
}
