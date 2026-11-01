import type { Row } from "../types";
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function downloadRows(rows: Row[], name: string) {
  const keys = ["id", "name", "academyId", "status", "createdAt"];
  const text =
    "\uFEFF" +
    [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(",")),
    ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
