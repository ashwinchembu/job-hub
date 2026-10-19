#!/usr/bin/env node

import crypto from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  APPLICANT_NARRATION_PATTERNS,
  INTERNAL_PROVENANCE_PATTERNS,
  validateV5ResumeSpec,
} from "../resume-builder/resume_v5_contract.mjs";
import { validateImmutableV5Artifact } from "../resume-builder/immutable_v5_artifact_validation.mjs";

const CURRENT_TAILORING_VERSION = 5;
const CURRENT_ARTIFACT_MANIFEST_SCHEMA_VERSION = 2;
const V5_CUTOVER_AT = Date.parse("2026-09-04T00:50:00.000Z");
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

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

function packageIdFor(event) {
  return String(event?.packageId || event?.approvalPackage?.id || "").trim();
}

function isTimezoneAwareTimestamp(value) {
  return typeof value === "string"
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(new Date(value).getTime());
}

function requiresV5Mutation(receivedAt = Date.now()) {
  return receivedAt >= V5_CUTOVER_AT;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stableIdempotencyKey(company, role, officialJobId) {
  const canonical = [company, role, officialJobId]
    .map((value) => String(value).normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
  return `jobapp-${sha256(Buffer.from(canonical))}`;
}

function artifactFilePath(artifactDir, record, label) {
  if (!record || typeof record !== "object" || typeof record.path !== "string" || !record.path.trim() || !SHA256_PATTERN.test(record.sha256 || "")) {
    throw new Error(`${label} requires a relative path and SHA-256 in artifact_manifest.json.`);
  }
  const filePath = path.resolve(artifactDir, record.path);
  const relative = path.relative(artifactDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the immutable artifact directory.`);
  }
  return filePath;
}

async function verifyArtifactFile(artifactDir, record, label) {
  const filePath = artifactFilePath(artifactDir, record, label);
  const realFilePath = await realpath(filePath);
  const relative = path.relative(artifactDir, realFilePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the immutable artifact directory.`);
  }
  const bytes = await readFile(realFilePath);
  const actualHash = sha256(bytes);
  if (actualHash !== String(record.sha256).toLowerCase()) {
    throw new Error(`${label} SHA-256 does not match artifact_manifest.json.`);
  }
  if (!Number.isInteger(record.bytes) || record.bytes !== bytes.length) {
    throw new Error(`${label} byte count does not match artifact_manifest.json.`);
  }
  return { bytes, sha256: actualHash, realPath: realFilePath };
}

function assertOptionalProofMatches(approval, field, expected, packageId) {
  if (approval[field] !== undefined && approval[field] !== expected) {
    throw new Error(`${packageId}: approvalPackage.${field} conflicts with the inspected immutable artifact.`);
  }
}

async function inspectV5Artifact(event, packageId, approval) {
  const artifactDir = await realpath(path.resolve(String(approval.immutableArtifactPath)));
  const manifestPath = path.join(artifactDir, "artifact_manifest.json");
  if (await realpath(manifestPath) !== manifestPath) {
    throw new Error(`${packageId}: artifact_manifest.json must be a regular file inside the immutable artifact directory.`);
  }
  const manifestBytes = await readFile(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${packageId}: artifact_manifest.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Number.isInteger(manifest.schemaVersion) || !Number.isFinite(manifest.schemaVersion) || manifest.schemaVersion < CURRENT_ARTIFACT_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`${packageId}: post-cutover Tier A/B packages require finite integer artifactManifestSchemaVersion ${CURRENT_ARTIFACT_MANIFEST_SCHEMA_VERSION} or newer.`);
  }
  if (!Number.isInteger(manifest.tailoringVersion) || manifest.tailoringVersion !== CURRENT_TAILORING_VERSION) {
    throw new Error(`${packageId}: post-cutover Tier A/B packages require tailoringVersion ${CURRENT_TAILORING_VERSION}.`);
  }
  if (manifest.immutable !== true || manifest.state !== "PREPARED" || !isTimezoneAwareTimestamp(manifest.preparedAt)) {
    throw new Error(`${packageId}: artifact manifest must be immutable, PREPARED, and have a timezone-aware preparedAt.`);
  }
  if (Date.parse(manifest.preparedAt) > Date.parse(event.recordedAt)
      || Date.parse(manifest.preparedAt) > Date.now() + 5 * 60 * 1000) {
    throw new Error(`${packageId}: artifact preparedAt cannot be later than the preparation event or materially later than the sync clock.`);
  }
  const expectedStableIdempotencyKey = stableIdempotencyKey(manifest.company, manifest.role, manifest.officialJobId);
  let officialUrl;
  try {
    officialUrl = new URL(manifest.officialUrl);
  } catch {
    throw new Error(`${packageId}: immutable artifact identity contains an invalid official URL.`);
  }
  if (typeof manifest.company !== "string" || !manifest.company.trim()
      || typeof manifest.role !== "string" || !manifest.role.trim()
      || typeof manifest.officialJobId !== "string" || !manifest.officialJobId.trim()
      || !/^https?:$/.test(officialUrl.protocol)
      || manifest.idempotencyKey !== expectedStableIdempotencyKey
      || manifest.idempotencyKey !== approval.stableIdempotencyKey
      || manifest.company !== event.company
      || manifest.role !== event.role
      || !approval.officialJobId
      || manifest.officialJobId !== approval.officialJobId
      || manifest.officialUrl !== approval.officialJobUrl) {
    throw new Error(`${packageId}: immutable artifact identity does not match the preparation package.`);
  }
  if (!manifest.files || typeof manifest.files !== "object" || !Array.isArray(manifest.files.renderedPages) || manifest.files.renderedPages.length !== 1) {
    throw new Error(`${packageId}: artifact manifest is missing required files or rendered pages.`);
  }
  const semanticArtifact = await validateImmutableV5Artifact({
    artifactDir,
    manifest,
    expectedCompany: event.company,
    expectedRole: event.role,
  });

  const requiredRecords = [
    [manifest.files.resumePdf, "resumePdf"],
    [manifest.files.resumeSpec, "resumeSpec"],
    [manifest.files.jobDescription, "jobDescription"],
    [manifest.files.selectionNotes, "selectionNotes"],
    [manifest.files.atsText, "atsText"],
    [manifest.files.applicationAnswers, "applicationAnswers"],
    ...manifest.files.renderedPages.map((record, index) => [record, `renderedPages[${index}]`]),
  ];
  if (new Set(requiredRecords.map(([record]) => record?.path)).size !== requiredRecords.length) {
    throw new Error(`${packageId}: artifact manifest file records must use distinct paths.`);
  }
  const verified = new Map();
  for (const [record, label] of requiredRecords) {
    verified.set(label, await verifyArtifactFile(artifactDir, record, `${packageId}: ${label}`));
  }
  if (new Set([...verified.values()].map((record) => record.realPath)).size !== requiredRecords.length) {
    throw new Error(`${packageId}: artifact manifest file records must resolve to distinct regular files.`);
  }
  const expectedUploadPath = verified.get("resumePdf").realPath;
  const manifestUploadPath = await realpath(path.resolve(String(manifest.uploadPath || "")));
  if (manifestUploadPath !== expectedUploadPath) {
    throw new Error(`${packageId}: artifact manifest uploadPath does not match the immutable resume PDF.`);
  }
  if (!approval.resumePreview) {
    throw new Error(`${packageId}: post-cutover Tier A/B packages require the inspected local rendered-page preview.`);
  }
  const expectedPreviewPath = await realpath(artifactFilePath(artifactDir, manifest.files.renderedPages[0], `${packageId}: renderedPages[0]`));
  const claimedPreviewPath = await realpath(path.resolve(String(approval.resumePreview)));
  if (claimedPreviewPath !== expectedPreviewPath) {
    throw new Error(`${packageId}: resumePreview does not match the inspected immutable rendered page.`);
  }

  let spec;
  try {
    spec = JSON.parse(verified.get("resumeSpec").bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${packageId}: resume_spec.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    validateV5ResumeSpec(spec, { expectedCompany: manifest.company, expectedRole: manifest.role });
  } catch (error) {
    throw new Error(`${packageId}: inspected resume_spec.json does not satisfy the complete V${CURRENT_TAILORING_VERSION} contract: ${error instanceof Error ? error.message : String(error)}`);
  }
  let applicationAnswers;
  try {
    applicationAnswers = JSON.parse(verified.get("applicationAnswers").bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${packageId}: application_answers.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!applicationAnswers || typeof applicationAnswers !== "object" || Array.isArray(applicationAnswers)) {
    throw new Error(`${packageId}: application_answers.json must contain a JSON object.`);
  }
  const atsText = verified.get("atsText").bytes.toString("utf8");
  const requiredWebsite = String(spec.metadata.required_website || "").trim();
  const normalizedWebsite = requiredWebsite.toLowerCase().replace(/^https?:\/\//, "");
  if (atsText.length <= 500 || !/EXPERIENCE/i.test(atsText) || !/PROJECTS/i.test(atsText) || !/EDUCATION/i.test(atsText)
      || (normalizedWebsite && !atsText.toLowerCase().includes(normalizedWebsite))
      || INTERNAL_PROVENANCE_PATTERNS.some((pattern) => pattern.test(atsText))
      || APPLICANT_NARRATION_PATTERNS.some((pattern) => pattern.test(atsText))) {
    throw new Error(`${packageId}: inspected ATS text does not satisfy the complete V${CURRENT_TAILORING_VERSION} applicant-facing contract.`);
  }
  if (manifest.resumePdfSha256 !== verified.get("resumePdf").sha256
      || manifest.files.resumePdf.sha256 !== approval.resumeSha256
      || approval.uploadedPdfSha256 !== approval.resumeSha256) {
    throw new Error(`${packageId}: resume PDF hashes do not match the inspected immutable artifact.`);
  }

  const proofFields = {
    artifactProofSource: "authenticated-preparation-sync-v1",
    tailoringVersion: manifest.tailoringVersion,
    artifactManifestSchemaVersion: manifest.schemaVersion,
    artifactManifestSha256: sha256(manifestBytes),
    resumeSpecSha256: verified.get("resumeSpec").sha256,
    applicationAnswersSha256: verified.get("applicationAnswers").sha256,
    atsTextSha256: semanticArtifact.atsTextSha256,
    renderedPageSha256: semanticArtifact.renderedPageSha256,
    factSheetSha256: semanticArtifact.factSheetSha256,
    tailoringStandardSha256: semanticArtifact.tailoringStandardSha256,
    pdfTextSha256: semanticArtifact.pdfTextSha256,
    artifactPreparedAt: manifest.preparedAt,
  };
  const proofBindingInput = [
    "job-hub-v5-artifact-proof-v1",
    packageId,
    manifest.company,
    manifest.role,
    manifest.officialJobId,
    manifest.officialUrl,
    manifest.idempotencyKey,
    verified.get("resumePdf").sha256,
    String(proofFields.tailoringVersion),
    String(proofFields.artifactManifestSchemaVersion),
    proofFields.artifactManifestSha256,
    proofFields.resumeSpecSha256,
    proofFields.applicationAnswersSha256,
    proofFields.atsTextSha256,
    proofFields.renderedPageSha256,
    proofFields.factSheetSha256,
    proofFields.tailoringStandardSha256,
    proofFields.pdfTextSha256,
    proofFields.artifactPreparedAt,
  ].join("\n");
  const proof = { ...proofFields, artifactProofBindingSha256: sha256(Buffer.from(proofBindingInput)) };
  for (const [field, expected] of Object.entries(proof)) {
    assertOptionalProofMatches(approval, field, expected, packageId);
  }
  return proof;
}

async function validatePackage(event) {
  const packageId = packageIdFor(event);
  const approval = event.approvalPackage;
  if (event.action !== "PREPARED" || !event.idempotencyKey || !packageId
      || typeof event.company !== "string" || !event.company.trim()
      || typeof event.role !== "string" || !event.role.trim()
      || !event.recordedAt || !event.application) {
    throw new Error("Every preparation event needs PREPARED, idempotencyKey, packageId, company, role, recordedAt, and application.");
  }
  if (!isTimezoneAwareTimestamp(event.recordedAt)) {
    throw new Error(`${packageId}: recordedAt must be a timezone-aware ISO timestamp.`);
  }
  if (!approval || !["A", "B", "C"].includes(approval.tier) || !approval.officialJobUrl) {
    throw new Error(`${packageId}: approvalPackage requires Tier A, B, or C plus officialJobUrl.`);
  }
  if (![approval.requirements, approval.gaps, approval.answers].every(Array.isArray)) {
    throw new Error(`${packageId}: requirements, gaps, and answers must be arrays.`);
  }
  if (approval.id !== packageId) throw new Error(`${packageId}: packageId must match approvalPackage.id.`);
  if (event.application.company !== event.company || event.application.role !== event.role) {
    throw new Error(`${packageId}: application identity must match the preparation event.`);
  }
  let proof = {};
  if (approval.tier !== "C") {
    if (!SHA256_PATTERN.test(approval.resumeSha256 || "")) throw new Error(`${packageId}: Tier A/B requires exact resumeSha256.`);
    if (approval.uploadedPdfSha256 !== approval.resumeSha256) throw new Error(`${packageId}: selected upload hash must match immutable resumeSha256.`);
    if (!approval.immutableArtifactPath) throw new Error(`${packageId}: Tier A/B requires immutableArtifactPath.`);
    if (!/^jobapp-[a-f0-9]{64}$/i.test(approval.stableIdempotencyKey || "")) throw new Error(`${packageId}: Tier A/B requires a stable company/role/official-job-ID key.`);
    if (!approval.resumePreview && !approval.resumePreviewUrl) throw new Error(`${packageId}: Tier A/B requires a resume preview.`);
    proof = requiresV5Mutation() ? await inspectV5Artifact(event, packageId, approval) : {};
    const validationFields = ["qualificationChecksPassed", "factualChecksPassed", "atsChecksPassed", "renderingChecksPassed", "duplicateChecksPassed", "applicationAnswerChecksPassed", "immutableArtifactChecksPassed", "livePostingRechecked"];
    if (!approval.validation || !validationFields.every((field) => approval.validation[field] === true)) {
      throw new Error(`${packageId}: Tier A/B requires every routine validation to pass.`);
    }
  }
  if (!Array.isArray(approval.exceptionReasons)
      || !approval.exceptionReasons.every((value) => typeof value === "string" && value.trim().length >= 8)) {
    throw new Error(`${packageId}: exceptionReasons must be an array of specific non-empty text reasons.`);
  }
  if (approval.tier === "C" && approval.exceptionReasons.length === 0) throw new Error(`${packageId}: Tier C requires a genuine exception reason.`);
  if (approval.tier !== "C" && approval.exceptionReasons.length > 0) throw new Error(`${packageId}: Tier A/B cannot carry unresolved exception reasons.`);
  return { packageId, event: { ...event, packageId, approvalPackage: { ...approval, ...proof } } };
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

async function verifyBackendReadback(baseUrl, token, event) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/state`, {
    headers: { "OAI-Sites-Authorization": `Bearer ${token}` },
    cache: "no-store",
  });
  const state = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${event.packageId}: backend readback failed: ${state.error || `HTTP ${response.status}`}`);
  const matches = Array.isArray(state.applications)
    ? state.applications.filter((application) => application?.approval?.id === event.packageId)
    : [];
  if (matches.length !== 1) throw new Error(`${event.packageId}: backend readback did not contain exactly one matching approval package.`);
  const application = matches[0];
  const approval = application.approval || {};
  const expectedApproval = event.approvalPackage;
  const proofFields = [
    "artifactProofSource", "tailoringVersion", "artifactManifestSchemaVersion", "artifactManifestSha256",
    "resumeSpecSha256", "applicationAnswersSha256", "atsTextSha256", "renderedPageSha256",
    "factSheetSha256", "tailoringStandardSha256", "pdfTextSha256", "artifactPreparedAt",
    "artifactProofBindingSha256", "resumeSha256", "uploadedPdfSha256", "stableIdempotencyKey",
    "officialJobId", "officialJobUrl",
  ];
  if (application.company !== event.company || application.role !== event.role
      || proofFields.some((field) => approval[field] !== expectedApproval[field])) {
    throw new Error(`${event.packageId}: backend readback does not match the exact immutable artifact identity and proof.`);
  }
  return String(state.updatedAt || "");
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
  const candidatePackageId = packageIdFor(event);
  if (packageIds.size > 0 && !packageIds.has(candidatePackageId)) continue;
  const validated = await validatePackage(event);
  const prior = latestById.get(validated.packageId);
  if (prior && canonicalJson(prior) !== canonicalJson(validated.event)) {
    throw new Error(`${validated.packageId}: duplicate package ID is bound to conflicting preparation payloads.`);
  }
  latestById.set(validated.packageId, { ...validated.event, packageId: validated.packageId });
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
  const readbackUpdatedAt = await verifyBackendReadback(baseUrl, token, event);
  results.push({ packageId: event.packageId, company: event.company, role: event.role, tier: event.approvalPackage.tier, duplicate: Boolean(result.duplicate), readbackVerified: true, readbackUpdatedAt });
}

process.stdout.write(`${JSON.stringify({ ok: true, synced: results.length, results }, null, 2)}\n`);
