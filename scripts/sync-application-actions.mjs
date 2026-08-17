#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function parseJsonLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
}

function pacificDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp || "")) {
    throw new Error(`Invalid timezone-aware recordedAt: ${timestamp || "missing"}`);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function stableId(company, role) {
  return `backend-${company}-${role}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function publishedSalaryRange(value) {
  const amounts = String(value || "")
    .match(/\$?\d[\d,]*/g)
    ?.map((amount) => Number(amount.replace(/[$,]/g, "")))
    .filter((amount) => Number.isFinite(amount) && amount >= 10_000) || [];
  return {
    salaryMin: amounts[0] ? String(amounts[0]) : "",
    salaryMax: amounts[1] ? String(amounts[1]) : amounts[0] ? String(amounts[0]) : "",
  };
}

function baseApplication(action, request) {
  const submitted = action.action === "SUBMITTED";
  const applicationDate = submitted ? pacificDate(action.recordedAt) : "";
  const salary = publishedSalaryRange(request?.publishedBaseRange);
  return {
    id: stableId(action.company, action.role),
    company: action.company,
    role: action.role,
    location: request?.sfLocation || request?.workModel || "",
    status: submitted ? "Applied" : "Preparing",
    workbookStatus: submitted ? "Submitted" : "Blocked",
    appliedDate: applicationDate,
    followUpDate: "",
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    source: action.directUrl ? `Official application · ${new URL(action.directUrl).hostname}` : "Authoritative job-finder action",
    link: action.directUrl || "",
    priority: "High",
    notes: action.confirmation || action.reason || action.note || "Authoritative job-finder action recorded.",
    nextAction: submitted ? "Daily morning Gmail status check" : "Verify the uncertain submission outcome before retrying",
    currentRound: submitted ? "Application submitted" : "Submission outcome uncertain",
    completedRounds: 0,
    latestEmail: action.receipt?.receivedAt || action.receipt?.sentAt || "",
    latestEmailSubject: action.receipt?.subject || "",
    resumePath: request?.tailoredResumePath || "",
    sheetSynced: true,
  };
}

async function postAction(baseUrl, token, payload, { allowMissing = false } = {}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/application-actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "OAI-Sites-Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if (allowMissing && response.status === 400 && /No matching backend application/.test(body.error || "")) {
      return { missing: true };
    }
    if (response.status !== 409 || attempt === 3) {
      throw new Error(`${payload.idempotencyKey || payload.approvalId}: ${body.error || `HTTP ${response.status}`}`);
    }
  }
}

const actionFile = path.resolve(argument("--actions", "../tmp/approval_bridge/application_actions.jsonl"));
const requestFile = path.resolve(argument("--requests", "../tmp/approval_bridge/approval_requests.jsonl"));
const baseUrl = argument("--base-url", process.env.JOB_HUB_BASE_URL || "");
const approvalIds = new Set(argument("--approval-ids").split(",").map((value) => value.trim()).filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
const allowAll = process.argv.includes("--all");
const token = process.env.JOB_HUB_SIWC_BYPASS_TOKEN || "";

if (!baseUrl) throw new Error("JOB_HUB_BASE_URL or --base-url is required.");

const actions = parseJsonLines(await readFile(actionFile, "utf8"))
  .map((item) => ({
    ...item,
    approvalId: item.approvalId || item.actionId || item.idempotencyKey,
    directUrl: item.directUrl || item.officialJobUrl,
    confirmation: item.confirmation || item.confirmationText,
    immutableArtifactPath: item.immutableArtifactPath,
    stableIdempotencyKey: item.stableIdempotencyKey || item.idempotencyKey,
    artifactPdfSha256: item.artifactPdfSha256 || item.resumePdfSha256,
  }))
  .filter((item) => ["APPROVED", "APPROVAL_REJECTED", "SUBMITTED", "BLOCKED", "MAILBOX_CHECKED", "STATUS_CHANGED", "UPSERT"].includes(item.action) && item.approvalId && item.recordedAt && (item.action === "UPSERT" || (item.company && item.role)))
  .filter((item) => approvalIds.size === 0 || approvalIds.has(item.approvalId));
let requests = [];
try {
  requests = parseJsonLines(await readFile(requestFile, "utf8"));
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") throw error;
}
const requestById = new Map(requests.map((item) => [item.approvalId, item]));
const latestById = new Map(actions.map((item) => [item.approvalId, item]));

if (dryRun) {
  const summary = [...latestById.values()].reduce((counts, item) => {
    counts[item.action] = (counts[item.action] || 0) + 1;
    return counts;
  }, {});
  process.stdout.write(`${JSON.stringify({ actionFile, baseUrl, actions: latestById.size, summary }, null, 2)}\n`);
  process.exit(0);
}

if (!token) throw new Error("JOB_HUB_SIWC_BYPASS_TOKEN is required for a production sync.");
if (approvalIds.size === 0 && !allowAll) throw new Error("A production sync requires --approval-ids. Use --all only for an intentional full-ledger migration.");

const results = [];
for (const action of latestById.values()) {
  let applied = await postAction(baseUrl, token, action, { allowMissing: true });
  let upsert = null;
  if (applied.missing) {
    const application = baseApplication(action, requestById.get(action.approvalId));
    upsert = await postAction(baseUrl, token, {
      action: "UPSERT",
      idempotencyKey: `${action.approvalId}:upsert:v1`,
      recordedAt: action.recordedAt,
      application,
    });
    applied = await postAction(baseUrl, token, action);
  }
  results.push({ approvalId: action.approvalId, company: action.company, role: action.role, action: action.action, upserted: Boolean(upsert), upsertDuplicate: Boolean(upsert?.duplicate), actionDuplicate: Boolean(applied.duplicate) });
}

process.stdout.write(`${JSON.stringify({ ok: true, synced: results.length, results }, null, 2)}\n`);
