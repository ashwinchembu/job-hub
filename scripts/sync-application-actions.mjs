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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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

async function verifyBackendReadback(baseUrl, token, action) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/state`, {
    headers: { "OAI-Sites-Authorization": `Bearer ${token}` },
    cache: "no-store",
  });
  const state = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${action.approvalId}: backend readback failed: ${state.error || `HTTP ${response.status}`}`);
  const company = String(action.company || action.application?.company || "").trim();
  const role = String(action.role || action.application?.role || "").trim();
  const applicationId = String(action.applicationId || action.application?.id || "").trim();
  const matches = Array.isArray(state.applications)
    ? state.applications.filter((application) => {
        if (applicationId) return application?.id === applicationId && application?.company === company && application?.role === role;
        return application?.company === company && application?.role === role;
      })
    : [];
  if (matches.length !== 1 || !Array.isArray(matches[0].backendActionIds) || !matches[0].backendActionIds.includes(action.approvalId)) {
    throw new Error(`${action.approvalId}: backend readback did not prove the exact action on the exact application identity.`);
  }
  return String(state.updatedAt || "");
}

const actionFile = path.resolve(argument("--actions", "../tmp/approval_bridge/application_actions.jsonl"));
const baseUrl = argument("--base-url", process.env.JOB_HUB_BASE_URL || "");
const approvalIds = new Set(argument("--approval-ids").split(",").map((value) => value.trim()).filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
const allowAll = process.argv.includes("--all");
const token = process.env.JOB_HUB_SIWC_BYPASS_TOKEN || "";

if (!baseUrl) throw new Error("JOB_HUB_BASE_URL or --base-url is required.");

const allowedActions = new Set(["APPROVED", "APPROVAL_REJECTED", "SUBMITTED", "BLOCKED", "MAILBOX_CHECKED", "STATUS_CHANGED", "UPSERT"]);
const normalizedActions = parseJsonLines(await readFile(actionFile, "utf8"))
  .map((item) => ({
    ...item,
    approvalId: item.approvalId || item.actionId || item.idempotencyKey,
    directUrl: item.directUrl || item.officialJobUrl,
    confirmation: item.confirmation || item.confirmationText,
    immutableArtifactPath: item.immutableArtifactPath,
    stableIdempotencyKey: item.stableIdempotencyKey || item.idempotencyKey,
    artifactPdfSha256: item.artifactPdfSha256 || item.resumePdfSha256,
  }));
const actions = normalizedActions.filter((item) => approvalIds.size === 0 || approvalIds.has(item.approvalId));
for (const item of approvalIds.size === 0 ? normalizedActions : actions) {
  const company = String(item.company || item.application?.company || "").trim();
  const role = String(item.role || item.application?.role || "").trim();
  if (!allowedActions.has(item.action) || typeof item.approvalId !== "string" || !item.approvalId.trim()
      || typeof item.recordedAt !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(item.recordedAt) || Number.isNaN(Date.parse(item.recordedAt))
      || !company || !role
      || (item.action === "SUBMITTED" && (typeof item.confirmation !== "string" || !item.confirmation.trim()))) {
    throw new Error("Application action ledger contains a malformed or unsupported row; sync aborted without discarding it.");
  }
}
const latestById = new Map();
for (const item of actions) {
  const prior = latestById.get(item.approvalId);
  if (prior && canonicalJson(prior) !== canonicalJson(item)) {
    throw new Error(`${item.approvalId}: duplicate action ID is bound to conflicting payloads.`);
  }
  latestById.set(item.approvalId, item);
}
if (approvalIds.size > 0) {
  const missing = [...approvalIds].filter((approvalId) => !latestById.has(approvalId));
  if (missing.length) throw new Error(`Requested application actions were not found: ${missing.join(", ")}`);
}

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
  if (applied.missing) {
    throw new Error(`${action.approvalId}: ${action.action} must match an existing exact backend application; automatic UPSERT is intentionally disabled.`);
  }
  const readbackUpdatedAt = await verifyBackendReadback(baseUrl, token, action);
  results.push({ approvalId: action.approvalId, company: action.company, role: action.role, action: action.action, actionDuplicate: Boolean(applied.duplicate), readbackVerified: true, readbackUpdatedAt });
}

process.stdout.write(`${JSON.stringify({ ok: true, synced: results.length, results }, null, 2)}\n`);
