import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const MAX_BODY_BYTES = 2_000_000;

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
        reject(new Error("The journal backup is too large to sync in one request."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        resolve(parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {});
      } catch {
        reject(new Error("The journal sync request was not valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function validateWebhookUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Add the Apps Script web-app URL in Data & backup.");
  }
  const url = new URL(value.trim());
  const isAppsScript =
    url.protocol === "https:" &&
    url.hostname === "script.google.com" &&
    /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname);
  if (!isAppsScript) {
    throw new Error("Use the Apps Script web-app URL that starts with script.google.com and ends in /exec.");
  }
  return url.toString();
}

export function localGoogleJournal(): Plugin {
  return {
    name: "local-google-journal",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/journal-sync", async (request, response, next) => {
        const route = request.url?.split("?")[0] || "/";
        if (request.method !== "POST" || route !== "/") {
          next();
          return;
        }

        try {
          const payload = await readJsonBody(request);
          const webhookUrl = validateWebhookUrl(payload.webhookUrl);
          const rows = Array.isArray(payload.rows) ? payload.rows : [];
          if (!rows.length) throw new Error("There are no saved journals to sync.");

          const upstream = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify({ rows }),
            redirect: "follow",
          });
          const text = await upstream.text();
          if (!upstream.ok) {
            throw new Error(`Google Sheets returned ${upstream.status}. Re-deploy the Apps Script web app and try again.`);
          }
          if (/accounts\.google\.com|sign in/i.test(text)) {
            throw new Error("The Apps Script web app still requires sign-in. Deploy it with link access, then try again.");
          }

          let result: unknown = text;
          try {
            result = JSON.parse(text);
          } catch {
            // Apps Script may return an empty body after following its deployment redirect.
          }
          sendJson(response, 200, { ok: true, rows: rows.length, result });
        } catch (error) {
          sendJson(response, 400, {
            ok: false,
            error: error instanceof Error ? error.message : "Google Sheets could not be reached.",
          });
        }
      });
    },
  };
}
