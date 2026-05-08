import { parse } from "csv-parse/sync";

export function detectDelimiter(headerLine: string) {
  const delimiters = [",", "\t", ";", "|"];
  const scored = delimiters.map((delimiter) => ({
    delimiter,
    count: (headerLine.match(new RegExp(`\\${delimiter}`, "g")) || []).length,
  }));
  const best = scored.sort((a, b) => b.count - a.count)[0];
  return best && best.count > 0 ? best.delimiter : ",";
}

export function parseCsvText(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const headerLine =
    text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const delimiter = detectDelimiter(headerLine);

  const headers = (
    ((parse(headerLine, {
      bom: true,
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][])[0] ?? []) as string[]
  ).map((header) => (header ?? "").trim());

  if (!headers.length || headers.every((header) => !header)) {
    throw new Error("No headers detected in CSV");
  }

  const rows = parse(text, {
    bom: true,
    columns: (rawHeaders: string[]) => rawHeaders.map((header) => (header ?? "").trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    delimiter,
    info: false,
  }) as Record<string, string>[];

  return { headers: headers.filter(Boolean), rows };
}
