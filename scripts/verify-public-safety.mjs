#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skippedDirectories = new Set([
  ".git", ".next", ".vinext", ".wrangler", "dist", "node_modules", "out",
  "private-data", "candidate-data", "submitted-applications", "application-artifacts",
  "mailbox-exports", "database-exports",
]);
const prohibitedArtifactExtensions = new Set([
  ".db", ".doc", ".docx", ".jsonl", ".ndjson", ".pdf", ".sqlite", ".sqlite3",
  ".xls", ".xlsx",
]);
const textExtensions = new Set([
  ".css", ".example", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".py",
  ".sh", ".sql", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const findings = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skippedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function add(file, rule) {
  findings.push({ file: relative(file), rule });
}

const files = await walk(root);
for (const file of files) {
  const rel = relative(file);
  const extension = path.extname(file).toLowerCase();
  if (prohibitedArtifactExtensions.has(extension) || rel.endsWith(".ats.txt")) {
    add(file, "private artifact type");
    continue;
  }
  if (/^\.env(?:\.|$)/.test(rel) && rel !== ".env.example") add(file, "private environment file");
  if (!textExtensions.has(extension) && !["AGENTS.md", "README.md"].includes(rel)) continue;
  if (["package-lock.json", "pnpm-lock.yaml"].includes(rel)) continue;

  const text = await fs.readFile(file, "utf8");
  if (/\/Users\/[^/\s]+\//.test(text) || /[A-Z]:\\Users\\[^\\\s]+\\/i.test(text)) add(file, "absolute user-home path");
  if (/https:\/\/[^/\s]+\.chatgpt\.site/i.test(text)) add(file, "live hosted Sites URL");
  if (/\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/.test(text)) add(file, "likely access token");
  if (/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/.test(text)) add(file, "likely Telegram bot token");

  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (emails.some((email) => !/@example\.(?:com|org|net)$/i.test(email))) add(file, "first-party personal email address");
  const phones = text.match(/(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)/g) || [];
  if (phones.some((phone) => phone.replace(/\D/g, "").replace(/^1/, "") !== "0000000000")) add(file, "personal phone number");
}

const seedPath = path.join(root, "app", "seed-applications.json");
const seed = JSON.parse(await fs.readFile(seedPath, "utf8"));
if (!Array.isArray(seed) || seed.length !== 0) add(seedPath, "public application seed must be an empty array");

const hostingPath = path.join(root, ".openai", "hosting.json");
const hosting = JSON.parse(await fs.readFile(hostingPath, "utf8"));
if (hosting.project_id !== "REPLACE_WITH_YOUR_SITES_PROJECT_ID") add(hostingPath, "private Sites project ID");

const extraPath = path.join(root, ".public-safety.local.json");
try {
  const extra = JSON.parse(await fs.readFile(extraPath, "utf8"));
  for (const source of extra.patterns || []) {
    const pattern = new RegExp(source, "i");
    for (const file of files) {
      const extension = path.extname(file).toLowerCase();
      if (!textExtensions.has(extension) || ["package-lock.json", "pnpm-lock.yaml"].includes(relative(file))) continue;
      const text = await fs.readFile(file, "utf8");
      if (pattern.test(text)) add(file, "local private-pattern match");
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const unique = [...new Map(findings.map((item) => [`${item.file}:${item.rule}`, item])).values()];
process.stdout.write(`${JSON.stringify({ ok: unique.length === 0, filesChecked: files.length, findings: unique }, null, 2)}\n`);
if (unique.length) process.exitCode = 1;
