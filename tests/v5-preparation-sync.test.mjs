import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const syncScript = fileURLToPath(new URL("../scripts/sync-prepared-applications.mjs", import.meta.url));
const company = "Example";
const role = "Engineer";
const officialJobUrl = "https://example.com/jobs/current-v5";
const stableIdempotencyKey = `jobapp-${crypto.createHash("sha256").update("example|engineer|current-v5").digest("hex")}`;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function popplerExecutable(environmentVariable, commandName) {
  const configured = String(process.env[environmentVariable] || "").trim();
  if (configured) return configured;
  const bundled = path.resolve(path.dirname(process.execPath), "..", "..", "native", "poppler", "poppler", "bin", commandName);
  return existsSync(bundled) ? bundled : commandName;
}

function popplerEnvironment() {
  return {
    JOB_HUB_PDFINFO_BIN: popplerExecutable("JOB_HUB_PDFINFO_BIN", "pdfinfo"),
    JOB_HUB_PDFTOTEXT_BIN: popplerExecutable("JOB_HUB_PDFTOTEXT_BIN", "pdftotext"),
    JOB_HUB_PDFTOPPM_BIN: popplerExecutable("JOB_HUB_PDFTOPPM_BIN", "pdftoppm"),
  };
}

function applicantText(spec) {
  return `Candidate Name\ncandidate@example.com\nhttps://candidate.example.com\nEXPERIENCE\n${spec.experience.map((entry) => `${entry.title}\n${entry.bullets.join("\n")}`).join("\n")}\nPROJECTS\n${spec.projects.map((entry) => `${entry.title}\n${entry.bullets.join("\n")}`).join("\n")}\nEDUCATION\nExample University\n`;
}

function syntheticResumePdf(text) {
  const escapedLines = text.trimEnd().split("\n").map((line) => line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"));
  const stream = [
    "BT",
    "/F1 4.25 Tf",
    "24 770 Td",
    ...escapedLines.flatMap((line, index) => index === 0 ? [`(${line}) Tj`] : ["0 -7 Td", `(${line}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function renderSyntheticResume(directory, pdfPath) {
  const prefix = path.join(directory, "rendered-page-1");
  const result = spawnSync(popplerExecutable("JOB_HUB_PDFTOPPM_BIN", "pdftoppm"), ["-png", "-r", "110", "-singlefile", pdfPath, prefix], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const bytes = await readFile(`${prefix}.png`);
  return { path: "rendered-page-1.png", sha256: sha256(bytes), bytes: bytes.length };
}

function testBullets(subject, count, start) {
  return Array.from({ length: count }, (_, index) => {
    const quantity = start + index;
    return `Implemented ${quantity} ${subject} API safeguards with React clients, Python services, and repeatable release tests.`;
  });
}

function validV5Spec(tailoringVersion = 5) {
  const experience = [5, 4, 3].map((count, index) => ({
    title: `Experience ${index + 1} | Example Organization`,
    date: `Remote | 202${index}-202${index + 1}`,
    strength: ["strong", "moderate", "supporting"][index],
    target_matches: ["API delivery", "React product engineering"],
    selection_reason: `Experience ${index + 1} supplies ranked implementation evidence for this role.`,
    entry_priority: index + 1,
    summary: "Delivered API, React, and Python systems.",
    tech: "API | React | Python",
    bullets: testBullets(`experience-${index + 1}`, count, 10 + index * 10),
  }));
  const projects = [5, 4, 3].map((count, index) => ({
    title: `Project ${index + 1}`,
    date: `202${index + 3}`,
    strength: ["strong", "moderate", "supporting"][index],
    target_matches: ["API delivery", "Python validation"],
    selection_reason: `Project ${index + 1} supplies ranked technical evidence for this role.`,
    entry_priority: index + 1,
    summary: "Built tested API, React, and Python workflows.",
    tech: "API | React | Python",
    bullets: testBullets(`project-${index + 1}`, count, 40 + index * 10),
  }));
  const bullets = [...experience, ...projects].flatMap((entry) => entry.bullets);
  return {
    metadata: {
      company,
      role,
      slug: "example_engineer",
      job_description_source: officialJobUrl,
      selection_rationale: "Selected six ranked entries that match the role's API, React, and Python responsibilities.",
      facts_reviewed_at: "2026-09-04T00:30:00Z",
      fact_sheet_sha256: "a".repeat(64),
      tailoring_standard_sha256: "b".repeat(64),
      required_website: "https://candidate.example.com",
      matched_keywords: ["API", "React", "Python"],
      emphasis_terms: ["API safeguards", "React clients", "Python services"],
      tailoring_version: tailoringVersion,
      uniform_bullet_font_size: 9.1,
      body_tailoring_summary: "Prioritized API implementation, React client work, Python services, and release validation throughout all six entries.",
      omitted_requirements: ["No unsupported requirements were claimed in this fixture."],
      job_analysis: {
        responsibilities: ["Build APIs", "Ship React interfaces"],
        repeated_keywords: ["API", "React", "Python"],
        hard_requirements: ["Software implementation"],
        preferred_requirements: ["Release validation"],
        domain: "Software engineering",
        seniority: "Early career",
      },
      evidence_ranking: [
        ...experience.map((entry, index) => ({ entry: entry.title, type: "experience", rank: index + 1, role_work_match: "Direct implementation match", selected: true })),
        ...projects.map((entry, index) => ({ entry: entry.title, type: "project", rank: index + 4, role_work_match: "Direct project match", selected: true })),
      ],
      role_specific_bullets: bullets.slice(0, 7),
      bullet_evidence_audit: bullets.map((bullet, index) => ({
        bullet,
        target_responsibility: "Build and validate software",
        selected_fact_sheet_evidence: `Approved fixture evidence ${index + 1}`,
        selection_reason: "Provides direct technical implementation evidence.",
        problem: "A release workflow required reliable safeguards.",
        mechanism: "React clients called Python API services.",
        implementation: "Added checks and repeatable release tests.",
        outcome: "Produced a validated workflow.",
        quantity: bullet.match(/\d+/)[0],
        quantity_source: "Approved fixture count.",
        quantity_category: "tests",
      })),
      reuse_justifications: [],
    },
    contact: { name: "Candidate Name", phone: "(000) 000-0000", email: "candidate@example.com", location: "City, ST | https://candidate.example.com" },
    profile: "Software engineer building tested API, React, and Python systems.",
    skills: [{ label: "Engineering", items: "API, React, Python, testing" }],
    experience,
    projects,
    education: { school: "Example University", degree: "B.S. Computer Science" },
    certifications: [],
    publication: "",
    links: ["Portfolio: https://candidate.example.com"],
  };
}

function minimalV5Spec() {
  return {
    metadata: { company, role, tailoring_version: 5, uniform_bullet_font_size: 9.1 },
    experience: [{ title: "Experience", bullets: testBullets("minimal-experience", 3, 1) }],
    projects: [{ title: "Project", bullets: testBullets("minimal-project", 3, 4) }],
  };
}

async function artifactRecord(directory, fileName, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  await writeFile(path.join(directory, fileName), bytes);
  return { path: fileName, sha256: sha256(bytes), bytes: bytes.length };
}

async function createArtifact(root, { schemaVersion = 2, tailoringVersion = 5 } = {}) {
  const directory = path.join(root, "artifact");
  await mkdir(directory, { recursive: true });
  const spec = validV5Spec(tailoringVersion);
  const atsText = applicantText(spec);
  const resumePdf = await artifactRecord(directory, "resume.pdf", syntheticResumePdf(atsText));
  const files = {
    resumePdf,
    resumeSpec: await artifactRecord(directory, "resume_spec.json", `${JSON.stringify(spec)}\n`),
    jobDescription: await artifactRecord(directory, "job_description.txt", "Complete job description\n"),
    selectionNotes: await artifactRecord(directory, "selection_notes.md", "# Selection notes\n"),
    atsText: await artifactRecord(directory, "resume.ats.txt", atsText),
    applicationAnswers: await artifactRecord(directory, "application_answers.json", "{}\n"),
    renderedPages: [await renderSyntheticResume(directory, path.join(directory, resumePdf.path))],
  };
  const manifest = {
    schemaVersion,
    immutable: true,
    state: "PREPARED",
    preparedAt: "2026-09-04T01:00:00.000Z",
    tailoringVersion,
    idempotencyKey: stableIdempotencyKey,
    company,
    role,
    officialJobId: "current-v5",
    officialUrl: officialJobUrl,
    resumePdfSha256: files.resumePdf.sha256,
    factSheetSha256: spec.metadata.fact_sheet_sha256,
    tailoringStandardSha256: spec.metadata.tailoring_standard_sha256,
    uploadPath: path.join(directory, files.resumePdf.path),
    files,
  };
  await writeFile(path.join(directory, "artifact_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, files, manifest };
}

async function replaceArtifactSpec(artifact, spec) {
  const specBytes = Buffer.from(`${JSON.stringify(spec)}\n`);
  await writeFile(path.join(artifact.directory, "resume_spec.json"), specBytes);
  artifact.files.resumeSpec.sha256 = sha256(specBytes);
  artifact.files.resumeSpec.bytes = specBytes.length;
  await writeFile(path.join(artifact.directory, "artifact_manifest.json"), `${JSON.stringify(artifact.manifest, null, 2)}\n`);
}

function preparedEvent(artifact, overrides = {}) {
  const { approvalPackage: approvalOverrides = {}, ...eventOverrides } = overrides;
  return {
    action: "PREPARED",
    idempotencyKey: "prepare-example-v5",
    packageId: "pkg-example-v5",
    company,
    role,
    recordedAt: "2026-09-04T01:01:00Z",
    application: { id: "backend-example", company, role },
    approvalPackage: {
      id: "pkg-example-v5",
      tier: "B",
      officialJobId: "current-v5",
      officialJobUrl,
      requirements: [],
      gaps: [],
      answers: [],
      exceptionReasons: [],
      resumeSha256: artifact.files.resumePdf.sha256,
      uploadedPdfSha256: artifact.files.resumePdf.sha256,
      immutableArtifactPath: artifact.directory,
      stableIdempotencyKey,
      resumePreview: path.join(artifact.directory, "rendered-page-1.png"),
      validation: {
        qualificationChecksPassed: true,
        factualChecksPassed: true,
        atsChecksPassed: true,
        renderingChecksPassed: true,
        duplicateChecksPassed: true,
        applicationAnswerChecksPassed: true,
        immutableArtifactChecksPassed: true,
        livePostingRechecked: true,
      },
      ...approvalOverrides,
    },
    ...eventOverrides,
  };
}

function runSync(packageFile, packageId = "pkg-example-v5") {
  return spawnSync(process.execPath, [syncScript, "--packages", packageFile, "--package-ids", packageId, "--base-url", "https://job-hub.example.com", "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, ...popplerEnvironment() },
  });
}

test("exact-ID sync ignores unrelated semantic failures and verifies a real V5 artifact", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "job-hub-v5-sync-"));
  try {
    const artifact = await createArtifact(temp);
    const packageFile = path.join(temp, "events.jsonl");
    const unrelatedInvalidEvent = { action: "PREPARED", packageId: "pkg-unrelated" };
    await writeFile(packageFile, `${JSON.stringify(unrelatedInvalidEvent)}\n${JSON.stringify(preparedEvent(artifact))}\n`);

    const result = runSync(packageFile);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).packages, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("sync rejects a minimally labeled V5 spec that omits the canonical contract", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "job-hub-v5-minimal-"));
  try {
    const artifact = await createArtifact(temp);
    await replaceArtifactSpec(artifact, minimalV5Spec());
    const packageFile = path.join(temp, "events.jsonl");
    await writeFile(packageFile, `${JSON.stringify(preparedEvent(artifact))}\n`);

    const result = runSync(packageFile);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required section contact/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("sync rejects structural, uniform-size, narration, audit, and quantity V5 bypasses", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "job-hub-v5-contract-bypasses-"));
  try {
    const cases = [
      { name: "structure", mutate: (spec) => spec.projects.pop(), expected: /projects must contain three to four entries/ },
      { name: "font", mutate: (spec) => { spec.metadata.uniform_bullet_font_size = 10.1; }, expected: /uniform_bullet_font_size must be between/ },
      { name: "narration", mutate: (spec) => { spec.profile = "This work supports reliable customer software delivery."; }, expected: /applicant-facing text contains audit-style narration/ },
      { name: "audit", mutate: (spec) => spec.metadata.bullet_evidence_audit.pop(), expected: /bullet_evidence_audit requires exactly one record per rendered bullet/ },
      { name: "audit-object", mutate: (spec) => { spec.metadata.bullet_evidence_audit[0].problem = {}; }, expected: /bullet_evidence_audit problem must be a non-empty string/ },
      { name: "ranking-null", mutate: (spec) => { spec.metadata.evidence_ranking[0].role_work_match = null; }, expected: /evidence_ranking\.role_work_match must be a non-empty string/ },
      { name: "spoofed-website", mutate: (spec) => { spec.contact.location = "Anywhere | https://evil.example/candidate.example"; spec.links = ["Portfolio: https://evil.example/candidate.example"]; }, expected: /exact required website URL/ },
      { name: "quantity", mutate: (spec) => { spec.projects[0].bullets[0] = "Implemented API safeguards with React clients, Python services, and repeatable release tests."; }, expected: /every bullet requires explicit quantification/ },
    ];
    for (const testCase of cases) {
      const caseRoot = path.join(temp, testCase.name);
      const artifact = await createArtifact(caseRoot);
      const invalidSpec = validV5Spec();
      testCase.mutate(invalidSpec);
      await replaceArtifactSpec(artifact, invalidSpec);
      const packageFile = path.join(caseRoot, "events.jsonl");
      await writeFile(packageFile, `${JSON.stringify(preparedEvent(artifact))}\n`);
      const result = runSync(packageFile);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, testCase.expected);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("receipt-time cutover rejects a backdated V4 artifact", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "job-hub-v4-backdate-"));
  try {
    const artifact = await createArtifact(temp, { schemaVersion: 1, tailoringVersion: 4 });
    const packageFile = path.join(temp, "events.jsonl");
    await writeFile(packageFile, `${JSON.stringify(preparedEvent(artifact))}\n`);

    const result = runSync(packageFile);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /finite integer artifactManifestSchemaVersion 2 or newer/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("manifest schema and claimed proof versions must be finite strict integers", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "job-hub-v5-schema-"));
  try {
    for (const invalidSchema of ["2", 2.5]) {
      const caseRoot = path.join(temp, String(invalidSchema).replace(".", "-"));
      const artifact = await createArtifact(caseRoot, { schemaVersion: invalidSchema });
      const packageFile = path.join(caseRoot, "events.jsonl");
      await writeFile(packageFile, `${JSON.stringify(preparedEvent(artifact))}\n`);
      const result = runSync(packageFile);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /finite integer artifactManifestSchemaVersion/);
    }

    const artifact = await createArtifact(path.join(temp, "claim"));
    const packageFile = path.join(temp, "claim", "events.jsonl");
    await writeFile(packageFile, `${JSON.stringify(preparedEvent(artifact, { approvalPackage: { artifactManifestSchemaVersion: "2" } }))}\n`);
    const result = runSync(packageFile);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /approvalPackage\.artifactManifestSchemaVersion conflicts/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("sync rejects immutable artifact contents changed after manifest creation", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "job-hub-v5-tamper-"));
  try {
    const artifact = await createArtifact(temp);
    await writeFile(path.join(artifact.directory, "resume.pdf"), "%PDF-1.4\ntampered\n");
    const packageFile = path.join(temp, "events.jsonl");
    await writeFile(packageFile, `${JSON.stringify(preparedEvent(artifact))}\n`);

    const result = runSync(packageFile);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /resumePdf (?:byte count|SHA-256) does not match/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("sync rejects path-mismatched artifacts and conflicting duplicate package IDs", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "job-hub-v5-path-and-id-"));
  try {
    const pathArtifact = await createArtifact(path.join(temp, "path"));
    pathArtifact.manifest.files.atsText.path = "nested/resume.ats.txt";
    await writeFile(path.join(pathArtifact.directory, "artifact_manifest.json"), `${JSON.stringify(pathArtifact.manifest, null, 2)}\n`);
    const pathEvents = path.join(temp, "path", "events.jsonl");
    await writeFile(pathEvents, `${JSON.stringify(preparedEvent(pathArtifact))}\n`);
    const pathResult = runSync(pathEvents);
    assert.notEqual(pathResult.status, 0);
    assert.match(pathResult.stderr, /atsText path must be exactly resume\.ats\.txt/);

    const duplicateArtifact = await createArtifact(path.join(temp, "duplicate"));
    const first = preparedEvent(duplicateArtifact);
    const conflicting = { ...first, application: { ...first.application, notes: "conflicting payload" } };
    const duplicateEvents = path.join(temp, "duplicate", "events.jsonl");
    await writeFile(duplicateEvents, `${JSON.stringify(first)}\n${JSON.stringify(conflicting)}\n`);
    const duplicateResult = runSync(duplicateEvents);
    assert.notEqual(duplicateResult.status, 0);
    assert.match(duplicateResult.stderr, /duplicate package ID is bound to conflicting preparation payloads/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("sync derives artifact identity and validates referenced answer content instead of trusting matching claims", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "job-hub-v5-derived-proof-"));
  try {
    const identityArtifact = await createArtifact(path.join(temp, "identity"));
    const claimedStableKey = `jobapp-${"c".repeat(64)}`;
    identityArtifact.manifest.idempotencyKey = claimedStableKey;
    await writeFile(path.join(identityArtifact.directory, "artifact_manifest.json"), `${JSON.stringify(identityArtifact.manifest, null, 2)}\n`);
    const identityPackageFile = path.join(temp, "identity", "events.jsonl");
    await writeFile(identityPackageFile, `${JSON.stringify(preparedEvent(identityArtifact, { approvalPackage: { stableIdempotencyKey: claimedStableKey } }))}\n`);
    const identityResult = runSync(identityPackageFile);
    assert.notEqual(identityResult.status, 0);
    assert.match(identityResult.stderr, /immutable artifact identity does not match/);

    const answersArtifact = await createArtifact(path.join(temp, "answers"));
    const answerBytes = Buffer.from("[]\n");
    await writeFile(path.join(answersArtifact.directory, "application_answers.json"), answerBytes);
    answersArtifact.files.applicationAnswers.sha256 = sha256(answerBytes);
    answersArtifact.files.applicationAnswers.bytes = answerBytes.length;
    await writeFile(path.join(answersArtifact.directory, "artifact_manifest.json"), `${JSON.stringify(answersArtifact.manifest, null, 2)}\n`);
    const answersPackageFile = path.join(temp, "answers", "events.jsonl");
    await writeFile(answersPackageFile, `${JSON.stringify(preparedEvent(answersArtifact))}\n`);
    const answersResult = runSync(answersPackageFile);
    assert.notEqual(answersResult.status, 0);
    assert.match(answersResult.stderr, /application_answers\.json must contain .*object/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
