import ExcelJS from "exceljs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";

type JournalRow = Record<string, string | number>;

type JournalArchive = {
  version: 1;
  updatedAt: string;
  rows: JournalRow[];
};

const MAX_BODY_BYTES = 2_000_000;
const PRIVATE_DATA_DIRECTORY = "private-data";
const JSON_FILENAME = "job-hub-journals.json";
const CSV_FILENAME = "job-hub-journals.csv";
const XLSX_FILENAME = "Job_Hub_LeetCode_Journal.xlsx";
const JOURNAL_COLUMNS = [
  ["Sync Key", 18],
  ["Problem ID", 11],
  ["Problem", 28],
  ["Day", 9],
  ["Week", 9],
  ["Pattern", 24],
  ["Difficulty", 14],
  ["Status", 20],
  ["Confidence", 12],
  ["Total Seconds", 14],
  ["Time (HH:MM:SS)", 16],
  ["Independence Score", 17],
  ["Final Score", 12],
  ["Verdict", 16],
  ["Code Correctness", 15],
  ["Approach & Reasoning", 18],
  ["Complexity Analysis", 18],
  ["Edge-Case Coverage", 17],
  ["Reasoning Clarity", 17],
  ["Missing Inputs", 30],
  ["Issues to Fix", 38],
  ["Next Action", 34],
  ["Review Summary", 34],
  ["Last Attempt", 16],
  ["Reviewed At", 20],
  ["Language", 14],
  ["Code", 46],
  ["Brute-Force Approach", 38],
  ["Brute-Force Time", 22],
  ["Brute-Force Space", 22],
  ["Invariant / Decision Rule", 40],
  ["Optimal Steps", 42],
  ["Optimal Time", 22],
  ["Optimal Space", 22],
  ["Edge Cases & Tests", 38],
  ["Mistakes / Bug Cause", 38],
  ["Hints Used", 26],
  ["Last Synced", 20],
] as const;

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        reject(new Error("The journal backup is too large to write in one request."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        resolve(parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {});
      } catch {
        reject(new Error("The local journal backup request was not valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function validRows(value: unknown): JournalRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is JournalRow => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const syncKey = (row as Record<string, unknown>)["Sync Key"];
    return typeof syncKey === "string" && Boolean(syncKey.trim());
  }) as JournalRow[];
}

function csvValue(value: string | number | undefined) {
  const text = value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function journalValue(row: JournalRow, header: string) {
  if (header === "Reasoning Clarity") {
    return row[header] ?? row["Explanation Quality"];
  }
  return row[header];
}

function toCsv(rows: JournalRow[]) {
  const headers = JOURNAL_COLUMNS.map(([header]) => header);
  return [
    headers.map(csvValue).join(","),
    ...rows.map((row) => headers.map((header) => csvValue(journalValue(row, header))).join(",")),
  ].join("\n");
}

function argb(hex: string) {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

async function writeLocalWorkbook(rows: JournalRow[], xlsxPath: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Job Hub";
  workbook.lastModifiedBy = "Job Hub";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = "LeetCode journals, AI scores, and daily review evidence";

  const journal = workbook.addWorksheet("Journal Log", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  journal.columns = JOURNAL_COLUMNS.map(([header, width]) => ({
    header,
    key: header,
    width,
  }));
  journal.autoFilter = { from: "A1", to: "AL1" };
  journal.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  journal.getRow(1).height = 34;
  journal.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#173F35") } };
    cell.font = { bold: true, color: { argb: argb("#FFFFFF") }, size: 10 };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: argb("#8BA99C") } } };
  });

  rows.forEach((record) => {
    const row = journal.addRow({
      ...record,
      "Reasoning Clarity": journalValue(record, "Reasoning Clarity"),
    });
    row.height = 54;
    row.eachCell((cell, columnNumber) => {
      cell.alignment = {
        vertical: "top",
        wrapText: columnNumber >= 20 || [3, 6, 8].includes(columnNumber),
      };
      cell.font = { color: { argb: argb("#16221E") }, size: 10 };
      cell.border = { bottom: { style: "hair", color: { argb: argb("#D8E0DB") } } };
    });
    const status = String(record.Status || "");
    if (status.startsWith("Solved")) {
      row.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#DDEFD9") } };
      row.getCell(8).font = { bold: true, color: { argb: argb("#245A42") }, size: 10 };
    }
    const difficulty = String(record.Difficulty || "");
    const difficultyColor = difficulty === "Hard" ? "#F6D7CF" : difficulty === "Medium" ? "#F7E7A5" : "#DDE9E1";
    row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(difficultyColor) } };
    for (let column = 12; column <= 19; column += 1) {
      const rawScore = row.getCell(column).value;
      if (rawScore === null || rawScore === undefined || rawScore === "") continue;
      const score = Number(rawScore);
      if (!Number.isFinite(score)) continue;
      const color = score >= 80 ? "#DDEFD9" : score >= 60 ? "#FFF1BF" : "#FADBD4";
      row.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(color) } };
      row.getCell(column).numFmt = "0";
    }
  });

  for (let rowNumber = 2; rowNumber <= 1000; rowNumber += 1) {
    journal.getCell(`H${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Not Started,Attempted,Solved with Hint,Solved Independently"'],
    };
    journal.getCell(`I${rowNumber}`).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [0, 5],
    };
  }

  const focus = workbook.addWorksheet("Review Focus", {
    views: [{ state: "frozen", ySplit: 7 }],
    properties: { defaultRowHeight: 20 },
  });
  focus.mergeCells("A1:H1");
  focus.getCell("A1").value = "Job Hub Review Focus";
  focus.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#173F35") } };
  focus.getCell("A1").font = { bold: true, color: { argb: argb("#FFFFFF") }, size: 18 };
  focus.getCell("A1").alignment = { vertical: "middle" };
  focus.getRow(1).height = 40;
  focus.mergeCells("A2:H2");
  focus.getCell("A2").value = "Recent scored journals are summarized here so repeated gaps become the next practice focus.";
  focus.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#EEF5EF") } };
  focus.getCell("A2").font = { italic: true, color: { argb: argb("#52645C") }, size: 10 };
  focus.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  focus.getRow(2).height = 32;

  const reviewed = rows
    .filter((row) => row["Final Score"] !== "" && row["Final Score"] !== undefined)
    .sort((a, b) => String(b["Reviewed At"] || "").localeCompare(String(a["Reviewed At"] || "")));
  const average = (key: string) => reviewed.length
    ? Math.round(reviewed.reduce((sum, row) => sum + Number(row[key] || 0), 0) / reviewed.length)
    : 0;
  const metrics = [
    ["A4:B4", "A5:B5", "Journals", rows.length],
    ["C4:D4", "C5:D5", "AI reviews", reviewed.length],
    ["E4:F4", "E5:F5", "Average final score", average("Final Score")],
    ["G4:H4", "G5:H5", "Average independence", average("Independence Score")],
  ] as const;
  metrics.forEach(([labelRange, valueRange, label, value]) => {
    focus.mergeCells(labelRange);
    focus.mergeCells(valueRange);
    const labelCell = focus.getCell(labelRange.split(":")[0]);
    const valueCell = focus.getCell(valueRange.split(":")[0]);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: argb("#52645C") }, size: 10 };
    valueCell.value = value;
    valueCell.font = { bold: true, color: { argb: argb("#173F35") }, size: 22 };
    valueCell.alignment = { horizontal: "center" };
    [labelCell, valueCell].forEach((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#FFFDF8") } };
      cell.border = {
        top: { style: "thin", color: { argb: argb("#C8D7CE") } },
        left: { style: "thin", color: { argb: argb("#C8D7CE") } },
        bottom: { style: "thin", color: { argb: argb("#C8D7CE") } },
        right: { style: "thin", color: { argb: argb("#C8D7CE") } },
      };
    });
  });

  const focusHeaders = ["Problem", "Final score", "Independence", "Missing inputs", "Issues to fix", "Next action", "Reviewed at", "Status"];
  focus.addRow([]);
  const focusHeaderRow = focus.addRow(focusHeaders);
  focusHeaderRow.height = 30;
  focusHeaderRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#E6DFF7") } };
    cell.font = { bold: true, color: { argb: argb("#4D3978") }, size: 10 };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  reviewed.slice(0, 12).forEach((record) => {
    const row = focus.addRow([
      record.Problem,
      record["Final Score"],
      record["Independence Score"],
      record["Missing Inputs"],
      record["Issues to Fix"],
      record["Next Action"],
      record["Reviewed At"],
      record.Status,
    ]);
    row.height = 72;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: argb("#D8D2E4") } } };
    });
  });
  if (!reviewed.length) {
    focus.mergeCells("A8:H8");
    focus.getCell("A8").value = "Your scored journals will appear here after the first saved AI review.";
    focus.getCell("A8").font = { italic: true, color: { argb: argb("#665A79") } };
  }
  [26, 14, 14, 30, 38, 34, 20, 20].forEach((width, index) => {
    focus.getColumn(index + 1).width = width;
  });

  const missingCounts = new Map<string, number>();
  reviewed.slice(0, 3).forEach((row) => {
    String(row["Missing Inputs"] || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => missingCounts.set(item, (missingCounts.get(item) || 0) + 1));
  });
  const repeatedMissing = [...missingCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([item, count]) => `${item}${count > 1 ? ` (${count}×)` : ""}`)
    .join(" · ");
  const focusRow = Math.max(10, 8 + Math.min(reviewed.length, 12) + 2);
  focus.mergeCells(`A${focusRow}:H${focusRow}`);
  focus.getCell(`A${focusRow}`).value = repeatedMissing
    ? `Next practice focus: ${repeatedMissing}`
    : "Next practice focus: complete every journal section, then explain the decision, implementation, validation, and learning.";
  focus.getCell(`A${focusRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#FFF1BF") } };
  focus.getCell(`A${focusRow}`).font = { bold: true, color: { argb: argb("#6A5917") }, size: 10 };
  focus.getCell(`A${focusRow}`).alignment = { wrapText: true, vertical: "middle" };
  focus.getRow(focusRow).height = 34;

  const temporaryXlsxPath = `${xlsxPath}.${process.pid}.tmp.xlsx`;
  await workbook.xlsx.writeFile(temporaryXlsxPath);
  await rename(temporaryXlsxPath, xlsxPath);
}

async function readArchive(jsonPath: string): Promise<JournalArchive> {
  try {
    const parsed = JSON.parse(await readFile(jsonPath, "utf8")) as Partial<JournalArchive>;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      rows: validRows(parsed.rows),
    };
  } catch {
    return { version: 1, updatedAt: "", rows: [] };
  }
}

async function writeArchiveFiles(
  archive: JournalArchive,
  dataDirectory: string,
  jsonPath: string,
  csvPath: string,
  xlsxPath: string,
) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryJsonPath = `${jsonPath}.${process.pid}.tmp`;
  await writeFile(temporaryJsonPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
  await rename(temporaryJsonPath, jsonPath);
  await writeFile(csvPath, `${toCsv(archive.rows)}\n`, "utf8");
  await writeLocalWorkbook(archive.rows, xlsxPath);
}

export function localJournalBackup(): Plugin {
  const dataDirectory = path.resolve(process.cwd(), PRIVATE_DATA_DIRECTORY);
  const jsonPath = path.join(dataDirectory, JSON_FILENAME);
  const csvPath = path.join(dataDirectory, CSV_FILENAME);
  const xlsxPath = path.join(dataDirectory, XLSX_FILENAME);

  return {
    name: "local-journal-backup",
    apply: "serve",
    configureServer(server) {
      let writeQueue = (async () => {
        const existing = await readArchive(jsonPath);
        const archive: JournalArchive = existing.updatedAt
          ? existing
          : { ...existing, updatedAt: new Date().toISOString() };
        await writeArchiveFiles(archive, dataDirectory, jsonPath, csvPath, xlsxPath);
      })();
      writeQueue.catch((error) => {
        server.config.logger.warn(
          `Could not initialize the local journal workbook: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

      server.middlewares.use("/api/journal-local-backup", async (request, response, next) => {
        const route = request.url?.split("?")[0] || "/";
        if (request.method !== "POST" || route !== "/") {
          next();
          return;
        }

        try {
          const payload = await readJsonBody(request);
          const incomingRows = validRows(payload.rows);
          const replace = payload.replace === true;
          if (!incomingRows.length && !replace) throw new Error("There are no saved journals to back up.");

          let archive: JournalArchive | undefined;
          writeQueue = writeQueue
            .catch(() => undefined)
            .then(async () => {
              const existing = replace
                ? { version: 1 as const, updatedAt: "", rows: [] }
                : await readArchive(jsonPath);
              const rowsByKey = new Map(
                existing.rows.map((row) => [String(row["Sync Key"]), row]),
              );
              incomingRows.forEach((row) => rowsByKey.set(String(row["Sync Key"]), row));
              const rows = [...rowsByKey.values()].sort(
                (a, b) => Number(a.Day || 0) - Number(b.Day || 0),
              );
              archive = {
                version: 1,
                updatedAt: new Date().toISOString(),
                rows,
              };
              await writeArchiveFiles(archive, dataDirectory, jsonPath, csvPath, xlsxPath);
            });
          await writeQueue;

          sendJson(response, 200, {
            ok: true,
            rowCount: archive?.rows.length ?? 0,
            jsonPath: `${PRIVATE_DATA_DIRECTORY}/${JSON_FILENAME}`,
            csvPath: `${PRIVATE_DATA_DIRECTORY}/${CSV_FILENAME}`,
            xlsxPath: `${PRIVATE_DATA_DIRECTORY}/${XLSX_FILENAME}`,
            updatedAt: archive?.updatedAt ?? "",
          });
        } catch (error) {
          sendJson(response, 400, {
            ok: false,
            error: error instanceof Error ? error.message : "The local journal backup could not be written.",
          });
        }
      });
    },
  };
}
