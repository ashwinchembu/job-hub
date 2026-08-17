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

function validatePackage(event) {
  const packageId = event.packageId || event.approvalPackage?.id;
  const approval = event.approvalPackage;
  if (event.action !== "PREPARED" || !event.idempotencyKey || !packageId || !event.company || !event.role || !event.recordedAt || !event.application) {
    throw new Error("Every preparation event needs PREPARED, idempotencyKey, packageId, company, role, recordedAt, and application.");
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(event.recordedAt) || Number.isNaN(new Date(event.recordedAt).getTime())) {
    throw new Error(`${packageId}: recordedAt must be a timezone-aware ISO timestamp.`);
  }
  if (!approval || !["A", "B", "C"].includes(approval.tier) || !approval.officialJobUrl) {
    throw new Error(`${packageId}: approvalPackage requires Tier A, B, or C plus officialJobUrl.`);
  }
  if (![approval.requirements, approval.gaps, approval.answers].every(Array.isArray)) {
    throw new Error(`${packageId}: requirements, gaps, and answers must be arrays.`);
  }
  if (approval.tier !== "C") {
    if (!/^[a-f0-9]{64}$/i.test(approval.resumeSha256 || "")) throw new Error(`${packageId}: Tier A/B requires exact resumeSha256.`);
    if (approval.uploadedPdfSha256 !== approval.resumeSha256) throw new Error(`${packageId}: selected upload hash must match immutable resumeSha256.`);
    if (!approval.immutableArtifactPath) throw new Error(`${packageId}: Tier A/B requires immutableArtifactPath.`);
    if (!/^jobapp-[a-f0-9]{64}$/i.test(approval.stableIdempotencyKey || "")) throw new Error(`${packageId}: Tier A/B requires a stable company/role/official-job-ID key.`);
    if (!approval.resumePreview && !approval.resumePreviewUrl) throw new Error(`${packageId}: Tier A/B requires a resume preview.`);
    const validationFields = ["qualificationChecksPassed", "factualChecksPassed", "atsChecksPassed", "renderingChecksPassed", "duplicateChecksPassed", "applicationAnswerChecksPassed", "immutableArtifactChecksPassed", "livePostingRechecked"];
    if (!approval.validation || !validationFields.every((field) => approval.validation[field] === true)) {
      throw new Error(`${packageId}: Tier A/B requires every routine validation to pass.`);
    }
  }
  if (!Array.isArray(approval.exceptionReasons)) throw new Error(`${packageId}: exceptionReasons must be an array.`);
  if (approval.tier === "C" && approval.exceptionReasons.length === 0) throw new Error(`${packageId}: Tier C requires a genuine exception reason.`);
  return packageId;
}

async function postPackage(baseUrl, token, event) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/application-actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "OAI-Sites-Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(event),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if (response.status !== 409 || attempt === 3) throw new Error(`${event.packageId}: ${body.error || `HTTP ${response.status}`}`);
  }
}

const packageFile = path.resolve(argument("--packages", "../tmp/preparation/prepared_applications.jsonl"));
const baseUrl = argument("--base-url", process.env.JOB_HUB_BASE_URL || "");
const packageIds = new Set(argument("--package-ids").split(",").map((value) => value.trim()).filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
const allowAll = process.argv.includes("--all");
const token = process.env.JOB_HUB_SIWC_BYPASS_TOKEN || "";

if (!baseUrl) throw new Error("JOB_HUB_BASE_URL or --base-url is required.");

const latestById = new Map();
for (const event of parseJsonLines(await readFile(packageFile, "utf8"))) {
  const packageId = validatePackage(event);
  if (packageIds.size === 0 || packageIds.has(packageId)) latestById.set(packageId, { ...event, packageId });
}

if (packageIds.size > 0) {
  const missing = [...packageIds].filter((packageId) => !latestById.has(packageId));
  if (missing.length) throw new Error(`Requested preparation packages were not found: ${missing.join(", ")}`);
}

const packages = [...latestById.values()];
if (dryRun) {
  const tiers = packages.reduce((counts, event) => {
    counts[event.approvalPackage.tier] = (counts[event.approvalPackage.tier] || 0) + 1;
    return counts;
  }, {});
  process.stdout.write(`${JSON.stringify({ packageFile, baseUrl, packages: packages.length, tiers }, null, 2)}\n`);
  process.exit(0);
}

if (!token) throw new Error("JOB_HUB_SIWC_BYPASS_TOKEN is required for a production preparation sync.");
if (packageIds.size === 0 && !allowAll) throw new Error("A production sync requires --package-ids. Use --all only for an intentional migration.");

const results = [];
for (const event of packages) {
  const result = await postPackage(baseUrl, token, event);
  results.push({ packageId: event.packageId, company: event.company, role: event.role, tier: event.approvalPackage.tier, duplicate: Boolean(result.duplicate) });
}

process.stdout.write(`${JSON.stringify({ ok: true, synced: results.length, results }, null, 2)}\n`);
