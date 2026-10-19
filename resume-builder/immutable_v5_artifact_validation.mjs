import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  APPLICANT_NARRATION_PATTERNS,
  INTERNAL_PROVENANCE_PATTERNS,
  resumeBodyBullets,
  validateV5ResumeSpec,
} from "./resume_v5_contract.mjs";

const execFileAsync = promisify(execFile);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const CANONICAL_RECORDS = [
  ["resumePdf", "resume.pdf"],
  ["resumeSpec", "resume_spec.json"],
  ["jobDescription", "job_description.txt"],
  ["selectionNotes", "selection_notes.md"],
  ["atsText", "resume.ats.txt"],
  ["applicationAnswers", "application_answers.json"],
];

function requireArtifact(condition, message) {
  if (!condition) throw new Error(`Immutable V5 artifact: ${message}`);
}

function nonEmptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
}

export function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function stableApplicationIdempotencyKey(company, role, officialJobId) {
  const canonical = [company, role, officialJobId]
    .map((value) => String(value).normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
  return `jobapp-${sha256Bytes(Buffer.from(canonical))}`;
}

function normalizeExtractedText(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function canonicalHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ""}${pathname}`;
  } catch {
    return "";
  }
}

function textContainsExactWebsite(text, requiredWebsite) {
  const required = canonicalHttpUrl(requiredWebsite);
  return Boolean(required) && (String(text).match(/https?:\/\/[^\s|,;)\]}]+/gi) || [])
    .some((candidate) => canonicalHttpUrl(candidate) === required);
}

async function resolveExecutable(environmentVariable, commandName) {
  const configured = String(process.env[environmentVariable] || "").trim();
  if (configured) {
    await fs.access(configured, fsConstants.X_OK);
    return configured;
  }
  return commandName;
}

async function runPoppler(environmentVariable, commandName, args) {
  const executable = await resolveExecutable(environmentVariable, commandName);
  try {
    return await execFileAsync(executable, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).trim();
    throw new Error(`Immutable V5 artifact: ${commandName} failed${detail ? `: ${detail}` : "."}`);
  }
}

function assertApplicantTextMatchesSpec(text, spec, label) {
  const normalized = normalizeExtractedText(text);
  const requiredFragments = [
    "experience",
    "projects",
    "education",
    spec.contact?.name,
    spec.contact?.email,
    spec.metadata?.required_website,
    ...spec.experience.map((entry) => entry.title),
    ...spec.projects.map((entry) => entry.title),
    ...resumeBodyBullets(spec),
  ].filter(nonEmptyString);
  for (const fragment of requiredFragments) {
    requireArtifact(normalized.includes(normalizeExtractedText(fragment)), `${label} is missing required resume content: ${fragment}`);
  }
  requireArtifact(textContainsExactWebsite(text, spec.metadata?.required_website), `${label} is missing the exact required website URL.`);
  requireArtifact(!INTERNAL_PROVENANCE_PATTERNS.some((pattern) => pattern.test(String(text))), `${label} exposes internal provenance narration.`);
  requireArtifact(!APPLICANT_NARRATION_PATTERNS.some((pattern) => pattern.test(String(text))), `${label} contains applicant-facing audit narration.`);
}

function validatePngStructure(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  requireArtifact(bytes.length > 33 && bytes.subarray(0, 8).equals(signature), "rendered-page-1.png is not a valid PNG.");
  requireArtifact(bytes.toString("ascii", 12, 16) === "IHDR", "rendered-page-1.png is missing its IHDR chunk.");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  requireArtifact(width > 0 && height > 0, "rendered-page-1.png has invalid dimensions.");
  requireArtifact(bytes.indexOf(Buffer.from("IEND")) >= 0, "rendered-page-1.png is incomplete.");
  return { width, height };
}

async function verifyRecord(canonicalArtifactDir, record, expectedPath, label) {
  requireArtifact(record && typeof record === "object" && !Array.isArray(record), `${label} record is required.`);
  requireArtifact(record.path === expectedPath, `${label} path must be exactly ${expectedPath}.`);
  requireArtifact(SHA256_PATTERN.test(String(record.sha256 || "")), `${label} requires a SHA-256.`);
  requireArtifact(Number.isInteger(record.bytes) && record.bytes > 0, `${label} requires a positive byte count.`);
  const lexicalPath = path.resolve(canonicalArtifactDir, record.path);
  requireArtifact(path.relative(canonicalArtifactDir, lexicalPath) === expectedPath, `${label} path escapes the immutable directory.`);
  const stat = await fs.lstat(lexicalPath);
  requireArtifact(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file.`);
  const realPath = await fs.realpath(lexicalPath);
  requireArtifact(realPath === lexicalPath, `${label} must resolve to its canonical immutable path.`);
  const bytes = await fs.readFile(realPath);
  requireArtifact(bytes.length === record.bytes, `${label} byte count does not match the file.`);
  const actualSha256 = sha256Bytes(bytes);
  requireArtifact(actualSha256 === String(record.sha256).toLowerCase(), `${label} SHA-256 does not match the file.`);
  return { bytes, realPath, sha256: actualSha256 };
}

async function validatePdfAndRenderedPage(pdfPath, archivedPng) {
  requireArtifact(archivedPng.bytes.length > 0, "rendered page is empty.");
  const png = validatePngStructure(archivedPng.bytes);
  const { stdout: pdfInfo } = await runPoppler("JOB_HUB_PDFINFO_BIN", "pdfinfo", [pdfPath]);
  const pageMatch = String(pdfInfo).match(/^Pages:\s+(\d+)\s*$/m);
  requireArtifact(pageMatch && Number(pageMatch[1]) === 1, "resume.pdf must be a readable one-page PDF.");
  const { stdout: pdfText } = await runPoppler("JOB_HUB_PDFTOTEXT_BIN", "pdftotext", ["-layout", pdfPath, "-"]);
  requireArtifact(String(pdfText).trim().length > 500, "resume.pdf text extraction is unexpectedly short.");

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "job-hub-v5-render-"));
  try {
    const prefix = path.join(temporaryDirectory, "rendered-page-1");
    await runPoppler("JOB_HUB_PDFTOPPM_BIN", "pdftoppm", ["-png", "-r", "110", "-singlefile", pdfPath, prefix]);
    const renderedBytes = await fs.readFile(`${prefix}.png`);
    requireArtifact(sha256Bytes(renderedBytes) === archivedPng.sha256, "rendered-page-1.png is not the exact 110-DPI render of resume.pdf.");
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
  return { pdfText, pdfTextSha256: sha256Bytes(Buffer.from(pdfText)), png };
}

export async function validateImmutableV5Artifact({
  artifactDir,
  manifest,
  expectedCompany,
  expectedRole,
  authoritativeFactSheetPath = "",
  authoritativeTailoringStandardPath = "",
} = {}) {
  const resolvedArtifactDir = path.resolve(String(artifactDir || ""));
  const artifactDirectoryStat = await fs.lstat(resolvedArtifactDir);
  requireArtifact(!artifactDirectoryStat.isSymbolicLink(), "artifact directory itself must not be a symlink.");
  const canonicalArtifactDir = await fs.realpath(resolvedArtifactDir);
  requireArtifact(manifest && typeof manifest === "object" && !Array.isArray(manifest), "artifact_manifest.json must contain an object.");
  requireArtifact(Number.isInteger(manifest.schemaVersion) && manifest.schemaVersion >= 2, "schemaVersion must be an integer at least 2.");
  requireArtifact(manifest.immutable === true && manifest.state === "PREPARED", "manifest must be immutable and PREPARED.");
  requireArtifact(nonEmptyString(manifest.preparedAt) && /(?:Z|[+-]\d{2}:\d{2})$/.test(manifest.preparedAt)
    && !Number.isNaN(Date.parse(manifest.preparedAt)), "preparedAt must be a timezone-aware ISO timestamp.");
  for (const field of ["company", "role", "officialJobId", "officialUrl", "idempotencyKey"]) {
    requireArtifact(nonEmptyString(manifest[field]), `${field} is required.`);
  }
  if (expectedCompany !== undefined) requireArtifact(manifest.company === expectedCompany, "company does not match the expected identity.");
  if (expectedRole !== undefined) requireArtifact(manifest.role === expectedRole, "role does not match the expected identity.");
  let officialUrl;
  try {
    officialUrl = new URL(manifest.officialUrl);
  } catch {
    requireArtifact(false, "officialUrl must be an absolute HTTP(S) URL.");
  }
  requireArtifact(/^https?:$/.test(officialUrl.protocol), "officialUrl must be an absolute HTTP(S) URL.");
  requireArtifact(manifest.idempotencyKey === stableApplicationIdempotencyKey(manifest.company, manifest.role, manifest.officialJobId), "idempotencyKey is not the stable company/role/official-job-ID key.");

  requireArtifact(manifest.files && typeof manifest.files === "object" && !Array.isArray(manifest.files), "files object is required.");
  requireArtifact(Array.isArray(manifest.files.renderedPages) && manifest.files.renderedPages.length === 1, "exactly one rendered page is required.");
  const verified = new Map();
  for (const [field, expectedPath] of CANONICAL_RECORDS) {
    verified.set(field, await verifyRecord(canonicalArtifactDir, manifest.files[field], expectedPath, field));
  }
  verified.set("renderedPage", await verifyRecord(canonicalArtifactDir, manifest.files.renderedPages[0], "rendered-page-1.png", "renderedPages[0]"));
  const distinctPaths = [...verified.values()].map((record) => record.realPath);
  requireArtifact(new Set(distinctPaths).size === distinctPaths.length, "all artifact records must resolve to distinct files.");

  requireArtifact(manifest.resumePdfSha256 === verified.get("resumePdf").sha256, "resumePdfSha256 does not match resume.pdf.");
  const canonicalUploadPath = await fs.realpath(path.resolve(String(manifest.uploadPath || "")));
  requireArtifact(canonicalUploadPath === verified.get("resumePdf").realPath, "uploadPath does not resolve to the immutable resume.pdf.");

  let spec;
  let applicationAnswers;
  try {
    spec = JSON.parse(verified.get("resumeSpec").bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Immutable V5 artifact: resume_spec.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const contract = validateV5ResumeSpec(spec, { expectedCompany: manifest.company, expectedRole: manifest.role });
  requireArtifact(contract.tailoringVersion === 5 && manifest.tailoringVersion === 5, "spec and manifest must both use tailoringVersion 5.");
  try {
    applicationAnswers = JSON.parse(verified.get("applicationAnswers").bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Immutable V5 artifact: application_answers.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  requireArtifact(applicationAnswers && typeof applicationAnswers === "object" && !Array.isArray(applicationAnswers), "application_answers.json must contain an object.");

  requireArtifact(SHA256_PATTERN.test(String(manifest.factSheetSha256 || ""))
    && manifest.factSheetSha256 === spec.metadata.fact_sheet_sha256, "factSheetSha256 must match the spec fingerprint.");
  requireArtifact(SHA256_PATTERN.test(String(manifest.tailoringStandardSha256 || ""))
    && manifest.tailoringStandardSha256 === spec.metadata.tailoring_standard_sha256, "tailoringStandardSha256 must match the spec fingerprint.");
  if (authoritativeFactSheetPath) {
    const actual = sha256Bytes(await fs.readFile(path.resolve(authoritativeFactSheetPath)));
    requireArtifact(actual === manifest.factSheetSha256, "fact-sheet fingerprint does not match the authoritative fact sheet.");
  }
  if (authoritativeTailoringStandardPath) {
    const actual = sha256Bytes(await fs.readFile(path.resolve(authoritativeTailoringStandardPath)));
    requireArtifact(actual === manifest.tailoringStandardSha256, "tailoring-standard fingerprint does not match the authoritative standard.");
  }

  const atsText = verified.get("atsText").bytes.toString("utf8");
  requireArtifact(atsText.trim().length > 500, "resume.ats.txt is unexpectedly short.");
  assertApplicantTextMatchesSpec(atsText, spec, "resume.ats.txt");
  const pdfValidation = await validatePdfAndRenderedPage(verified.get("resumePdf").realPath, verified.get("renderedPage"));
  assertApplicantTextMatchesSpec(pdfValidation.pdfText, spec, "resume.pdf extracted text");

  return {
    artifactDir: canonicalArtifactDir,
    spec,
    applicationAnswers,
    verified,
    resumePdfSha256: verified.get("resumePdf").sha256,
    resumeSpecSha256: verified.get("resumeSpec").sha256,
    applicationAnswersSha256: verified.get("applicationAnswers").sha256,
    atsTextSha256: verified.get("atsText").sha256,
    renderedPageSha256: verified.get("renderedPage").sha256,
    factSheetSha256: manifest.factSheetSha256,
    tailoringStandardSha256: manifest.tailoringStandardSha256,
    pdfTextSha256: pdfValidation.pdfTextSha256,
    renderedPageWidth: pdfValidation.png.width,
    renderedPageHeight: pdfValidation.png.height,
  };
}
