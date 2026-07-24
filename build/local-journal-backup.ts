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

function toCsv(rows: JournalRow[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvValue).join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")),
  ].join("\n");
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

export function localJournalBackup(): Plugin {
  const dataDirectory = path.resolve(process.cwd(), PRIVATE_DATA_DIRECTORY);
  const jsonPath = path.join(dataDirectory, JSON_FILENAME);
  const csvPath = path.join(dataDirectory, CSV_FILENAME);

  return {
    name: "local-journal-backup",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/journal-local-backup", async (request, response, next) => {
        const route = request.url?.split("?")[0] || "/";
        if (request.method !== "POST" || route !== "/") {
          next();
          return;
        }

        try {
          const payload = await readJsonBody(request);
          const incomingRows = validRows(payload.rows);
          if (!incomingRows.length) throw new Error("There are no saved journals to back up.");

          const existing = await readArchive(jsonPath);
          const rowsByKey = new Map(
            existing.rows.map((row) => [String(row["Sync Key"]), row]),
          );
          incomingRows.forEach((row) => rowsByKey.set(String(row["Sync Key"]), row));
          const rows = [...rowsByKey.values()].sort(
            (a, b) => Number(a.Day || 0) - Number(b.Day || 0),
          );
          const archive: JournalArchive = {
            version: 1,
            updatedAt: new Date().toISOString(),
            rows,
          };

          await mkdir(dataDirectory, { recursive: true });
          const temporaryJsonPath = `${jsonPath}.${process.pid}.tmp`;
          await writeFile(temporaryJsonPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
          await rename(temporaryJsonPath, jsonPath);
          await writeFile(csvPath, `${toCsv(rows)}\n`, "utf8");

          sendJson(response, 200, {
            ok: true,
            rowCount: rows.length,
            jsonPath: `${PRIVATE_DATA_DIRECTORY}/${JSON_FILENAME}`,
            csvPath: `${PRIVATE_DATA_DIRECTORY}/${CSV_FILENAME}`,
            updatedAt: archive.updatedAt,
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
