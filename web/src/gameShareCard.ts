/**
 * BoxBox Grid result image, drawn client-side at 1200×630.
 *
 * Pure row/data helpers live here so they can be tested without a canvas.
 * The result image is a share artifact, never a substitute for the in-app table.
 */

import { raceState, type GameDriver, type RaceSim } from "./game";

export const GAME_CARD_W = 1200;
export const GAME_CARD_H = 630;

export interface GameCardRow {
  position: number;
  driverId: string;
  code: string;
  name: string;
  team: string;
  color: string;
  gap: number;
  player: number | null;
  retired: boolean;
}

export interface GameCardData {
  meeting: string;
  laps: number;
  seed: number;
  rows: GameCardRow[];
  totalRows: number;
  winner: GameCardRow | null;
  fastestLap: { code: string; time: number; lap: number } | null;
  biggestMover: { code: string; from: number; to: number } | null;
  winnerBestLap: number | null;
  winnerAverageLap: number | null;
  lapsLed: number;
  players: number;
  dnf: number;
  events: { kind: string; lap: number }[];
}

export function selectGameCardRows(rows: GameCardRow[], limit = 10): GameCardRow[] {
  const selected = rows.slice(0, limit);
  for (const row of rows.slice(limit)) {
    if (row.player != null) selected.push(row);
  }
  return selected;
}

export function buildGameCardData(
  sim: RaceSim,
  drivers: GameDriver[],
  meeting: string,
  seed: number,
): GameCardData {
  const all = sim.preview.map((row) => {
    const driver = drivers.find((item) => item.id === row.driverId);
    return {
      position: row.position,
      driverId: row.driverId,
      code: driver?.code ?? row.driverId,
      name: driver?.name ?? row.driverId,
      team: driver?.team ?? "—",
      color: driver?.color ?? "#8A94A6",
      gap: row.gap,
      player: row.player,
      retired: row.retired,
    };
  });
  let fastestLap: GameCardData["fastestLap"] = null;
  for (const driver of sim.drivers) {
    const completedLaps = driver.retiredLap == null ? sim.laps : Math.max(0, driver.retiredLap - 1);
    for (let index = 0; index < completedLaps; index += 1) {
      const time = driver.lapTimes[index];
      if (time != null && (!fastestLap || time < fastestLap.time)) {
        fastestLap = {
          code: drivers.find((item) => item.id === driver.id)?.code ?? driver.id,
          time,
          lap: index + 1,
        };
      }
    }
  }
  const winner = all.find((row) => !row.retired) ?? null;
  const winnerDriver = winner ? sim.drivers.find((driver) => driver.id === winner.driverId) : null;
  const winnerTimes = winnerDriver
    ? winnerDriver.lapTimes.slice(0, sim.laps).filter((time) => time > 0)
    : [];
  const winnerBestLap = winnerTimes.length ? Math.min(...winnerTimes) : null;
  const winnerAverageLap = winnerTimes.length
    ? winnerTimes.reduce((sum, time) => sum + time, 0) / winnerTimes.length
    : null;
  let lapsLed = 0;
  if (winner) {
    for (let lap = 1; lap <= sim.laps; lap += 1) {
      const state = raceState(sim, lap * sim.baseLap);
      if (state.leaderId === winner.driverId) lapsLed += 1;
    }
  }
  const gridPositions = new Map(sim.grid.map((row) => [row.driverId, row.position]));
  let biggestMover: GameCardData["biggestMover"] = null;
  for (const row of all) {
    if (row.retired) continue;
    const from = gridPositions.get(row.driverId);
    if (from == null) continue;
    const gained = from - row.position;
    if (gained > 0 && (!biggestMover || gained > biggestMover.from - biggestMover.to)) {
      biggestMover = { code: row.code, from, to: row.position };
    }
  }
  return {
    meeting,
    laps: sim.laps,
    seed,
    rows: selectGameCardRows(all),
    totalRows: all.length,
    winner,
    fastestLap,
    biggestMover,
    winnerBestLap,
    winnerAverageLap,
    lapsLed,
    players: all.filter((row) => row.player != null).length,
    dnf: all.filter((row) => row.retired).length,
    events: sim.events.map((event) => ({ kind: event.kind, lap: event.lap })),
  };
}

function fmtGap(row: GameCardRow): string {
  if (row.retired) return "DNF";
  if (row.position === 1) return "winner";
  return `+${row.gap.toFixed(3)}`;
}

function fmtLap(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function draw(ctx: CanvasRenderingContext2D, data: GameCardData): void {
  const width = GAME_CARD_W;
  const height = GAME_CARD_H;
  const ink = "#E9EEF5";
  const dim = "#8592A3";
  const amber = "#FFB224";
  const panel = "#14181F";
  const line = "#303947";
  const red = "#FF6B6B";

  ctx.fillStyle = "#0B0E13";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, width, 96);
  ctx.fillStyle = amber;
  ctx.fillRect(48, 32, 6, 30);

  ctx.fillStyle = ink;
  ctx.font = "700 34px 'Barlow Condensed', system-ui, sans-serif";
  ctx.fillText("BoxBox Grid", 68, 58);
  ctx.fillStyle = dim;
  ctx.font = "500 15px system-ui, sans-serif";
  ctx.fillText("LOCAL RACE ROOM · RESULT", 68, 80);

  ctx.textAlign = "right";
  ctx.fillStyle = amber;
  ctx.font = "700 18px 'JetBrains Mono', monospace";
  ctx.fillText(`SEED ${data.seed}`, width - 48, 54);
  ctx.fillStyle = dim;
  ctx.font = "500 15px system-ui, sans-serif";
  ctx.fillText("game model · not a prediction", width - 48, 78);
  ctx.textAlign = "left";

  ctx.fillStyle = ink;
  ctx.font = "700 40px 'Barlow Condensed', system-ui, sans-serif";
  ctx.fillText(
    data.winner ? `${data.winner.name} wins.` : "Race complete.",
    48,
    154,
  );
  ctx.fillStyle = dim;
  ctx.font = "400 17px system-ui, sans-serif";
  ctx.fillText(`${data.meeting} · ${data.laps} laps`, 48, 181);
  ctx.fillText(
    data.totalRows === data.rows.length
      ? `${data.totalRows} classified`
      : `Top 10 + players · ${data.totalRows} classified`,
    48,
    203,
  );
  if (data.winnerBestLap != null || data.winnerAverageLap != null) {
    ctx.fillStyle = amber;
    ctx.font = "500 13px 'JetBrains Mono', monospace";
    ctx.fillText(
      [
        data.winnerBestLap != null ? `BEST ${fmtLap(data.winnerBestLap)}` : null,
        data.winnerAverageLap != null ? `AVG ${fmtLap(data.winnerAverageLap)}` : null,
      ].filter(Boolean).join("  ·  "),
      48,
      222,
    );
  }

  if (data.winner) {
    ctx.fillStyle = data.winner.color;
    ctx.fillRect(width - 210, 132, 4, 52);
    ctx.fillStyle = ink;
    ctx.font = "700 24px 'Barlow Condensed', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(data.winner.code, width - 52, 154);
    ctx.font = "500 14px system-ui, sans-serif";
    ctx.fillStyle = dim;
    ctx.fillText(
      data.winner.player ? `PLAYER P${data.winner.player}` : "AI",
      width - 52,
      176,
    );
    ctx.textAlign = "left";
  }

  const statY = 242;
  const statH = 48;
  const statW = (width - 96 - 40) / 5;
  const stats = [
    ["FASTEST LAP", data.fastestLap ? `${data.fastestLap.code} ${fmtLap(data.fastestLap.time)}` : "—"],
    ["BIGGEST MOVER", data.biggestMover ? `${data.biggestMover.code} +${data.biggestMover.from - data.biggestMover.to}` : "—"],
    ["LAPS LED", `${data.lapsLed} / ${data.laps}`],
    ["PLAYERS", `${data.players} / ${data.totalRows}`],
    ["INCIDENTS", data.events.length ? `${data.events.length} · ${data.dnf} DNF` : `0 · ${data.dnf} DNF`],
  ] as const;
  stats.forEach(([label, value], index) => {
    const x = 48 + index * (statW + 10);
    ctx.fillStyle = panel;
    ctx.fillRect(x, statY, statW, statH);
    ctx.fillStyle = dim;
    ctx.font = "600 10px 'JetBrains Mono', monospace";
    ctx.fillText(label, x + 10, statY + 16);
    ctx.fillStyle = ink;
    ctx.font = "700 16px 'Barlow Condensed', system-ui, sans-serif";
    ctx.fillText(value, x + 10, statY + 37);
  });

  const tableTop = 296;
  const rowHeight = 17;
  const columns = [48, 96, 300, 700, 850];
  ctx.fillStyle = dim;
  ctx.font = "600 11px 'JetBrains Mono', monospace";
  ctx.fillText("POS", columns[0], tableTop);
  ctx.fillText("DRIVER", columns[1], tableTop);
  ctx.fillText("TEAM", columns[2], tableTop);
  ctx.fillText("GAP", columns[3], tableTop);
  ctx.fillText("PLAYER", columns[4], tableTop);
  ctx.fillStyle = line;
  ctx.fillRect(48, tableTop + 8, width - 96, 1);

  data.rows.forEach((row, index) => {
    const y = tableTop + 32 + index * rowHeight;
    if (row.player) {
      ctx.fillStyle = "rgba(255,178,36,0.09)";
      ctx.fillRect(40, y - 17, width - 80, rowHeight);
    }
    ctx.fillStyle = row.retired ? red : ink;
    ctx.font = "600 14px 'JetBrains Mono', monospace";
    ctx.fillText(String(row.position), columns[0], y);
    ctx.fillStyle = row.color;
    ctx.fillRect(columns[1], y - 10, 3, 13);
    ctx.fillStyle = ink;
    ctx.font = "700 15px 'Barlow Condensed', system-ui, sans-serif";
    ctx.fillText(row.code, columns[1] + 10, y);
    ctx.fillStyle = dim;
    ctx.font = "400 13px system-ui, sans-serif";
    ctx.fillText(row.team, columns[2], y);
    ctx.fillStyle = row.retired ? red : ink;
    ctx.font = "500 13px 'JetBrains Mono', monospace";
    ctx.fillText(fmtGap(row), columns[3], y);
    ctx.fillStyle = row.player ? amber : dim;
    ctx.font = "600 11px 'JetBrains Mono', monospace";
    ctx.fillText(row.player ? `P${row.player}` : "AI", columns[4], y);
  });

  const footerY = height - 48;
  ctx.fillStyle = dim;
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillText(
    data.events.length
      ? `Incidents: ${data.events.map((event) => `${event.kind} L${event.lap}`).join(" · ")}`
      : "No seeded incidents.",
    48,
    footerY - 20,
  );
  ctx.fillStyle = dim;
  ctx.fillText(
    "boxbox-replay · local seeded game model · not a prediction · no tyre/pit/collision physics",
    48,
    footerY,
  );
}

export function renderGameShareCard(data: GameCardData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GAME_CARD_W;
  canvas.height = GAME_CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  draw(ctx, data);
  return canvas;
}

/** Trigger a 1200×630 PNG download. Resolves once the browser has started it. */
export function downloadGameShareCard(data: GameCardData): Promise<void> {
  const canvas = renderGameShareCard(data);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create the result image."));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `boxbox-grid-${data.meeting.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${data.laps}-laps.png`;
      link.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}
