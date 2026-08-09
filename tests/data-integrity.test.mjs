import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataSource = await readFile(new URL("../app/data.ts", import.meta.url), "utf8");
const hubSource = await readFile(new URL("../app/JobHub.tsx", import.meta.url), "utf8");
const codeReviewSource = await readFile(new URL("../build/local-code-review.ts", import.meta.url), "utf8");
const aiHintSource = await readFile(new URL("../build/ai-hint.ts", import.meta.url), "utf8");
const localBackupSource = await readFile(new URL("../build/local-journal-backup.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const hostingConfig = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));

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
  assert.match(workerSource, /ON CONFLICT\(id\) DO UPDATE/);
  assert.match(hubSource, /fetch\("\/api\/state"/);
  assert.match(hubSource, /JSON\.stringify\(\{ applications, progress, settings \}\)/);
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
});
