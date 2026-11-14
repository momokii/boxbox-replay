import { describe, expect, it } from "vitest";
import { toCsv } from "./export";

const columns = [
  { key: "driver", label: "Driver" },
  { key: "note", label: "Note" },
];

describe("toCsv", () => {
  it("writes a header and rows in column order", () => {
    expect(toCsv([{ driver: 1, note: "ok" }], columns)).toBe("Driver,Note\n1,ok");
  });

  it("quotes commas, quotes and newlines", () => {
    const csv = toCsv([{ driver: 1, note: 'a,b "c"\nd' }], columns);
    expect(csv).toBe('Driver,Note\n1,"a,b ""c""\nd"');
  });

  it("renders null and undefined as empty cells", () => {
    expect(toCsv([{ driver: null, note: undefined }], columns)).toBe("Driver,Note\n,");
  });
});
