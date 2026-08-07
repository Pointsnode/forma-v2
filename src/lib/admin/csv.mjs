// CSV with the house formula-injection guard: a TEXT cell that starts with = + - @ (or a
// tab/CR) is prefixed with a single quote so a spreadsheet does not execute it. Numbers are
// left intact (a negative amount like -5.00 is data, not a formula). Pure.
export function csvCell(value) {
  let s = value == null ? "" : String(value);
  const dangerous = /^[=+\-@\t\r]/.test(s);
  const isNumber = s !== "" && Number.isFinite(Number(s));
  if (dangerous && !isNumber) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}
