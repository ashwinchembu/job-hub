import { stat } from "node:fs/promises";
import path from "node:path";
import { readSheet } from "read-excel-file/node";
import type { Plugin } from "vite";

type CellValue = string | number | boolean | Date | null;

type SyncedApplication = {
  id: string;
  company: string;
  role: string;
  location: string;
  status: "Saved" | "Preparing" | "Applied" | "Interviewing" | "Offer" | "Rejected" | "Closed";
  workbookStatus: string;
  appliedDate: string;
  followUpDate: string;
  salaryMin: string;
  salaryMax: string;
  source: string;
  link: string;
  priority: "High" | "Medium" | "Low";
  notes: string;
  nextAction: string;
  currentRound: string;
  completedRounds: number;
  latestEmail: string;
  latestEmailSubject: string;
  resumePath: string;
  sheetSynced: true;
};

const DEFAULT_TRACKER_RELATIVE_PATH =
  "../outputs/2026-07-19-sf-job-tracker/Ashwin_Chembu_SF_Job_Tracker.xlsx";

function cleanText(value: CellValue | undefined) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function dateToISO(value: CellValue | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86_400_000).toISOString().slice(0, 10);
  }
  return cleanText(value);
}

function normalizeHeader(value: CellValue | undefined) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeStatus(workbookStatus: string, currentRound: string): SyncedApplication["status"] {
  const value = `${workbookStatus} ${currentRound}`.toLowerCase();
  if (value.includes("reject")) return "Rejected";
  if (value.includes("offer")) return "Offer";
  if (value.includes("interview") || value.includes("technical") || value.includes("onsite")) {
    return "Interviewing";
  }
  if (value.includes("exclude") || value.includes("withdraw") || value.includes("closed")) return "Closed";
  if (value.includes("submit") || value.includes("applied") || value.includes("application review")) return "Applied";
  if (value.includes("prepar") || value.includes("block")) return "Preparing";
  return "Saved";
}

function priorityFor(workbookStatus: string, status: SyncedApplication["status"]): SyncedApplication["priority"] {
  const exact = workbookStatus.toLowerCase();
  if (status === "Interviewing" || status === "Offer" || exact.includes("prepared") || exact.includes("blocked")) {
    return "High";
  }
  if (status === "Applied") return "Medium";
  return "Low";
}

function stableSheetId(company: string, role: string, rowNumber: number) {
  const slug = `${company}-${role}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110);
  return `sheet-${slug || rowNumber}`;
}

function mapApplications(rows: CellValue[][]): SyncedApplication[] {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];

  const headerIndexes = new Map(headerRow.map((header, index) => [normalizeHeader(header), index]));
  const value = (row: CellValue[], header: string) => row[headerIndexes.get(normalizeHeader(header)) ?? -1];

  if (!headerIndexes.has("company") || !headerIndexes.has("role") || !headerIndexes.has("status")) {
    throw new Error("The Applications sheet is missing Company, Role, or Status columns.");
  }

  return dataRows
    .map((row, index) => {
      const company = cleanText(value(row, "Company"));
      const role = cleanText(value(row, "Role"));
      if (!company || !role) return null;

      const workbookStatus = cleanText(value(row, "Status")) || "Saved";
      const currentRound = cleanText(value(row, "Current Round"));
      const status = normalizeStatus(workbookStatus, currentRound);
      const completedRounds = Number(value(row, "Completed Rounds"));

      return {
        id: stableSheetId(company, role, index + 2),
        company,
        role,
        location: cleanText(value(row, "Location")),
        status,
        workbookStatus,
        appliedDate: dateToISO(value(row, "Application / Prep Date")),
        followUpDate: "",
        salaryMin: cleanText(value(row, "Min Base")),
        salaryMax: cleanText(value(row, "Max Base")),
        source: cleanText(value(row, "Source")),
        link: "",
        priority: priorityFor(workbookStatus, status),
        notes: cleanText(value(row, "Notes")),
        nextAction: cleanText(value(row, "Next Action")),
        currentRound,
        completedRounds: Number.isFinite(completedRounds) ? completedRounds : 0,
        latestEmail: dateToISO(value(row, "Latest Email")),
        latestEmailSubject: cleanText(value(row, "Latest Email Subject")),
        resumePath: cleanText(value(row, "Resume")),
        sheetSynced: true as const,
      };
    })
    .filter((application): application is SyncedApplication => application !== null);
}

function resolveTrackerPath() {
  const configuredPath = process.env.JOB_TRACKER_PATH?.trim();
  return path.resolve(process.cwd(), configuredPath || DEFAULT_TRACKER_RELATIVE_PATH);
}

export function localJobTracker(): Plugin {
  const trackerPath = resolveTrackerPath();
  let cachedModifiedAt = -1;
  let cachedApplications: SyncedApplication[] = [];

  return {
    name: "local-job-tracker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/job-tracker", async (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }

        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");

        try {
          const file = await stat(trackerPath);
          if (file.mtimeMs !== cachedModifiedAt) {
            const rows = (await readSheet(trackerPath, "Applications")) as CellValue[][];
            cachedApplications = mapApplications(rows);
            cachedModifiedAt = file.mtimeMs;
          }

          response.statusCode = 200;
          response.end(
            JSON.stringify({
              applications: cachedApplications,
              source: {
                workbook: path.basename(trackerPath),
                sheet: "Applications",
                modifiedAt: new Date(cachedModifiedAt).toISOString(),
                checkedAt: new Date().toISOString(),
                rowCount: cachedApplications.length,
              },
            }),
          );
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
          response.statusCode = code === "ENOENT" ? 404 : 500;
          response.end(
            JSON.stringify({
              error:
                code === "ENOENT"
                  ? "The local job tracker workbook was not found."
                  : error instanceof Error
                    ? error.message
                    : "The local job tracker workbook could not be read.",
            }),
          );
        }
      });
    },
  };
}
