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

function normalizeEvent(event) {
  if (!["LEAD_UPSERT", "LEAD_STATUS_CHANGED"].includes(event.operation) || !event.lead) return event;
  const status = event.lead.status === "Closed"
    ? "Rejected"
    : event.lead.status === "Held"
      ? "Qualified"
      : event.lead.status;
  return { ...event, lead: { ...event.lead, status } };
}

function validateEvent(event) {
  const operation = event.operation;
  const eventId = event.eventId || event.idempotencyKey;
  if (!eventId || !event.source || !event.recordedAt || !["SOURCE_SCAN_RECORDED", "LEAD_UPSERT", "LEAD_STATUS_CHANGED", "DISCOVERY_RUN_RECORDED"].includes(operation)) {
    throw new Error("Every discovery event needs eventId, source, timezone-aware recordedAt, and a supported operation.");
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(event.recordedAt) || Number.isNaN(new Date(event.recordedAt).getTime())) {
    throw new Error(`${eventId}: recordedAt must be a timezone-aware ISO timestamp.`);
  }
  if (operation === "SOURCE_SCAN_RECORDED" && (!event.scan || !Array.isArray(event.scan.queries))) {
    throw new Error(`${eventId}: source scans require scan.queries and count fields.`);
  }
  if (["LEAD_UPSERT", "LEAD_STATUS_CHANGED"].includes(operation) && (!event.lead?.id || !event.lead?.company || !event.lead?.role)) {
    throw new Error(`${eventId}: lead events require lead.id, company, and role.`);
  }
  if (["LEAD_UPSERT", "LEAD_STATUS_CHANGED"].includes(operation) && !["Discovered", "Verified", "Qualified", "Rejected", "Duplicate", "Applied", "Blocked"].includes(event.lead.status)) {
    throw new Error(`${eventId}: lead status is unsupported.`);
  }
  if (operation === "DISCOVERY_RUN_RECORDED" && !event.run) {
    throw new Error(`${eventId}: run events require a run summary.`);
  }
  return eventId;
}

async function postEvent(baseUrl, token, event) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/discovery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "OAI-Sites-Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(event),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if (response.status !== 409 || attempt === 3) {
      throw new Error(`${event.eventId || event.idempotencyKey}: ${body.error || `HTTP ${response.status}`}`);
    }
  }
}

const eventFile = path.resolve(argument("--events", "../tmp/discovery/discovery_events.jsonl"));
const baseUrl = argument("--base-url", process.env.JOB_HUB_BASE_URL || "");
const eventIds = new Set(argument("--event-ids").split(",").map((value) => value.trim()).filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
const allowAll = process.argv.includes("--all");
const token = process.env.JOB_HUB_SIWC_BYPASS_TOKEN || "";

if (!baseUrl) throw new Error("JOB_HUB_BASE_URL or --base-url is required.");

const parsed = parseJsonLines(await readFile(eventFile, "utf8"));
const latestById = new Map();
for (const rawEvent of parsed) {
  const event = normalizeEvent(rawEvent);
  const eventId = validateEvent(event);
  if (eventIds.size === 0 || eventIds.has(eventId)) latestById.set(eventId, event);
}

if (eventIds.size > 0) {
  const missing = [...eventIds].filter((eventId) => !latestById.has(eventId));
  if (missing.length) throw new Error(`Requested discovery events were not found: ${missing.join(", ")}`);
}

const events = [...latestById.values()];
const summary = events.reduce((counts, event) => {
  counts[event.operation] = (counts[event.operation] || 0) + 1;
  return counts;
}, {});

if (dryRun) {
  process.stdout.write(`${JSON.stringify({ eventFile, baseUrl, events: events.length, summary }, null, 2)}\n`);
  process.exit(0);
}

if (!token) throw new Error("JOB_HUB_SIWC_BYPASS_TOKEN is required for a production discovery sync.");
if (eventIds.size === 0 && !allowAll) throw new Error("A production sync requires --event-ids. Use --all only for an intentional full-ledger migration.");

const results = [];
for (const event of events) {
  const result = await postEvent(baseUrl, token, event);
  results.push({
    eventId: event.eventId || event.idempotencyKey,
    operation: event.operation,
    source: event.source,
    duplicate: Boolean(result.duplicate),
  });
}

process.stdout.write(`${JSON.stringify({ ok: true, synced: results.length, results }, null, 2)}\n`);
