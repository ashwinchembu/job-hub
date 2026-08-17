#!/usr/bin/env node

const baseUrl = String(process.env.JOB_HUB_BASE_URL || "").replace(/\/$/, "");
const token = String(process.env.JOB_HUB_SIWC_BYPASS_TOKEN || "");

if (!baseUrl) throw new Error("JOB_HUB_BASE_URL is required.");

const headers = token ? { "OAI-Sites-Authorization": `Bearer ${token}` } : {};

async function readJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${pathname} returned HTTP ${response.status}: ${body.error || response.statusText}`);
  }
  return body;
}

const [state, discovery] = await Promise.all([
  readJson("/api/state"),
  readJson("/api/discovery"),
]);

if (!Array.isArray(state.applications) || typeof state.updatedAt !== "string") {
  throw new Error("/api/state did not return the expected applications and updatedAt fields.");
}
if (!Array.isArray(discovery.sources) || !Array.isArray(discovery.leads)) {
  throw new Error("/api/discovery did not return the expected sources and leads fields.");
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  state: { applications: state.applications.length, hasRevision: true },
  discovery: { sources: discovery.sources.length, leads: discovery.leads.length },
  writesPerformed: 0,
}, null, 2)}\n`);
