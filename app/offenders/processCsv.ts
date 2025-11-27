"use client";

export interface CsvRow {
  fullName: string;
  firstName: string;
  lastName: string;
  type: string;
  title: string;
  sentDate: string;
}

const HEADER_MAP = {
  firstName: ["user first name"],
  lastName: ["user last name"],
  type: ["type"],
  title: ["title"],
  sentDate: ["sent date (utc)", "sent date"],
};

const splitColumns = (line: string) =>
  line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((col) => col.replace(/^"|"$/g, "").trim());

const findIndex = (headers: string[], keys: string[]) =>
  headers.findIndex((header) => keys.some((key) => header === key));

export function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const headerLine = lines.shift() as string;
  const headerParts = splitColumns(headerLine).map((h) => h.toLowerCase());

  const firstNameIdx = findIndex(headerParts, HEADER_MAP.firstName);
  const lastNameIdx = findIndex(headerParts, HEADER_MAP.lastName);
  const typeIdx = findIndex(headerParts, HEADER_MAP.type);
  const titleIdx = findIndex(headerParts, HEADER_MAP.title);
  const sentDateIdx = findIndex(headerParts, HEADER_MAP.sentDate);

  const indices = [firstNameIdx, lastNameIdx, typeIdx, titleIdx, sentDateIdx];
  if (indices.some((idx) => idx === -1)) return [];

  return lines
    .map((line) => splitColumns(line))
    .map((cols) => {
      const firstName = cols[firstNameIdx] ?? "";
      const lastName = cols[lastNameIdx] ?? "";
      const fullName = `${firstName} ${lastName}`.trim();
      return {
        fullName,
        firstName,
        lastName,
        type: cols[typeIdx] ?? "",
        title: cols[titleIdx] ?? "",
        sentDate: cols[sentDateIdx] ?? "",
      };
    })
    .filter((row) => row.fullName);
}

export const isOffender = (row: CsvRow) => {
  const normalized = row.type.toLowerCase();
  return normalized === "in progress" || normalized === "not started";
};
