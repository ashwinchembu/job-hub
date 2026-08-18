import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataSource = await readFile(new URL("../app/data.ts", import.meta.url), "utf8");
const hubSource = await readFile(new URL("../app/JobHub.tsx", import.meta.url), "utf8");
const agentSetupSource = await readFile(new URL("../app/agent-setup.ts", import.meta.url), "utf8");
const codexSetupGuide = await readFile(new URL("../docs/CODEX_SETUP.md", import.meta.url), "utf8");
const codeReviewSource = await readFile(new URL("../build/local-code-review.ts", import.meta.url), "utf8");
const aiHintSource = await readFile(new URL("../build/ai-hint.ts", import.meta.url), "utf8");
const careerFollowUpSource = await readFile(new URL("../build/career-lab-followups.ts", import.meta.url), "utf8");
const localBackupSource = await readFile(new URL("../build/local-journal-backup.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const viteSource = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
const backendSyncSource = await readFile(new URL("../scripts/sync-application-actions.mjs", import.meta.url), "utf8");
const preparationSyncSource = await readFile(new URL("../scripts/sync-prepared-applications.mjs", import.meta.url), "utf8");
const discoverySyncSource = await readFile(new URL("../scripts/sync-discovery-events.mjs", import.meta.url), "utf8");
const hostingConfig = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
const seedApplications = JSON.parse(await readFile(new URL("../app/seed-applications.json", import.meta.url), "utf8"));

function numbersFrom(source) {
  return [...source.matchAll(/\b\d+\b/g)].map((match) => Number(match[0]));
}

test("the plan includes every canonical Blind 75 problem", () => {
  const canonicalBlock = dataSource.match(/const blind75ProblemIds = new Set\(\[([\s\S]*?)\]\);/);
  const rawPlanBlock = dataSource.match(/const rawProblems = \[([\s\S]*?)\] as const/);
  assert.ok(canonicalBlock, "Blind 75 ID set is present");
  assert.ok(rawPlanBlock, "raw interview plan is present");

  const canonicalIds = new Set(numbersFrom(canonicalBlock[1]));
  const planIds = new Set([...rawPlanBlock[1].matchAll(/^\s*\[(\d+),/gm)].map((match) => Number(match[1])));
  assert.equal(canonicalIds.size, 75);
  assert.equal([...canonicalIds].filter((id) => !planIds.has(id)).length, 0);
  assert.equal(planIds.size, 113);
});

test("hint independence and final submission remain separate scores", () => {
  assert.match(hubSource, /const HINT_PENALTY = 10/);
  assert.match(hubSource, />Final submission</);
  assert.match(hubSource, />Independence</);
  assert.match(hubSource, /hintsUsed: string\[\]/);
});

test("reasoning fields generate live problem-specific AI hints", () => {
  assert.match(hubSource, /generateHint\?: \(\) => Promise<string>/);
  assert.match(hubSource, /fetch\("\/api\/hint"/);
  assert.match(hubSource, /Generate AI hint/);
  assert.match(workerSource, /url\.pathname === "\/api\/hint"/);
  assert.match(aiHintSource, /currentAnswer/);
  assert.match(aiHintSource, /without giving complete code, a full solution, or the final answer/);
  assert.match(hubSource, /<JournalField id="journal-status" label="Status">/);
  assert.match(hubSource, /<JournalField id="journal-confidence" label="Confidence">/);
  assert.match(hubSource, /<JournalField id="journal-time-minutes" label="Time logged">/);
  assert.match(hubSource, /<JournalField id="mistakes" label="Mistakes \/ bug cause">/);
  assert.match(hubSource, /<JournalField id="solution-code" className="code-input-label" label=/);
  assert.doesNotMatch(hubSource, /recordHintUse\("mistakes"\)/);
  assert.doesNotMatch(hubSource, /recordHintUse\("solution-code"\)/);
});

test("applications, journals, progress, and settings sync through the Sites backend", () => {
  assert.equal(hostingConfig.d1, "DB");
  assert.match(workerSource, /url\.pathname === "\/api\/state"/);
  assert.match(workerSource, /UPDATE job_hub_state SET payload = \?, updated_at = \? WHERE id = \? AND updated_at = \?/);
  assert.match(hubSource, /fetch\("\/api\/state"/);
  assert.match(hubSource, /baseUpdatedAt: backendRevisionRef\.current/);
  assert.match(workerSource, /payload\.baseUpdatedAt !== current\.updatedAt/);
  assert.match(workerSource, /status: 409/);
});

test("agent onboarding keeps credentials ephemeral and generates an exact Codex handoff", () => {
  assert.match(hubSource, /Connect another Codex safely\./);
  assert.match(hubSource, /type=\{agentTokenVisible \? "text" : "password"\}/);
  assert.match(hubSource, /sessionStorage\.setItem\(AGENT_TOKEN_SESSION_KEY, value\)/);
  assert.match(hubSource, /"OAI-Sites-Authorization": `Bearer \$\{agentToken\.trim\(\)\}`/);
  assert.doesNotMatch(hubSource, /localStorage\.setItem\(AGENT_TOKEN_SESSION_KEY/);
  assert.match(agentSetupSource, /export function buildSafeRuntimeSetup\(setup: AgentSetup\)/);
  assert.match(agentSetupSource, /read -r -s JOB_HUB_SIWC_BYPASS_TOKEN/);
  assert.match(agentSetupSource, /export function buildCodexGuide\(setup: AgentSetup\)/);
  assert.match(agentSetupSource, /Never use --all for routine work/);
  assert.match(agentSetupSource, /JOB_HUB_PRIVATE_ROOT/);
  assert.match(codexSetupGuide, /Data & backup → Agent onboarding/);
  assert.match(codexSetupGuide, /never added to Job Hub state, D1, `localStorage`/);
});

test("the job finder writes application actions directly to the backend", () => {
  assert.match(workerSource, /url\.pathname === "\/api\/application-actions"/);
  assert.match(workerSource, /job_hub_application_actions/);
  assert.match(workerSource, /INSERT OR IGNORE INTO job_hub_application_actions/);
  assert.match(workerSource, /America\/Los_Angeles/);
  assert.match(workerSource, /action === "BLOCKED"/);
  assert.match(workerSource, /input\.retryInstruction \|\| "Verify the uncertain submission outcome before retrying"/);
  assert.match(backendSyncSource, /OAI-Sites-Authorization/);
  assert.match(backendSyncSource, /JOB_HUB_SIWC_BYPASS_TOKEN/);
  assert.match(backendSyncSource, /:upsert:v1/);
  assert.match(backendSyncSource, /publishedSalaryRange\(request\?\.publishedBaseRange\)/);
  assert.match(backendSyncSource, /approvalId: item\.approvalId \|\| item\.actionId/);
  assert.match(backendSyncSource, /artifactPdfSha256: item\.artifactPdfSha256 \|\| item\.resumePdfSha256/);
  assert.doesNotMatch(viteSource, /localJobTracker/);
});

test("routine applications use exact-package validation and exception-only review", () => {
  assert.match(workerSource, /action === "PREPARED"/);
  assert.match(workerSource, /action === "APPROVED" \|\| action === "APPROVAL_REJECTED"/);
  assert.match(workerSource, /SUBMITTED requires the current exact package to be routine-validated or exception-approved first/);
  assert.match(workerSource, /weekday preparation cap of 20/);
  assert.match(workerSource, /routineValidationFields/);
  assert.match(workerSource, /uploaded PDF hash must match the exact immutable validated package/);
  assert.match(workerSource, /authoritative confirmation text/);
  assert.match(workerSource, /Tier C is review-only/);
  assert.match(workerSource, /Tier A and B packages require the exact resume SHA-256/);
  assert.match(workerSource, /shouldPreserveWorkflowStateForPreparation/);
  assert.match(workerSource, /\["Pending", "Blocked"\]\.includes\(String\(approval\.status\)\)/);
  assert.match(workerSource, /preserveWorkflowState \? previous\.status : "Preparing"/);
  assert.match(workerSource, /approval: preserveWorkflowState && previousApproval/);
  assert.match(workerSource, /\.\.\.previousApproval,\s+\.\.\.approval,/);
  assert.match(workerSource, /preparedAt: input\.recordedAt/);
  assert.match(workerSource, /replaceBlockedPackage/);
  assert.match(workerSource, /replacesPackageId === String\(previousApproval\?\.id \|\| ""\)/);
  assert.match(workerSource, /approval\.stableIdempotencyKey[\s\S]*previousApproval\?\.stableIdempotencyKey/);
  assert.match(workerSource, /A blocked package replacement must name the current exact blocked package/);
  assert.doesNotMatch(workerSource, /A completed or advanced application cannot be replaced by a preparation package/);
  assert.match(hubSource, /Routine applications run\. Judgment calls stop here\./);
  assert.match(hubSource, /Exceptions/);
  assert.match(hubSource, /qualification, factual, ATS, rendering, duplicate, answer, immutable-artifact, and live-posting check/);
  assert.match(preparationSyncSource, /JOB_HUB_SIWC_BYPASS_TOKEN/);
  assert.match(preparationSyncSource, /--package-ids/);
  assert.match(preparationSyncSource, /resumeSha256/);
  assert.match(preparationSyncSource, /immutableArtifactPath/);
  assert.match(preparationSyncSource, /exceptionReasons/);
});

test("multi-source discovery is persisted, deduplicated, and visible in Job Hub", () => {
  assert.match(workerSource, /url\.pathname === "\/api\/discovery"/);
  assert.match(workerSource, /job_hub_discovery_events/);
  assert.match(workerSource, /job_hub_discovery_leads/);
  assert.match(workerSource, /idx_job_hub_discovery_leads_dedupe/);
  assert.match(workerSource, /LinkedIn/);
  assert.match(workerSource, /Indeed/);
  assert.match(workerSource, /Wellfound/);
  assert.match(hubSource, /function renderSourcing/);
  assert.match(hubSource, /More places in\. Official evidence out\./);
  assert.match(hubSource, /fetch\("\/api\/discovery"/);
  assert.match(discoverySyncSource, /JOB_HUB_SIWC_BYPASS_TOKEN/);
  assert.match(discoverySyncSource, /--event-ids/);
  assert.match(discoverySyncSource, /SOURCE_SCAN_RECORDED/);
  assert.match(discoverySyncSource, /lead status is unsupported/);
  assert.match(discoverySyncSource, /event\.lead\.status === "Closed"/);
  assert.match(discoverySyncSource, /event\.lead\.status === "Held"/);
});

test("the public seed contains no candidate application history", () => {
  assert.deepEqual(seedApplications, []);
  assert.match(hubSource, /function reconcileConfirmedSubmission/);
  assert.match(hubSource, /\["Interviewing", "Offer", "Rejected", "Closed"\]/);
});

test("applications expose sortable columns and a full role workspace", () => {
  for (const key of ["company", "status", "next", "compensation", "priority", "match"]) {
    assert.match(hubSource, new RegExp(`sortButton\\("${key}"`));
  }
  assert.match(hubSource, /function renderApplicationWorkspace/);
  assert.match(hubSource, /interviewConfirmed \? "Career Lab" : "Career Lab · locked"/);
  assert.match(hubSource, /interviewConfirmed \? `Interviews \$\{stages\.length\}` : "Interviews · locked"/);
  assert.match(hubSource, /Confirmed \/ signal-backed/);
  assert.doesNotMatch(hubSource, /Update this record in Excel/);
});

test("full Career Lab stays gated while recent applications get cached recruiter-call prep", () => {
  assert.match(hubSource, /function hasConfirmedInterview/);
  assert.match(hubSource, /\["Interviewing", "Offer"\]\.includes\(application\.status\)/);
  assert.match(hubSource, /application\.status !== "Applied"/);
  assert.match(hubSource, /age >= 0 && age <= 30/);
  assert.match(hubSource, /applicationWorkspaceTab === "career" && !interviewConfirmed/);
  assert.match(hubSource, /followUpPrepPanel/);
  assert.match(hubSource, /applicationWorkspaceTab === "career" && interviewConfirmed/);
  assert.match(hubSource, /complete Career Lab unlocks after an interview is confirmed/);
  assert.match(hubSource, /Routine mailbox checks do not regenerate it/);
  assert.match(hubSource, /followUpInputFingerprint/);
});

test("Career Lab can research company-specific follow-ups online and cache the sources", () => {
  assert.match(careerFollowUpSource, /type: "web_search"/);
  assert.match(careerFollowUpSource, /tool_choice: "required"/);
  assert.match(careerFollowUpSource, /Prefer the official job posting, company product pages, engineering material, and careers material/);
  assert.match(careerFollowUpSource, /Every answer anchor must use only the supplied verified candidate evidence/);
  assert.match(careerFollowUpSource, /unsupportedOrUnverified/);
  assert.match(hubSource, /\/api\/career-lab-followups/);
  assert.match(hubSource, /Live research cached/);
  assert.match(hubSource, /Current online sources/);
});

test("active applications use daily mailbox checks and estimates stay labeled", () => {
  assert.match(hubSource, /Next mailbox check: tomorrow morning/);
  assert.match(hubSource, /Daily morning Gmail checks are separate from recruiter outreach/);
  assert.match(hubSource, /RECRUITER_OUTREACH_WAIT_DAYS = 7/);
  assert.match(hubSource, /This is an earliest suggested follow-up, not a recruiter or interview date/);
  assert.match(hubSource, /prep\.expectedDateConfirmed \? "Confirmed" : "Estimated"/);
  assert.match(hubSource, /No confirmed recruiter or interview date/);
});

test("funnel health diagnoses only evidence-backed stage bottlenecks", () => {
  assert.match(hubSource, /function calculateFunnelDiagnosis/);
  assert.match(hubSource, /\.slice\(0, 100\)/);
  assert.match(hubSource, /sampleSize >= 100 && screens < 5/);
  assert.match(hubSource, /screens >= 5 && technicalRounds === 0/);
  assert.match(hubSource, /technicalRounds >= 3 && finalRounds === 0/);
  assert.match(hubSource, /finalRounds >= 3 && offers === 0/);
  assert.match(hubSource, /Predicted interviews, suggested follow-up dates, and Career Lab estimates never count/);
  assert.match(hubSource, /Funnel health/);
});

test("match scoring uses verified candidate evidence rather than application priority", () => {
  const scoringBlock = hubSource.match(/function calculateApplicationMatch[\s\S]*?\n}\n\nfunction hiringManagerSearch/);
  assert.ok(scoringBlock, "match-scoring implementation is present");
  assert.match(scoringBlock[0], /verifiedCapabilities/);
  assert.match(scoringBlock[0], /skills \* 0\.45/);
  assert.doesNotMatch(scoringBlock[0], /application\.priority/);
  assert.match(hubSource, /Priority is not used in the score/);
});

test("practice and sync timing retain second precision", () => {
  assert.match(hubSource, /label="Time logged"/);
  assert.match(hubSource, /aria-label="Time logged minutes"/);
  assert.match(hubSource, /aria-label="Time logged seconds"/);
  assert.match(hubSource, /Math\.min\(59/);
  assert.match(hubSource, /second: "2-digit"/);
  assert.match(hubSource, /safeSeconds % 60/);
  assert.match(hubSource, /totalSeconds: updatedSeconds/);
});

test("the separate 60-second explanation field is removed", () => {
  assert.doesNotMatch(hubSource, /Interview explanation \(about 60 seconds\)/);
  assert.doesNotMatch(hubSource, /spoken explanation/);
  assert.doesNotMatch(localBackupSource, /60-Second Explanation/);
  assert.match(codeReviewSource, /There is no separate spoken-explanation field/);
});

test("daily coaching uses the latest three scored journals", () => {
  assert.match(hubSource, /function buildDailyCoaching/);
  assert.match(hubSource, /\.slice\(0, 3\)/);
  assert.match(hubSource, /Most often missing/);
  assert.match(hubSource, /Lowest recent skill/);
  assert.match(hubSource, /Do this next/);
});

test("the overview carousel starts at the earliest unfinished problem and can move backward", () => {
  assert.match(hubSource, /const earliestUnsolvedIndex = interviewPlan\.findIndex/);
  assert.match(hubSource, /const focusAnchorIndex = earliestUnsolvedIndex === -1 \? LAST_PLAN_INDEX : earliestUnsolvedIndex/);
  assert.match(hubSource, /const minimumOffset = -focusAnchorIndex/);
  assert.match(hubSource, /Math\.max\(0, Math\.min\(LAST_PLAN_INDEX, focusAnchorIndex \+ focusDayOffset\)\)/);
  assert.match(hubSource, /Earliest unfinished/);
  assert.match(hubSource, /Show previous or completed problem/);
});

test("journal saves and AI reviews update the private local Excel workbook", () => {
  assert.match(hubSource, /fetch\("\/api\/journal-local-backup"/);
  assert.match(hubSource, /saveProblemEverywhere\(selectedProblem, saved\)/);
  assert.match(hubSource, /saveProblemEverywhere\(selectedProblem, updated\)/);
  assert.match(localBackupSource, /Job_Hub_LeetCode_Journal\.xlsx/);
  assert.match(localBackupSource, /workbook\.addWorksheet\("Journal Log"/);
  assert.match(localBackupSource, /workbook\.addWorksheet\("Review Focus"/);
  assert.match(localBackupSource, /writeLocalWorkbook\(archive\.rows, xlsxPath\)/);
  assert.match(localBackupSource, /job-hub-journals\.json/);
  assert.match(localBackupSource, /job-hub-journals\.csv/);
  assert.match(localBackupSource, /rowsByKey\.set/);
});

test("role gaps separate the missing requirement, evidence bridge, and ramp plan", () => {
  assert.match(hubSource, /type GapBridge/);
  assert.match(hubSource, /function gapBridgeDetails/);
  assert.match(hubSource, /What is missing—and how to bridge it/);
  assert.match(hubSource, /Exact missing requirement/);
  assert.match(hubSource, /Transferable evidence/);
  assert.match(hubSource, /First 30-day move/);
  assert.match(hubSource, /Ready-to-say gap answer/);
  assert.match(hubSource, /missing requirements\?/);
});

test("journal saves queue across multiple questions without blocking navigation", () => {
  assert.match(hubSource, /pendingJournalIdsRef = useRef\(new Set<string>\(\)\)/);
  assert.match(hubSource, /localJournalQueueRef = useRef\(new Map/);
  assert.match(hubSource, /Newer backend data was merged\. Your queued questions are retrying automatically\./);
  assert.match(hubSource, /You can keep editing or open another question/);
  assert.match(hubSource, /function saveAndOpenNextProblem\(\)/);
  assert.match(hubSource, /Save &amp; next/);
  assert.match(hubSource, /Saves queue in the background\. Open another question immediately\./);
  assert.match(hubSource, /\["localhost", "127\.0\.0\.1"\]\.includes\(window\.location\.hostname\)/);
  assert.match(hubSource, /className=\{`journal-sync-indicator sync-\$\{journalSync\.status\}`\}/);
});

test("the live invariant hint asks for a preserved truth", () => {
  assert.match(aiHintSource, /what remains true before and after each iteration/);
});

test("the review language picker uses the polished accessible control", () => {
  assert.match(hubSource, /className="language-select-shell"/);
  assert.match(hubSource, /aria-label="Solution language"/);
  assert.match(hubSource, /languageBadge\(problemDraft\.codeLanguage \|\| settings\.primaryLanguage\)/);
});

test("progressive hints appear before the grading details", () => {
  const resultIndex = hubSource.indexOf('<div className="review-result">');
  const hintsIndex = hubSource.indexOf('<div className="hint-section hint-section-priority">', resultIndex);
  const scoreIndex = hubSource.indexOf('<div className="review-score-row">', resultIndex);
  assert.ok(resultIndex >= 0 && hintsIndex > resultIndex && scoreIndex > hintsIndex);
});

test("AI endpoints use the hosted OpenAI secret and configured model", () => {
  assert.match(workerSource, /env\.OPENAI_API_KEY/);
  assert.match(workerSource, /env\.OPENAI_MODEL/);
  assert.match(workerSource, /createCodeReview/);
  assert.match(workerSource, /createAiHint/);
  assert.match(workerSource, /createCareerFollowUps/);
});
