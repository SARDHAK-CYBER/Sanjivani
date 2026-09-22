/**
 * Quotes one CSV cell and defuses spreadsheet formula injection.
 *
 * Excel/Sheets execute a cell that starts with = + - @ (or a tab/CR). Audit rows contain
 * attacker-controlled text (a User-Agent header becomes "device fingerprint"), so without this an
 * outsider could plant `=HYPERLINK(...)` in a file an admin then opens.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
