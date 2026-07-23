"use client";

import { ChangeEvent, FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLIND_75_TOTAL, blind75CoverageCount, interviewPlan, InterviewProblem, weekThemes } from "./data";

type View = "overview" | "applications" | "prep" | "data";
type ApplicationStatus =
  | "Saved"
  | "Preparing"
  | "Applied"
  | "Interviewing"
  | "Offer"
  | "Rejected"
  | "Closed";
type PrepStatus = "Not Started" | "Attempted" | "Solved with Hint" | "Solved Independently";
type ReviewVerdict = "Correct" | "Mostly correct" | "Incorrect" | "Needs more context";

type CodeReview = {
  verdict: ReviewVerdict;
  score: number;
  scoreBreakdown?: {
    codeCorrectness: number;
    approachReasoning: number;
    complexityAnalysis: number;
    edgeCaseCoverage: number;
    explanationQuality: number;
  };
  inputCoverage?: {
    used: string[];
    missing: string[];
  };
  summary: string;
  correctness: string;
  complexity: {
    time: string;
    space: string;
    assessment: string;
  };
  issues: Array<{
    severity: "Critical" | "Important" | "Minor";
    title: string;
    detail: string;
    fix: string;
  }>;
  edgeCases: Array<{
    case: string;
    expected: string;
    why: string;
  }>;
  referenceApproach: string;
  interviewFeedback: {
    strongPoint: string;
    improve: string;
    explanationOutline: string;
  };
  explanationReview?: {
    assessment: string;
    accuratePoints: string[];
    gaps: string[];
    structureSuggestion: string;
  };
  hints?: Array<{
    level: "Nudge" | "Direction" | "Targeted";
    text: string;
  }>;
  nextAction: string;
  sources: Array<{ title: string; url: string }>;
  reviewedAt: string;
  model: string;
};

type Application = {
  id: string;
  company: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  appliedDate: string;
  followUpDate: string;
  salaryMin: string;
  salaryMax: string;
  source: string;
  link: string;
  priority: "High" | "Medium" | "Low";
  notes: string;
  workbookStatus?: string;
  nextAction?: string;
  currentRound?: string;
  completedRounds?: number;
  latestEmail?: string;
  latestEmailSubject?: string;
  resumePath?: string;
  sheetSynced?: boolean;
  demo?: boolean;
};

type SheetSyncState = {
  status: "connecting" | "connected" | "error";
  workbook: string;
  modifiedAt: string;
  checkedAt: string;
  rowCount: number;
  message: string;
};

type ProblemProgress = {
  status: PrepStatus;
  confidence: number;
  minutes: number;
  totalSeconds: number;
  naiveApproach: string;
  bruteForceTimeComplexity: string;
  bruteForceSpaceComplexity: string;
  invariant: string;
  solutionSteps: string;
  optimalTimeComplexity: string;
  optimalSpaceComplexity: string;
  complexity?: string;
  edgeCases: string;
  mistakes: string;
  explanation: string;
  lastAttempt: string;
  code: string;
  codeLanguage: string;
  codeReview: CodeReview | null;
  hintsUsed: string[];
};

type Settings = {
  startDate: string;
  primaryLanguage: string;
  weeklyGoal: number;
};

const APPLICATIONS_KEY = "job-hub:applications:v1";
const PROGRESS_KEY = "job-hub:problem-progress:v1";
const SETTINGS_KEY = "job-hub:settings:v1";
const SHEET_SYNC_INTERVAL_MS = 30_000;
const HINT_PENALTY = 10;
const LAST_PLAN_INDEX = interviewPlan.length - 1;

const applicationStatuses: ApplicationStatus[] = [
  "Saved",
  "Preparing",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Closed",
];

const emptyProgress: ProblemProgress = {
  status: "Not Started",
  confidence: 0,
  minutes: 0,
  totalSeconds: 0,
  naiveApproach: "",
  bruteForceTimeComplexity: "",
  bruteForceSpaceComplexity: "",
  invariant: "",
  solutionSteps: "",
  optimalTimeComplexity: "",
  optimalSpaceComplexity: "",
  complexity: "",
  edgeCases: "",
  mistakes: "",
  explanation: "",
  lastAttempt: "",
  code: "",
  codeLanguage: "",
  codeReview: null,
  hintsUsed: [],
};

function hasReviewableInput(item: ProblemProgress) {
  return [
    item.code,
    item.naiveApproach,
    item.bruteForceTimeComplexity,
    item.bruteForceSpaceComplexity,
    item.invariant,
    item.solutionSteps,
    item.optimalTimeComplexity,
    item.optimalSpaceComplexity,
    item.complexity,
    item.edgeCases,
    item.mistakes,
    item.explanation,
  ].some((value) => typeof value === "string" && value.trim());
}

function normalizeLanguage(language?: string) {
  if (!language || language === "Python") return "Python 3";
  return language;
}

function normalizeStoredProgress(item?: Partial<ProblemProgress>): ProblemProgress {
  const normalized: ProblemProgress = {
    ...emptyProgress,
    ...item,
    totalSeconds: typeof item?.totalSeconds === "number" ? item.totalSeconds : (item?.minutes ?? 0) * 60,
    bruteForceTimeComplexity: item?.bruteForceTimeComplexity || "",
    bruteForceSpaceComplexity: item?.bruteForceSpaceComplexity || "",
    optimalTimeComplexity: item?.optimalTimeComplexity || item?.complexity || "",
    optimalSpaceComplexity: item?.optimalSpaceComplexity || "",
    codeLanguage: item?.codeLanguage ? normalizeLanguage(item.codeLanguage) : "",
    hintsUsed: Array.isArray(item?.hintsUsed) ? [...new Set(item.hintsUsed.filter((hint): hint is string => typeof hint === "string"))] : [],
  };
  const hasPastAttempt = hasReviewableInput(normalized) || normalized.minutes > 0 || Boolean(normalized.lastAttempt);
  return hasPastAttempt && normalized.status === "Not Started"
    ? { ...normalized, status: "Attempted" }
    : normalized;
}

function independenceScore(item: Pick<ProblemProgress, "hintsUsed">) {
  return Math.max(0, 100 - item.hintsUsed.length * HINT_PENALTY);
}

function formatCoverageLabel(value: string) {
  const labels: Record<string, string> = {
    code: "Solution code",
    bruteForceApproach: "Brute-force approach",
    bruteForceTimeComplexity: "Brute-force time",
    bruteForceSpaceComplexity: "Brute-force space",
    invariant: "Invariant / decision rule",
    optimalSteps: "Optimal algorithm steps",
    optimalTimeComplexity: "Optimal time",
    optimalSpaceComplexity: "Optimal space",
    edgeCaseNotes: "Edge cases & tests",
    mistakes: "Mistakes / bug cause",
    explanation: "Interview explanation (~60 seconds)",
  };
  return labels[value] || value;
}

function scoreCategories(breakdown: NonNullable<CodeReview["scoreBreakdown"]>) {
  return [
    { label: "Code correctness", weight: "40%", score: breakdown.codeCorrectness },
    { label: "Approach & reasoning", weight: "20%", score: breakdown.approachReasoning },
    { label: "Complexity analysis", weight: "10%", score: breakdown.complexityAnalysis },
    { label: "Edge-case coverage", weight: "10%", score: breakdown.edgeCaseCoverage },
    { label: "Explanation quality", weight: "20%", score: breakdown.explanationQuality },
  ];
}

function JournalField({
  id,
  label,
  hint,
  className = "",
  penalizeHint = false,
  onHintShown,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  className?: string;
  penalizeHint?: boolean;
  onHintShown?: () => void;
  children: ReactNode;
}) {
  const [showHint, setShowHint] = useState(false);
  const hintId = `${id}-hint`;
  const toggleHint = () => {
    if (!showHint && penalizeHint) onHintShown?.();
    setShowHint((open) => !open);
  };
  return (
    <div className={`journal-field ${className}`}>
      <div className="journal-field-heading">
        <label htmlFor={id}>{label}</label>
        <button type="button" className="journal-hint-button" aria-expanded={showHint} aria-controls={hintId} onClick={toggleHint}>{showHint ? "Hide hint" : `Show hint${penalizeHint ? ` · −${HINT_PENALTY}` : ""}`}</button>
      </div>
      {showHint && <p className="journal-hint" id={hintId}><b>Hint</b>{hint}</p>}
      {children}
    </div>
  );
}

function getProblemHintContext(problem: InterviewProblem) {
  const pattern = problem.pattern.toLowerCase();
  if (pattern.includes("sql")) return {
    strategy: "the join, grouping, or ranking operation named by the cue",
    bruteForce: "describe the table relationships and rows you must preserve before writing SQL",
    state: "which rows remain after each join or grouping step",
    operation: "table scans, joins, grouping, sorting, and ranking",
    tests: "missing matches, duplicate values, ties, and nulls",
    failure: "dropping rows with the wrong join or mishandling duplicates and ties",
    code: "use clear aliases and verify the query returns the required rows when matches are absent",
  };
  if (pattern.includes("dynamic programming") || pattern.startsWith("dp")) return {
    strategy: "a state definition, recurrence, and base cases",
    bruteForce: "write the raw recursive choices and identify which subproblems repeat",
    state: "exactly what dp[i] or dp[i][j] represents",
    operation: "the number of states multiplied by the work per transition",
    tests: "the smallest input, an unreachable state, and a case where both transitions compete",
    failure: "an unclear state meaning, a missing base case, or reading a state before it is ready",
    code: "make the state meaning visible in names and initialize every base case before transitions",
  };
  if (pattern.includes("backtracking")) return {
    strategy: "choose, recurse, and undo around the cue's constraint",
    bruteForce: "describe generating every candidate and filtering invalid results afterward",
    state: "the current path, next choice position, and what has already been used",
    operation: "the branching factor and maximum decision depth",
    tests: "one-choice input, duplicate-sensitive input, and a branch that must backtrack early",
    failure: "forgetting to undo state, reusing an item illegally, or emitting the same result twice",
    code: "pair every state mutation with an undo and append copies of completed paths",
  };
  if (pattern.includes("graph") || pattern.includes("union find")) return {
    strategy: "the traversal or connectivity structure identified by the cue",
    bruteForce: "describe restarting a search from each candidate without reusing visited or distance state",
    state: "visited nodes plus the queue, stack, parent map, indegree, or distance needed by this graph pattern",
    operation: "how often vertices and edges enter the traversal or priority structure",
    tests: "a disconnected case, a cycle, repeated edges, and the smallest graph",
    failure: "marking visited too late, losing path state, or using DFS when layer order matters",
    code: "define when a node becomes visited and keep every piece of path or level state together",
  };
  if (pattern.includes("tree") || pattern.includes("trie")) return {
    strategy: "a traversal whose return value or carried state matches the cue",
    bruteForce: "describe recomputing subtree or prefix information instead of carrying it once",
    state: "what each recursive call receives and exactly what it returns",
    operation: "node visits plus recursion depth or queue width",
    tests: "an empty tree, one node, a skewed tree, and values that challenge the invariant",
    failure: "mixing the returned subtree value with the separate global answer or missing a null base case",
    code: "write the null case first and keep carried state separate from returned state",
  };
  if (pattern.includes("heap")) return {
    strategy: "a heap that retains only the candidates required by the cue",
    bruteForce: "describe sorting every candidate before keeping only the needed result",
    state: "what each heap entry means and why the heap root is the next useful item",
    operation: "heap pushes and pops multiplied by their logarithmic heap cost",
    tests: "ties, fewer unique values, negative priorities, and k at its smallest or largest",
    failure: "using the wrong min/max orientation or storing incomplete tie-breaking state",
    code: "make each heap tuple's ordering explicit and enforce the intended heap size",
  };
  if (pattern.includes("binary search")) return {
    strategy: "a monotonic decision and one consistent search interval",
    bruteForce: "describe scanning every value or trying every candidate answer in order",
    state: "the exact meaning of left, right, and whether the answer is still inside the interval",
    operation: "how the remaining search range shrinks after each comparison",
    tests: "one element, answer at either boundary, missing answer, and adjacent final pointers",
    failure: "mixing inclusive and exclusive boundaries or moving the wrong side after equality",
    code: "state the loop condition before coding and make each pointer update preserve that convention",
  };
  if (pattern.includes("interval")) return {
    strategy: "sorting followed by the overlap or endpoint rule in the cue",
    bruteForce: "describe comparing each interval with many others before using sorted order",
    state: "the latest accepted or merged interval and what its endpoint guarantees",
    operation: "the sorting cost plus the single pass through intervals",
    tests: "touching endpoints, full containment, no overlap, and an interval covering all others",
    failure: "using the wrong overlap inequality or updating the wrong endpoint",
    code: "separate intervals before, overlapping with, and after the current result",
  };
  if (pattern.includes("linked list")) return {
    strategy: "careful pointer movement and rewiring based on the cue",
    bruteForce: "describe copying node values into an array or rebuilding the list before doing it in place",
    state: "what prev, current, next, slow, or fast points to before each update",
    operation: "how many times each node is visited",
    tests: "empty list, one node, two nodes, and odd versus even length",
    failure: "overwriting the next pointer before saving it or creating a cycle",
    code: "save every pointer you still need before mutating a link",
  };
  if (pattern.includes("stack")) return {
    strategy: "LIFO state that represents unresolved work",
    bruteForce: "describe rescanning earlier elements instead of preserving unresolved items on a stack",
    state: "what every stack entry represents and the order entries must maintain",
    operation: "how many times each item can be pushed and popped",
    tests: "empty input, immediately invalid input, nested input, and a long unresolved suffix",
    failure: "reading an empty stack or popping operands in the wrong order",
    code: "guard every pop and document whether the stack stores values, indices, or pairs",
  };
  if (pattern.includes("sliding window")) return {
    strategy: "an expanding window with a precise validity rule",
    bruteForce: "describe recomputing every candidate substring or subarray independently",
    state: "what the current window contains and exactly when it becomes invalid",
    operation: "how often the left and right boundaries move across the input",
    tests: "all-valid input, immediate duplicates or violations, one element, and a best window at the end",
    failure: "shrinking too little, updating the answer while invalid, or leaving stale counts",
    code: "write the invalid-window condition first and update counts symmetrically when boundaries move",
  };
  if (pattern.includes("two pointers")) return {
    strategy: "two boundaries whose movement is justified by ordered information",
    bruteForce: "describe checking every pair or boundary combination before eliminating choices",
    state: "what is known about all positions outside and between the two pointers",
    operation: "how many total pointer movements occur",
    tests: "pointers meeting immediately, duplicates, no valid result, and the answer at both ends",
    failure: "moving the pointer that cannot improve the result or skipping duplicate handling",
    code: "state why each comparison lets exactly one pointer move safely",
  };
  if (pattern.includes("greedy")) return {
    strategy: "the locally safe choice stated by the cue",
    bruteForce: "describe exploring all possible choices before proving one choice can be committed early",
    state: "the boundary or summary that proves earlier choices never need to be revisited",
    operation: "the sorting cost, if any, plus the single greedy scan",
    tests: "a case where the first tempting choice fails, an impossible case, and a boundary equality",
    failure: "making a local choice without proving it preserves a global solution",
    code: "name the quantity being optimized and update only the state needed for the next safe choice",
  };
  return {
    strategy: "a map, set, frequency table, or prefix state guided by the cue",
    bruteForce: "describe the repeated scan, pair check, or recomputation you would use before hashing",
    state: "what the map, set, counts, or prefix values contain after each processed item",
    operation: "the number and expected cost of lookups, inserts, and array passes",
    tests: "duplicates, negative values, one element, empty input when allowed, and an answer at a boundary",
    failure: "storing or checking in the wrong order, reusing the current item, or mishandling duplicates",
    code: "make the stored key and value meaning explicit and check update order carefully",
  };
}

function getJournalHints(problem: InterviewProblem) {
  const context = getProblemHintContext(problem);
  const cue = `“${problem.cue}”`;
  return {
    status: `For ${problem.title}, use Attempted until you can complete and explain the solution without relying on the answer.`,
    confidence: `Can you explain why ${cue} is true and reproduce the ${problem.pattern} solution tomorrow without notes?`,
    minutes: `${problem.title} has a ${problem.targetMinutes}-minute target. Include thinking, coding, and testing time.`,
    bruteForceApproach: `${problem.title}: ${context.bruteForce}. Then state when that baseline finds the answer.`,
    bruteForceTime: `For ${problem.title}, count the exhaustive candidates or repeated work before applying the insight ${cue}`,
    bruteForceSpace: `For the baseline ${problem.title} solution, count only auxiliary storage and recursion; name what grows with the input.`,
    invariant: `Turn ${cue} into a precise invariant about ${context.state}. State when it is true and why each update preserves it.`,
    optimalSteps: `Build the ${problem.title} procedure around ${context.strategy}. Write the initialization, repeated decision, update, and return in order.`,
    optimalTime: `For this ${problem.pattern} solution, justify time using ${context.operation}; do not give Big-O without the reason.`,
    optimalSpace: `Name every growing structure used for ${context.state}, then give the largest auxiliary-space term.`,
    edgeCases: `For ${problem.title}, test ${context.tests}. Include concrete input and expected output for each.`,
    mistakes: `A likely ${problem.title} failure is ${context.failure}. Record whether that happened and the rule that prevents it.`,
    explanation: `Say: baseline and its cost → ${cue} → ${context.strategy} → final time and space. Keep the explanation specific to ${problem.title}.`,
    code: `In Python 3, ${context.code}. Make the implementation match the invariant ${cue}`,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function dayDifference(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`).getTime();
  const endDate = new Date(`${end}T12:00:00`).getTime();
  return Math.floor((endDate - startDate) / 86_400_000);
}

function formatHumanDate(dateString: string) {
  if (!dateString) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${dateString}T12:00:00`),
  );
}

function formatMoney(value: string) {
  const number = Number(value);
  if (!number) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number);
}

function formatSyncTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function applicationKey(application: Pick<Application, "company" | "role">) {
  return `${application.company}::${application.role}`.trim().toLowerCase();
}

function makeDemoApplications(today: string): Application[] {
  return [
    {
      id: "demo-product",
      company: "Example AI Studio",
      role: "Product Engineer",
      location: "San Francisco, CA",
      status: "Applied",
      appliedDate: addDays(today, -3),
      followUpDate: addDays(today, 4),
      salaryMin: "150000",
      salaryMax: "205000",
      source: "Company careers",
      link: "",
      priority: "High",
      notes: "Demo record — replace this with one of your real applications.",
      demo: true,
    },
    {
      id: "demo-backend",
      company: "Example Platform Co.",
      role: "Backend Engineer",
      location: "Remote",
      status: "Interviewing",
      appliedDate: addDays(today, -8),
      followUpDate: addDays(today, 1),
      salaryMin: "145000",
      salaryMax: "190000",
      source: "Referral",
      link: "",
      priority: "High",
      notes: "Demo record — technical screen preparation is the next action.",
      demo: true,
    },
    {
      id: "demo-solutions",
      company: "Example Data Systems",
      role: "Solutions Engineer",
      location: "Bay Area",
      status: "Saved",
      appliedDate: "",
      followUpDate: addDays(today, 2),
      salaryMin: "140000",
      salaryMax: "185000",
      source: "Job board",
      link: "",
      priority: "Medium",
      notes: "Demo record — review the description and decide whether to apply.",
      demo: true,
    },
  ];
}

function emptyApplication(today: string): Application {
  return {
    id: "",
    company: "",
    role: "",
    location: "San Francisco, CA",
    status: "Saved",
    appliedDate: "",
    followUpDate: addDays(today, 5),
    salaryMin: "",
    salaryMax: "",
    source: "",
    link: "",
    priority: "High",
    notes: "",
  };
}

function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeStatus(value: string): ApplicationStatus {
  const normalized = value.toLowerCase();
  if (normalized.includes("interview")) return "Interviewing";
  if (normalized.includes("offer")) return "Offer";
  if (normalized.includes("reject")) return "Rejected";
  if (normalized.includes("closed") || normalized.includes("exclude")) return "Closed";
  if (normalized.includes("prepar") || normalized.includes("block")) return "Preparing";
  if (normalized.includes("submit") || normalized.includes("appl")) return "Applied";
  return "Saved";
}

function formatTimer(seconds: number) {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

export default function JobHub() {
  const today = toISODate();
  const [view, setView] = useState<View>("overview");
  const [ready, setReady] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [progress, setProgress] = useState<Record<string, ProblemProgress>>({});
  const [settings, setSettings] = useState<Settings>({ startDate: today, primaryLanguage: "Python 3", weeklyGoal: 7 });
  const [applicationDraft, setApplicationDraft] = useState<Application | null>(null);
  const [selectedProblem, setSelectedProblem] = useState<InterviewProblem | null>(null);
  const [problemDraft, setProblemDraft] = useState<ProblemProgress>(emptyProgress);
  const [applicationSearch, setApplicationSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ApplicationStatus>("All");
  const [prepWeek, setPrepWeek] = useState(1);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerProblemId, setTimerProblemId] = useState<number | null>(null);
  const [focusDayOffset, setFocusDayOffset] = useState(0);
  const [focusSlideDirection, setFocusSlideDirection] = useState<"forward" | "back">("forward");
  const [reviewRunning, setReviewRunning] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [toast, setToast] = useState("");
  const [sheetSync, setSheetSync] = useState<SheetSyncState>({
    status: "connecting",
    workbook: "",
    modifiedAt: "",
    checkedAt: "",
    rowCount: 0,
    message: "Connecting to the project tracker…",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncInFlightRef = useRef(false);

  const syncApplicationsFromSheet = useCallback(async (announce = false) => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSheetSync((current) => ({
      ...current,
      status: current.status === "connected" && !announce ? "connected" : "connecting",
      message: "Checking the project tracker…",
    }));
    try {
      const response = await fetch("/api/job-tracker", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.applications)) {
        throw new Error(payload.error || "The project tracker could not be read.");
      }

      const sheetApplications = payload.applications as Application[];
      const sheetKeys = new Set(sheetApplications.map(applicationKey));
      setApplications((current) => [
        ...sheetApplications,
        ...current.filter(
          (application) =>
            !application.sheetSynced && !application.demo && !sheetKeys.has(applicationKey(application)),
        ),
      ]);
      setSheetSync({
        status: "connected",
        workbook: payload.source.workbook,
        modifiedAt: payload.source.modifiedAt,
        checkedAt: payload.source.checkedAt,
        rowCount: payload.source.rowCount,
        message: "Applications are current with the workbook.",
      });
      if (announce) setToast(`${payload.source.rowCount} applications synced from the workbook`);
    } catch (error) {
      setSheetSync((current) => ({
        ...current,
        status: "error",
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "The project tracker could not be read.",
      }));
      if (announce) setToast("Workbook sync failed");
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const localToday = toISODate();
      const storedApplications = localStorage.getItem(APPLICATIONS_KEY);
      const storedProgress = localStorage.getItem(PROGRESS_KEY);
      const storedSettings = localStorage.getItem(SETTINGS_KEY);
      setApplications(storedApplications ? JSON.parse(storedApplications) : makeDemoApplications(localToday));
      if (storedProgress) {
        const savedProgress = JSON.parse(storedProgress) as Record<string, Partial<ProblemProgress>>;
        setProgress(Object.fromEntries(Object.entries(savedProgress).map(([id, item]) => [id, normalizeStoredProgress(item)])));
      } else {
        setProgress({});
      }
      if (storedSettings) {
        const savedSettings = JSON.parse(storedSettings) as Settings;
        setSettings({ ...savedSettings, primaryLanguage: normalizeLanguage(savedSettings.primaryLanguage) });
      }
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(applications));
  }, [applications, ready]);

  useEffect(() => {
    if (!ready) return;
    void syncApplicationsFromSheet();
    const interval = window.setInterval(() => void syncApplicationsFromSheet(), SHEET_SYNC_INTERVAL_MS);
    const syncOnFocus = () => void syncApplicationsFromSheet();
    const syncOnVisible = () => {
      if (document.visibilityState === "visible") void syncApplicationsFromSheet();
    };
    window.addEventListener("focus", syncOnFocus);
    window.addEventListener("online", syncOnFocus);
    document.addEventListener("visibilitychange", syncOnVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncOnFocus);
      window.removeEventListener("online", syncOnFocus);
      document.removeEventListener("visibilitychange", syncOnVisible);
    };
  }, [ready, syncApplicationsFromSheet]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }, [progress, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, ready]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => setTimerSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const planDayIndex = Math.max(0, Math.min(LAST_PLAN_INDEX, dayDifference(settings.startDate, today)));
  const todayProblem = interviewPlan[planDayIndex];
  const currentWeek = todayProblem.week;

  const filteredApplications = useMemo(() => {
    const query = applicationSearch.toLowerCase().trim();
    return applications.filter((application) => {
      const matchesStatus = statusFilter === "All" || application.status === statusFilter;
      const matchesQuery =
        !query ||
        `${application.company} ${application.role} ${application.location} ${application.notes} ${application.nextAction ?? ""} ${application.latestEmailSubject ?? ""}`
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [applicationSearch, applications, statusFilter]);

  const dueApplications = useMemo(
    () =>
      applications
        .filter(
          (application) =>
            application.followUpDate &&
            application.followUpDate <= today &&
            !["Rejected", "Closed", "Offer"].includes(application.status),
        )
        .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate)),
    [applications, today],
  );

  const solvedCount = Object.values(progress).filter((item) =>
    ["Solved with Hint", "Solved Independently"].includes(item.status),
  ).length;
  const totalPrepMinutes = Object.values(progress).reduce((sum, item) => sum + (item.minutes || 0), 0);
  const interviewCount = applications.filter((item) => item.status === "Interviewing").length;
  const appliedCount = applications.filter((item) => ["Applied", "Interviewing", "Offer"].includes(item.status)).length;
  const offerCount = applications.filter((item) => item.status === "Offer").length;
  const activeApplications = applications.filter((item) => !["Rejected", "Closed"].includes(item.status));

  function showToast(message: string) {
    setToast(message);
  }

  function openNewApplication() {
    setApplicationDraft(emptyApplication(today));
  }

  function saveApplication(event: FormEvent) {
    event.preventDefault();
    if (!applicationDraft?.company.trim() || !applicationDraft.role.trim()) return;
    const saved = { ...applicationDraft, id: applicationDraft.id || crypto.randomUUID(), demo: false };
    setApplications((items) => {
      const exists = items.some((item) => item.id === saved.id);
      return exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items];
    });
    setApplicationDraft(null);
    showToast(applicationDraft.id ? "Application updated" : "Application added");
  }

  function deleteApplication(application: Application) {
    if (!window.confirm(`Delete ${application.company} — ${application.role}?`)) return;
    setApplications((items) => items.filter((item) => item.id !== application.id));
    setApplicationDraft(null);
    showToast("Application deleted");
  }

  function openProblem(problem: InterviewProblem) {
    const saved = progress[String(problem.id)];
    const normalized = normalizeStoredProgress(saved);
    setSelectedProblem(problem);
    setProblemDraft({
      ...normalized,
      codeLanguage: normalizeLanguage(normalized.codeLanguage || settings.primaryLanguage),
    });
    setReviewError("");
  }

  function recordHintUse(hintId: string) {
    if (!selectedProblem || problemDraft.hintsUsed.includes(hintId)) return;
    const problemKey = String(selectedProblem.id);
    const updatedDraft: ProblemProgress = {
      ...problemDraft,
      hintsUsed: [...problemDraft.hintsUsed, hintId],
      status: problemDraft.status === "Not Started" ? "Attempted" : problemDraft.status,
      lastAttempt: today,
    };
    setProblemDraft(updatedDraft);
    setProgress((items) => {
      const saved = normalizeStoredProgress(items[problemKey]);
      if (saved.hintsUsed.includes(hintId)) return items;
      return {
        ...items,
        [problemKey]: {
          ...saved,
          hintsUsed: [...saved.hintsUsed, hintId],
          status: saved.status === "Not Started" ? "Attempted" : saved.status,
          lastAttempt: today,
        },
      };
    });
  }

  function saveProblemJournal() {
    if (!selectedProblem) return;
    const markedAttempted = problemDraft.status === "Not Started";
    const saved: ProblemProgress = {
      ...problemDraft,
      status: markedAttempted ? "Attempted" : problemDraft.status,
      lastAttempt: today,
      codeLanguage: normalizeLanguage(problemDraft.codeLanguage || settings.primaryLanguage),
    };
    setProgress((items) => ({ ...items, [String(selectedProblem.id)]: saved }));
    setSelectedProblem(null);
    showToast(markedAttempted ? "Journal saved · problem marked Attempted" : "Problem journal saved");
  }

  async function evaluateCode() {
    if (!selectedProblem || reviewRunning) return;
    if (!hasReviewableInput(problemDraft)) {
      setReviewError("Add your code or at least one journal explanation first.");
      return;
    }

    setReviewRunning(true);
    setReviewError("");
    try {
      const response = await fetch("/api/code-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedProblem.title,
          problemUrl: selectedProblem.url,
          pattern: selectedProblem.pattern,
          language: problemDraft.codeLanguage || settings.primaryLanguage,
          code: problemDraft.code,
          status: problemDraft.status,
          confidence: problemDraft.confidence,
          minutes: problemDraft.minutes,
          bruteForceApproach: problemDraft.naiveApproach,
          bruteForceTimeComplexity: problemDraft.bruteForceTimeComplexity,
          bruteForceSpaceComplexity: problemDraft.bruteForceSpaceComplexity,
          invariant: problemDraft.invariant,
          optimalSteps: problemDraft.solutionSteps,
          optimalTimeComplexity: problemDraft.optimalTimeComplexity || problemDraft.complexity || "",
          optimalSpaceComplexity: problemDraft.optimalSpaceComplexity,
          edgeCaseNotes: problemDraft.edgeCases,
          mistakes: problemDraft.mistakes,
          explanation: problemDraft.explanation,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.review) {
        throw new Error(payload.error || "The AI review could not be completed.");
      }

      const updated = {
        ...problemDraft,
        status: problemDraft.status === "Not Started" ? "Attempted" as const : problemDraft.status,
        lastAttempt: today,
        codeReview: payload.review as CodeReview,
      };
      setProblemDraft(updated);
      setProgress((items) => ({ ...items, [String(selectedProblem.id)]: updated }));
      showToast("AI code and explanation review saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI review could not be completed.";
      const connectionLost = error instanceof TypeError && /fetch|network|load/i.test(message);
      setReviewError(connectionLost ? "Job Hub lost its connection to the local AI service. Refresh the page and try the review again." : message);
    } finally {
      setReviewRunning(false);
    }
  }

  function quickUpdateProblem(problem: InterviewProblem, status: PrepStatus) {
    setProgress((items) => ({
      ...items,
      [String(problem.id)]: {
        ...(items[String(problem.id)] ?? emptyProgress),
        status,
        lastAttempt: status === "Not Started" ? "" : today,
      },
    }));
  }

  function startTimer(problem: InterviewProblem) {
    if (timerProblemId !== problem.id) setTimerSeconds(0);
    setTimerProblemId(problem.id);
    setTimerRunning(true);
  }

  function stopTimer() {
    setTimerRunning(false);
    if (!timerProblemId || timerSeconds < 1) return;
    const minutes = Math.max(1, Math.ceil(timerSeconds / 60));
    const timerKey = String(timerProblemId);
    if (selectedProblem?.id === timerProblemId) {
      const updatedSeconds = (problemDraft.totalSeconds || problemDraft.minutes * 60) + timerSeconds;
      const updatedDraft: ProblemProgress = {
        ...problemDraft,
        minutes: Math.max(1, Math.ceil(updatedSeconds / 60)),
        totalSeconds: updatedSeconds,
        status: problemDraft.status === "Not Started" ? "Attempted" : problemDraft.status,
        lastAttempt: today,
      };
      setProblemDraft(updatedDraft);
      setProgress((items) => ({ ...items, [timerKey]: updatedDraft }));
    } else {
      setProgress((items) => {
        const current = normalizeStoredProgress(items[timerKey]);
        const updatedSeconds = (current.totalSeconds || current.minutes * 60) + timerSeconds;
        return {
          ...items,
          [timerKey]: {
            ...current,
            minutes: Math.max(1, Math.ceil(updatedSeconds / 60)),
            totalSeconds: updatedSeconds,
            status: current.status === "Not Started" ? "Attempted" : current.status,
            lastAttempt: today,
          },
        };
      });
    }
    setTimerSeconds(0);
    showToast(`${minutes} practice minute${minutes === 1 ? "" : "s"} saved`);
  }

  function exportBackup() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      applications,
      progress,
      settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `job-hub-backup-${today}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Backup exported");
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.applications)) setApplications(parsed.applications);
        if (parsed.progress && typeof parsed.progress === "object") {
          const importedProgress = parsed.progress as Record<string, Partial<ProblemProgress>>;
          setProgress(Object.fromEntries(Object.entries(importedProgress).map(([id, item]) => [id, normalizeStoredProgress(item)])));
        }
        if (parsed.settings && typeof parsed.settings === "object") setSettings(parsed.settings);
        showToast("Backup imported");
      } else {
        const rows = parseCSV(text);
        const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
        const value = (row: string[], names: string[]) => {
          const index = headers.findIndex((header) => names.includes(header));
          return index >= 0 ? row[index] ?? "" : "";
        };
        const imported = rows.slice(1).map((row) => ({
          id: crypto.randomUUID(),
          company: value(row, ["company"]),
          role: value(row, ["role", "title"]),
          location: value(row, ["location"]),
          status: normalizeStatus(value(row, ["status", "currentround"])),
          appliedDate: value(row, ["applicationprepdate", "applicationdate", "date"]),
          followUpDate: "",
          salaryMin: value(row, ["minbase", "salarymin"]),
          salaryMax: value(row, ["maxbase", "salarymax"]),
          source: value(row, ["source"]),
          link: value(row, ["joburl", "link", "url"]),
          priority: "High" as const,
          notes: value(row, ["notes", "nextaction"]),
          demo: false,
        })).filter((item) => item.company && item.role);
        setApplications((items) => [...imported, ...items.filter((item) => !item.demo)]);
        showToast(`${imported.length} applications imported`);
      }
    } catch {
      showToast("That file could not be imported");
    }
    event.target.value = "";
  }

  function resetDemo() {
    if (!window.confirm("Replace current application records and prep progress with fresh demo data?")) return;
    setApplications(makeDemoApplications(today));
    setProgress({});
    setSettings({ startDate: today, primaryLanguage: "Python 3", weeklyGoal: 7 });
    showToast("Demo data restored");
  }

  function clearAll() {
    if (!window.confirm("Delete all local Job Hub data from this browser? Export a backup first if you need one.")) return;
    setApplications([]);
    setProgress({});
    showToast("Local data cleared");
  }

  function moveFocusCarousel(step: -1 | 1) {
    setFocusSlideDirection(step > 0 ? "forward" : "back");
    setFocusDayOffset((current) => {
      const normalized = Math.max(0, Math.min(LAST_PLAN_INDEX - planDayIndex, current));
      return Math.max(0, Math.min(LAST_PLAN_INDEX - planDayIndex, normalized + step));
    });
  }

  function renderOverview() {
    const focusProblemIndex = Math.max(planDayIndex, Math.min(LAST_PLAN_INDEX, planDayIndex + focusDayOffset));
    const focusProblem = interviewPlan[focusProblemIndex];
    const focusOffset = focusProblemIndex - planDayIndex;
    const focusProgress = progress[String(focusProblem.id)] ?? emptyProgress;
    const focusTimerActive = timerRunning && timerProblemId === focusProblem.id;
    const focusWorkingSeconds = (focusProgress.totalSeconds || focusProgress.minutes * 60) + (focusTimerActive ? timerSeconds : 0);
    const focusTimeLabel = focusProgress.status.startsWith("Solved") ? "Completed working time" : focusWorkingSeconds > 0 ? "Total working time" : "Practice timer";
    const focusHasSavedJournal = Boolean(progress[String(focusProblem.id)]);
    const focusScheduledDate = addDays(settings.startDate, focusProblem.day - 1);
    const focusDayLabel = focusOffset === 0 ? "Today" : focusOffset === 1 ? "Tomorrow" : `In ${focusOffset} days`;
    const focusDateLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${focusScheduledDate}T12:00:00`));
    const currentWeekProblems = interviewPlan.filter((problem) => problem.week === currentWeek);
    const currentWeekSolved = currentWeekProblems.filter((problem) => ["Solved with Hint", "Solved Independently"].includes(progress[String(problem.id)]?.status)).length;
    const nextMoves = applications
      .filter(
        (application) =>
          (application.followUpDate || application.nextAction) &&
          !["Rejected", "Closed"].includes(application.status) &&
          !application.nextAction?.toLowerCase().startsWith("no action"),
      )
      .sort((a, b) => {
        if (a.followUpDate && b.followUpDate) return a.followUpDate.localeCompare(b.followUpDate);
        if (a.followUpDate) return -1;
        if (b.followUpDate) return 1;
        const priorityRank = { High: 0, Medium: 1, Low: 2 };
        return priorityRank[a.priority] - priorityRank[b.priority];
      })
      .slice(0, 4);

    return (
      <>
        <section className="welcome-row">
          <div>
            <p className="eyebrow">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p>
            <h1>Your search, in one place.</h1>
            <p className="welcome-copy">Move applications forward, protect follow-up dates, and keep technical prep attached to the roles you want.</p>
          </div>
          <button className="primary-button" onClick={openNewApplication}>+ Add application</button>
        </section>

        <section className="metric-grid" aria-label="Job search summary">
          <article className="metric-card"><span>Active pipeline</span><strong>{activeApplications.length}</strong><small>{appliedCount} applied or beyond</small></article>
          <article className="metric-card"><span>Interviews</span><strong>{interviewCount}</strong><small>{offerCount} offers</small></article>
          <article className={`metric-card ${dueApplications.length ? "metric-alert" : ""}`}><span>Follow-ups due</span><strong>{dueApplications.length}</strong><small>{dueApplications.length ? "Needs attention today" : "You are caught up"}</small></article>
          <article className="metric-card"><span>Prep complete</span><strong>{solvedCount}<em>/{interviewPlan.length}</em></strong><small>{BLIND_75_TOTAL}/{BLIND_75_TOTAL} Blind 75 included</small></article>
        </section>

        <section className="overview-grid">
          <article className="focus-card">
            <button className="focus-carousel-arrow focus-carousel-previous" type="button" aria-label={focusOffset === 1 ? "Back to today's problem" : "Show previous scheduled problem"} disabled={focusOffset === 0} onClick={() => moveFocusCarousel(-1)}>‹</button>
            <div className={`focus-card-content slide-${focusSlideDirection}`} key={focusProblem.id} aria-live="polite">
              <div className="card-heading-row">
                <div><p className="eyebrow">{focusDayLabel} · {focusDateLabel} · Day {focusProblem.day}</p><h2>{focusProblem.title}</h2></div>
                <div className="focus-badges"><span className={`progress-state progress-${focusProgress.status.toLowerCase().replaceAll(" ", "-")}`}>{focusProgress.status}</span>{focusProblem.blind75 && <span className="blind75-badge">Blind 75</span>}<span className={`difficulty difficulty-${focusProblem.difficulty.toLowerCase()}`}>{focusProblem.difficulty}</span></div>
              </div>
              <p className="pattern-label">{focusProblem.pattern}</p>
              <p className="focus-cue">“{focusProblem.cue}”</p>
              <div className="focus-meta">
                <span><b>{focusProblem.targetMinutes}</b> min target</span>
                <span><b>{settings.primaryLanguage}</b> language</span>
              </div>
              <div className="timer-panel">
                <div><span>{focusTimeLabel}</span><strong>{formatTimer(focusWorkingSeconds)}</strong>{focusWorkingSeconds > 0 && <small>{focusTimerActive ? "Live session included" : focusProgress.status.startsWith("Solved") ? "Recorded for this completed problem" : "Saved across practice sessions"}</small>}</div>
                <div className="button-row">
                  {!timerRunning || timerProblemId !== focusProblem.id ? (
                    <button className="secondary-button" onClick={() => startTimer(focusProblem)}>Start timer</button>
                  ) : (
                    <button className="secondary-button danger-outline" onClick={stopTimer}>Stop & save</button>
                  )}
                  <button className="text-button" onClick={() => openProblem(focusProblem)}>{focusHasSavedJournal ? "Open saved journal →" : "Open journal →"}</button>
                </div>
              </div>
              <div className="focus-card-footer">
                <a className="leetcode-link" href={focusProblem.url} target="_blank" rel="noreferrer">Open problem on LeetCode ↗</a>
                <span>{focusProblemIndex + 1} of {interviewPlan.length}</span>
              </div>
            </div>
            <button className="focus-carousel-arrow focus-carousel-next" type="button" aria-label={focusOffset === 0 ? "Show tomorrow's problem" : "Show next scheduled problem"} disabled={focusProblemIndex === interviewPlan.length - 1} onClick={() => moveFocusCarousel(1)}>›</button>
          </article>

          <article className="pipeline-card">
            <div className="card-heading-row"><div><p className="eyebrow">Momentum</p><h2>Pipeline pulse</h2></div><button className="text-button" onClick={() => setView("applications")}>View all →</button></div>
            <div className="pipeline-track" aria-label="Application stages">
              {(["Saved", "Preparing", "Applied", "Interviewing", "Offer"] as ApplicationStatus[]).map((status) => {
                const count = applications.filter((item) => item.status === status).length;
                return <div key={status} className={`pipeline-segment stage-${status.toLowerCase()}`} style={{ flex: Math.max(1, count) }} title={`${status}: ${count}`} />;
              })}
            </div>
            <div className="stage-list">
              {(["Saved", "Preparing", "Applied", "Interviewing", "Offer"] as ApplicationStatus[]).map((status) => (
                <div key={status}><span className={`stage-dot stage-${status.toLowerCase()}`} /> <span>{status}</span><strong>{applications.filter((item) => item.status === status).length}</strong></div>
              ))}
            </div>
          </article>
        </section>

        <section className="lower-grid">
          <article className="list-card">
            <div className="card-heading-row"><div><p className="eyebrow">Next moves</p><h2>Follow-up queue</h2></div></div>
            {nextMoves.length ? nextMoves.map((application) => (
              <button className="followup-row" key={application.id} onClick={() => setApplicationDraft(application)}>
                <span className={`priority-marker priority-${application.priority.toLowerCase()}`} />
                <span className="followup-main"><strong>{application.company}</strong><small>{application.role}</small></span>
                {application.followUpDate ? (
                  <span className={application.followUpDate <= today ? "date-overdue" : ""}>{application.followUpDate <= today ? "Due " : ""}{formatHumanDate(application.followUpDate)}</span>
                ) : (
                  <span className="next-action-copy">{application.nextAction}</span>
                )}
              </button>
            )) : <div className="empty-state compact"><strong>No next actions scheduled</strong><span>The workbook’s Next Action column will appear here automatically.</span></div>}
          </article>

          <article className="list-card">
            <div className="card-heading-row"><div><p className="eyebrow">Week {currentWeek}</p><h2>{weekThemes[currentWeek - 1]}</h2></div><button className="text-button" onClick={() => setView("prep")}>Full plan →</button></div>
            <div className="week-progress-row"><div><span style={{ width: `${Math.min(100, (currentWeekSolved / currentWeekProblems.length) * 100)}%` }} /></div><strong>{currentWeekSolved}/{currentWeekProblems.length}</strong></div>
            {currentWeekProblems.slice(0, 4).map((problem) => (
              <button className="mini-problem-row" key={problem.id} onClick={() => openProblem(problem)}>
                <span className={`problem-check ${progress[String(problem.id)]?.status?.startsWith("Solved") ? "is-complete" : ""}`}>{progress[String(problem.id)]?.status?.startsWith("Solved") ? "✓" : problem.day}</span>
                <span><strong>{problem.title}</strong><small>{problem.pattern}</small></span>
                <span>{progress[String(problem.id)]?.status ?? "Not Started"}</span>
              </button>
            ))}
          </article>
        </section>
      </>
    );
  }

  function renderApplications() {
    return (
      <>
        <section className="page-heading">
          <div><p className="eyebrow">Application pipeline</p><h1>Every role. One next move.</h1><p>The Applications sheet is the source of truth. Job Hub checks it every 30 seconds, when this tab becomes visible, and when your connection returns.</p></div>
          <button className="primary-button" onClick={openNewApplication}>+ Add application</button>
        </section>
        <div className={`sheet-sync-banner sync-${sheetSync.status}`}>
          <span className="sheet-sync-dot" />
          <span>
            <b>{sheetSync.status === "connected" ? `${sheetSync.rowCount} applications synced` : sheetSync.status === "connecting" ? "Syncing applications" : "Workbook sync needs attention"}</b>
            <small>
              {sheetSync.status === "connected"
                ? `${sheetSync.workbook} · checked ${formatSyncTime(sheetSync.checkedAt)} · workbook updated ${formatSyncTime(sheetSync.modifiedAt)} · auto-refresh every 30 seconds`
                : sheetSync.message}
            </small>
          </span>
          <button disabled={sheetSync.status === "connecting"} onClick={() => void syncApplicationsFromSheet(true)}>
            {sheetSync.status === "connecting" ? "Checking…" : "Sync now"}
          </button>
        </div>
        {applications.some((item) => item.demo) && <div className="demo-banner"><span><b>Demo records are showing.</b> They are safe placeholders and never leave this browser.</span><button onClick={() => setApplications((items) => items.filter((item) => !item.demo))}>Remove demos</button></div>}
        <section className="toolbar">
          <label className="search-field"><span>⌕</span><input value={applicationSearch} onChange={(event) => setApplicationSearch(event.target.value)} placeholder="Search company, role, location…" /></label>
          <label className="select-field">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | ApplicationStatus)}><option>All</option>{applicationStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <span className="result-count">{filteredApplications.length} role{filteredApplications.length === 1 ? "" : "s"}</span>
        </section>
        <section className="application-list" aria-label="Applications">
          <div className="application-header"><span>Company / Role</span><span>Status</span><span>Next move</span><span>Compensation</span><span>Priority</span><span /></div>
          {filteredApplications.map((application) => (
            <article className="application-row" key={application.id}>
              <div className="company-cell"><strong>{application.company}</strong><span>{application.role}</span><small>{application.location || "Location not set"}{application.sheetSynced ? " · Workbook" : ""}</small></div>
              <div><span className={`status-pill status-${application.status.toLowerCase()}`}>{application.workbookStatus || application.status}</span><small>{application.currentRound && application.currentRound !== application.workbookStatus ? application.currentRound : ""}</small></div>
              <div><strong className={application.followUpDate && application.followUpDate <= today ? "date-overdue" : ""}>{application.followUpDate ? formatHumanDate(application.followUpDate) : application.nextAction || "Not set"}</strong><small>{application.appliedDate ? `${application.workbookStatus === "Prepared" ? "Prepared" : "Dated"} ${formatHumanDate(application.appliedDate)}` : application.latestEmailSubject || application.source || ""}</small></div>
              <div><strong>{application.salaryMin ? `${formatMoney(application.salaryMin)}${application.salaryMax ? `–${formatMoney(application.salaryMax).replace("$", "")}` : "+"}` : "Not listed"}</strong><small>{application.source}</small></div>
              <div><span className={`priority-pill priority-${application.priority.toLowerCase()}`}>{application.priority}</span></div>
              <button className="row-action" aria-label={`Edit ${application.company}`} onClick={() => setApplicationDraft(application)}>•••</button>
            </article>
          ))}
          {!filteredApplications.length && <div className="empty-state"><strong>No applications match this view.</strong><span>Clear the filters or add your first role.</span><button className="secondary-button" onClick={openNewApplication}>Add application</button></div>}
        </section>
      </>
    );
  }

  function renderPrep() {
    const weekProblems = interviewPlan.filter((problem) => problem.week === prepWeek);
    const completedInWeek = weekProblems.filter((problem) => ["Solved with Hint", "Solved Independently"].includes(progress[String(problem.id)]?.status)).length;
    return (
      <>
        <section className="page-heading prep-heading">
          <div><p className="eyebrow">{interviewPlan.length}-day interview plan</p><h1>Practice with a reason.</h1><p>The full Blind 75 is included alongside SQL, backend-design, graph, and role-specific practice for your target jobs.</p></div>
          <div className="prep-summary"><strong>{solvedCount}/{interviewPlan.length}</strong><span>problems complete</span><small>{totalPrepMinutes} minutes logged</small></div>
        </section>
        <section className="prep-controls">
          <label>Plan start<input type="date" value={settings.startDate} onChange={(event) => setSettings({ ...settings, startDate: event.target.value })} /></label>
          <label>Primary language<select value={settings.primaryLanguage} onChange={(event) => setSettings({ ...settings, primaryLanguage: event.target.value })}><option>Python 3</option><option>TypeScript</option><option>Java</option><option>C++</option></select></label>
          <div className="blind75-coverage"><strong>{blind75CoverageCount}/{BLIND_75_TOTAL}</strong><span>Blind 75 included</span></div>
          <div className="privacy-note">Notes and progress stay on this device.</div>
        </section>
        <div className="week-tabs" role="tablist" aria-label="Interview plan weeks">
          {weekThemes.map((theme, index) => <button key={theme} className={prepWeek === index + 1 ? "active" : ""} onClick={() => setPrepWeek(index + 1)}>W{index + 1}</button>)}
        </div>
        <section className="week-hero">
          <div><p className="eyebrow">Week {prepWeek}</p><h2>{weekThemes[prepWeek - 1]}</h2><p>{prepWeek <= 2 ? "Build fast recognition and clean loop invariants." : prepWeek <= 6 ? "Strengthen traversal, state, and boundary reasoning." : prepWeek <= 9 ? "Model connected systems, priority, and dependencies." : "Turn patterns into interview-ready explanations."}</p></div>
          <div className="week-ring" style={{ "--progress": `${(completedInWeek / weekProblems.length) * 360}deg` } as React.CSSProperties}><span><strong>{completedInWeek}</strong>/{weekProblems.length}</span></div>
        </section>
        <section className="problem-list">
          {weekProblems.map((problem) => {
            const item = progress[String(problem.id)] ?? emptyProgress;
            const hasSavedJournal = Boolean(progress[String(problem.id)]);
            const scheduledDate = addDays(settings.startDate, problem.day - 1);
            return (
              <article className={`problem-row ${problem.id === todayProblem.id ? "is-today" : ""}`} key={problem.id}>
                <div className={`problem-number ${item.status.startsWith("Solved") ? "complete" : ""}`}>{item.status.startsWith("Solved") ? "✓" : problem.day}</div>
                <div className="problem-info"><div><strong>{problem.title}</strong>{problem.id === todayProblem.id && <span className="today-badge">Today</span>}{problem.blind75 && <span className="blind75-badge">Blind 75</span>}</div><small>{problem.pattern} · {formatHumanDate(scheduledDate)}</small><p>{problem.cue}</p></div>
                <span className={`difficulty difficulty-${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
                <span className="target-time">{problem.targetMinutes} min</span>
                <select aria-label={`${problem.title} status`} value={item.status} onChange={(event) => quickUpdateProblem(problem, event.target.value as PrepStatus)}><option>Not Started</option><option>Attempted</option><option>Solved with Hint</option><option>Solved Independently</option></select>
                <button className={`journal-button ${hasSavedJournal ? "has-entry" : ""}`} onClick={() => openProblem(problem)}>{hasSavedJournal ? "✓ Journal saved" : "Journal"}</button>
              </article>
            );
          })}
        </section>
      </>
    );
  }

  function renderData() {
    return (
      <>
        <section className="page-heading"><div><p className="eyebrow">Local data</p><h1>You own the record.</h1><p>Applications come from the project workbook. Coding progress, journals, and manually added roles stay in this browser.</p></div></section>
        <section className="data-grid">
          <article className="data-card featured"><div className="data-icon">↓</div><div><h2>Export a backup</h2><p>Download applications, coding progress, journals, and settings as one JSON file.</p><button className="primary-button" onClick={exportBackup}>Download backup</button></div></article>
          <article className="data-card"><div className="data-icon">↑</div><div><h2>Import data</h2><p>Restore a Job Hub JSON backup, or import an Applications CSV from your spreadsheet.</p><button className="secondary-button" onClick={() => fileInputRef.current?.click()}>Choose JSON or CSV</button></div></article>
          <article className="data-card"><div className="data-icon">↻</div><div><h2>Workbook connection</h2><p>{sheetSync.status === "connected" ? `${sheetSync.rowCount} rows connected from ${sheetSync.workbook}. Last checked ${formatSyncTime(sheetSync.checkedAt)}; auto-refresh runs every 30 seconds.` : sheetSync.message}</p><button className="secondary-button" disabled={sheetSync.status === "connecting"} onClick={() => void syncApplicationsFromSheet(true)}>Sync applications now</button></div></article>
          <article className="data-card"><div className="data-icon">↺</div><div><h2>Restore demo</h2><p>Bring back three clearly labeled sample applications and reset the coding plan.</p><button className="secondary-button" onClick={resetDemo}>Restore demo data</button></div></article>
          <article className="data-card danger-card"><div className="data-icon">×</div><div><h2>Clear local data</h2><p>Remove all applications and prep journals saved in this browser. This cannot be undone.</p><button className="danger-button" onClick={clearAll}>Clear everything</button></div></article>
        </section>
        <section className="import-guide"><p className="eyebrow">CSV import columns</p><h2>Works with a simple application export.</h2><p>Job Hub recognizes columns such as <code>Company</code>, <code>Role</code>, <code>Location</code>, <code>Status</code>, <code>Application Date</code>, <code>Min Base</code>, <code>Max Base</code>, <code>Source</code>, <code>Job URL</code>, and <code>Notes</code>.</p></section>
      </>
    );
  }

  if (!ready) return <div className="app-loading">Opening Job Hub…</div>;
  const journalHints = getJournalHints(selectedProblem ?? todayProblem);
  const currentIndependenceScore = independenceScore(problemDraft);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span>JH</span><div><strong>Job Hub</strong><small>Local workspace</small></div></div>
        <nav aria-label="Main navigation">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span>01</span>Overview</button>
          <button className={view === "applications" ? "active" : ""} onClick={() => setView("applications")}><span>02</span>Applications</button>
          <button className={view === "prep" ? "active" : ""} onClick={() => setView("prep")}><span>03</span>Interview prep</button>
          <button className={view === "data" ? "active" : ""} onClick={() => setView("data")}><span>04</span>Data & backup</button>
        </nav>
        <div className="sidebar-foot"><span className={`local-dot ${sheetSync.status === "error" ? "has-error" : ""}`} />{sheetSync.status === "connected" ? "Workbook connected" : "Local workspace"}<button onClick={exportBackup}>Export backup</button></div>
      </aside>
      <main className="main-content">
        <header className="mobile-header"><div className="brand-mark"><span>JH</span><strong>Job Hub</strong></div><select value={view} onChange={(event) => setView(event.target.value as View)} aria-label="Choose page"><option value="overview">Overview</option><option value="applications">Applications</option><option value="prep">Interview prep</option><option value="data">Data & backup</option></select></header>
        {view === "overview" && renderOverview()}
        {view === "applications" && renderApplications()}
        {view === "prep" && renderPrep()}
        {view === "data" && renderData()}
      </main>

      <input ref={fileInputRef} className="hidden-input" type="file" accept=".json,.csv,text/csv,application/json" onChange={importFile} />
      {toast && <div className="toast" role="status">{toast}</div>}

      {applicationDraft && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setApplicationDraft(null)}>
          <section className="modal-panel application-modal" role="dialog" aria-modal="true" aria-labelledby="application-title">
            <div className="modal-header"><div><p className="eyebrow">Application record</p><h2 id="application-title">{applicationDraft.sheetSynced ? "Application details" : applicationDraft.id ? "Edit application" : "Add application"}</h2></div><button className="close-button" onClick={() => setApplicationDraft(null)} aria-label="Close">×</button></div>
            <form onSubmit={saveApplication}>
              {applicationDraft.sheetSynced && <div className="sheet-record-note"><b>Synced from the project workbook.</b><span>{applicationDraft.nextAction ? `Next action: ${applicationDraft.nextAction}` : "No next action is set."}{applicationDraft.latestEmailSubject ? ` · Latest email: ${applicationDraft.latestEmailSubject}` : ""}</span><span>Update this record in Excel; Job Hub will pull the change automatically.</span></div>}
              <fieldset className="form-grid" disabled={applicationDraft.sheetSynced}>
                <label>Company<input required autoFocus value={applicationDraft.company} onChange={(event) => setApplicationDraft({ ...applicationDraft, company: event.target.value })} /></label>
                <label>Role<input required value={applicationDraft.role} onChange={(event) => setApplicationDraft({ ...applicationDraft, role: event.target.value })} /></label>
                <label>Location<input value={applicationDraft.location} onChange={(event) => setApplicationDraft({ ...applicationDraft, location: event.target.value })} /></label>
                <label>Status<select value={applicationDraft.status} onChange={(event) => setApplicationDraft({ ...applicationDraft, status: event.target.value as ApplicationStatus })}>{applicationStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                <label>Applied date<input type="date" value={applicationDraft.appliedDate} onChange={(event) => setApplicationDraft({ ...applicationDraft, appliedDate: event.target.value })} /></label>
                <label>Follow-up date<input type="date" value={applicationDraft.followUpDate} onChange={(event) => setApplicationDraft({ ...applicationDraft, followUpDate: event.target.value })} /></label>
                <label>Minimum base<input type="number" placeholder="150000" value={applicationDraft.salaryMin} onChange={(event) => setApplicationDraft({ ...applicationDraft, salaryMin: event.target.value })} /></label>
                <label>Maximum base<input type="number" placeholder="210000" value={applicationDraft.salaryMax} onChange={(event) => setApplicationDraft({ ...applicationDraft, salaryMax: event.target.value })} /></label>
                <label>Source<input placeholder="Company careers, referral…" value={applicationDraft.source} onChange={(event) => setApplicationDraft({ ...applicationDraft, source: event.target.value })} /></label>
                <label>Priority<select value={applicationDraft.priority} onChange={(event) => setApplicationDraft({ ...applicationDraft, priority: event.target.value as Application["priority"] })}><option>High</option><option>Medium</option><option>Low</option></select></label>
                <label className="form-wide">Job URL<input type="url" placeholder="https://" value={applicationDraft.link} onChange={(event) => setApplicationDraft({ ...applicationDraft, link: event.target.value })} /></label>
                <label className="form-wide">Next action / notes<textarea rows={4} value={applicationDraft.notes} onChange={(event) => setApplicationDraft({ ...applicationDraft, notes: event.target.value })} /></label>
              </fieldset>
              <div className="modal-actions">
                {!applicationDraft.sheetSynced && applicationDraft.id && <button type="button" className="danger-link" onClick={() => deleteApplication(applicationDraft)}>Delete</button>}
                <span />
                <button type="button" className="secondary-button" onClick={() => setApplicationDraft(null)}>{applicationDraft.sheetSynced ? "Close" : "Cancel"}</button>
                {!applicationDraft.sheetSynced && <button className="primary-button" type="submit">Save application</button>}
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedProblem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProblem(null)}>
          <section className="modal-panel journal-modal" role="dialog" aria-modal="true" aria-labelledby="journal-title">
            <div className="modal-header"><div><p className="eyebrow">Day {selectedProblem.day} · Week {selectedProblem.week}</p><h2 id="journal-title">{selectedProblem.title}</h2><p>{selectedProblem.pattern} · {selectedProblem.targetMinutes} minute target</p></div><button className="close-button" onClick={() => setSelectedProblem(null)} aria-label="Close">×</button></div>
            <div className="journal-callout"><strong>Recognition cue</strong><span>{selectedProblem.cue}</span><a href={selectedProblem.url} target="_blank" rel="noreferrer">Open LeetCode ↗</a></div>
            <div className="journal-status-row">
              <JournalField id="journal-status" label="Status" hint={journalHints.status}><select id="journal-status" aria-describedby="journal-status-hint" value={problemDraft.status} onChange={(event) => setProblemDraft({ ...problemDraft, status: event.target.value as PrepStatus, codeReview: null })}><option>Not Started</option><option>Attempted</option><option>Solved with Hint</option><option>Solved Independently</option></select></JournalField>
              <JournalField id="journal-confidence" label="Confidence" hint={journalHints.confidence}><select id="journal-confidence" aria-describedby="journal-confidence-hint" value={problemDraft.confidence} onChange={(event) => setProblemDraft({ ...problemDraft, confidence: Number(event.target.value), codeReview: null })}><option value="0">Not rated</option><option value="1">1 — Cannot reproduce</option><option value="2">2 — Need notes</option><option value="3">3 — Mostly clear</option><option value="4">4 — Can re-code</option><option value="5">5 — Can explain cold</option></select></JournalField>
              <JournalField id="journal-minutes" label="Minutes" hint={journalHints.minutes}><input id="journal-minutes" aria-describedby="journal-minutes-hint" type="number" min="0" value={problemDraft.minutes} onChange={(event) => { const minutes = Number(event.target.value); setProblemDraft({ ...problemDraft, minutes, totalSeconds: minutes * 60, codeReview: null }); }} /></JournalField>
            </div>
            <div className={`journal-timer ${timerRunning && timerProblemId === selectedProblem.id ? "is-running" : ""}`}>
              <div className="journal-timer-clock"><span>Practice timer</span><strong>{timerProblemId === selectedProblem.id ? formatTimer(timerSeconds) : "00:00"}</strong></div>
              <p>{timerRunning && timerProblemId === selectedProblem.id ? "Timing this attempt now. Stop when you finish to add it to Minutes." : "Start here and keep the journal open while you solve. Time is saved when you stop."}</p>
              {!timerRunning || timerProblemId !== selectedProblem.id ? (
                <button type="button" className="journal-timer-button" onClick={() => startTimer(selectedProblem)}>▶ Start timer</button>
              ) : (
                <button type="button" className="journal-timer-button is-stop" onClick={stopTimer}>■ Stop & add time</button>
              )}
            </div>
            <div className="journal-grid">
              <JournalField id="brute-force-approach" className="journal-wide" label="My brute-force approach" hint={journalHints.bruteForceApproach} penalizeHint onHintShown={() => recordHintUse("brute-force-approach")}><textarea id="brute-force-approach" aria-describedby="brute-force-approach-hint" rows={4} value={problemDraft.naiveApproach} onChange={(event) => setProblemDraft({ ...problemDraft, naiveApproach: event.target.value, codeReview: null })} placeholder="What would the brute-force solution do, step by step?" /></JournalField>
              <JournalField id="brute-force-time" label="Brute-force time complexity" hint={journalHints.bruteForceTime} penalizeHint onHintShown={() => recordHintUse("brute-force-time")}><textarea id="brute-force-time" aria-describedby="brute-force-time-hint" rows={2} value={problemDraft.bruteForceTimeComplexity} onChange={(event) => setProblemDraft({ ...problemDraft, bruteForceTimeComplexity: event.target.value, codeReview: null })} placeholder="Example: O(n²), because…" /></JournalField>
              <JournalField id="brute-force-space" label="Brute-force space complexity" hint={journalHints.bruteForceSpace} penalizeHint onHintShown={() => recordHintUse("brute-force-space")}><textarea id="brute-force-space" aria-describedby="brute-force-space-hint" rows={2} value={problemDraft.bruteForceSpaceComplexity} onChange={(event) => setProblemDraft({ ...problemDraft, bruteForceSpaceComplexity: event.target.value, codeReview: null })} placeholder="Example: O(1) auxiliary space, because…" /></JournalField>
              <JournalField id="journal-invariant" className="journal-wide" label="Key invariant / decision rule" hint={journalHints.invariant} penalizeHint onHintShown={() => recordHintUse("journal-invariant")}><textarea id="journal-invariant" aria-describedby="journal-invariant-hint" rows={4} value={problemDraft.invariant} onChange={(event) => setProblemDraft({ ...problemDraft, invariant: event.target.value, codeReview: null })} placeholder="What stays true after every step, and why is each choice safe?" /></JournalField>
              <JournalField id="optimal-steps" className="journal-wide" label="Optimal algorithm steps" hint={journalHints.optimalSteps} penalizeHint onHintShown={() => recordHintUse("optimal-steps")}><textarea id="optimal-steps" aria-describedby="optimal-steps-hint" rows={5} value={problemDraft.solutionSteps} onChange={(event) => setProblemDraft({ ...problemDraft, solutionSteps: event.target.value, codeReview: null })} placeholder="Write the optimized algorithm step by step in plain English." /></JournalField>
              <JournalField id="optimal-time" label="Optimal time complexity" hint={journalHints.optimalTime} penalizeHint onHintShown={() => recordHintUse("optimal-time")}><textarea id="optimal-time" aria-describedby="optimal-time-hint" rows={2} value={problemDraft.optimalTimeComplexity} onChange={(event) => setProblemDraft({ ...problemDraft, optimalTimeComplexity: event.target.value, codeReview: null })} placeholder="Example: O(n), because each item…" /></JournalField>
              <JournalField id="optimal-space" label="Optimal space complexity" hint={journalHints.optimalSpace} penalizeHint onHintShown={() => recordHintUse("optimal-space")}><textarea id="optimal-space" aria-describedby="optimal-space-hint" rows={2} value={problemDraft.optimalSpaceComplexity} onChange={(event) => setProblemDraft({ ...problemDraft, optimalSpaceComplexity: event.target.value, codeReview: null })} placeholder="State auxiliary space and explain it." /></JournalField>
              <JournalField id="edge-cases" label="Edge cases & tests" hint={journalHints.edgeCases} penalizeHint onHintShown={() => recordHintUse("edge-cases")}><textarea id="edge-cases" aria-describedby="edge-cases-hint" rows={3} value={problemDraft.edgeCases} onChange={(event) => setProblemDraft({ ...problemDraft, edgeCases: event.target.value, codeReview: null })} placeholder="Empty, duplicates, boundaries…" /></JournalField>
              <JournalField id="mistakes" label="Mistakes / bug cause" hint={journalHints.mistakes} penalizeHint onHintShown={() => recordHintUse("mistakes")}><textarea id="mistakes" aria-describedby="mistakes-hint" rows={3} value={problemDraft.mistakes} onChange={(event) => setProblemDraft({ ...problemDraft, mistakes: event.target.value, codeReview: null })} placeholder="What went wrong and why?" /></JournalField>
              <JournalField id="interview-explanation" className="journal-wide" label="Interview explanation (about 60 seconds)" hint={journalHints.explanation} penalizeHint onHintShown={() => recordHintUse("interview-explanation")}><textarea id="interview-explanation" aria-describedby="interview-explanation-hint" rows={4} value={problemDraft.explanation} onChange={(event) => setProblemDraft({ ...problemDraft, explanation: event.target.value, codeReview: null })} placeholder="Write what you would actually say aloud to the interviewer in about 60 seconds." /></JournalField>
            </div>
            <section className="code-review-lab" aria-labelledby="code-review-heading">
              <div className="code-review-heading">
                <div><p className="eyebrow">AI submission coach</p><h3 id="code-review-heading">Score your full {problemDraft.codeLanguage || settings.primaryLanguage} submission.</h3><p>AI reviews your brute force, optimal algorithm, all four complexity answers, spoken explanation, and code as separate evidence.</p></div>
                <span className="online-badge"><i />Online research</span>
              </div>
              <div className="independence-panel">
                <div><p className="eyebrow">Independent work score</p><strong>Hints and final submission are scored separately.</strong><span>Each unique solution hint costs {HINT_PENALTY} points. Reopening the same hint does not cost more.</span></div>
                <div className="independence-value"><strong>{currentIndependenceScore}</strong><span>/100</span><small>{problemDraft.hintsUsed.length} hint{problemDraft.hintsUsed.length === 1 ? "" : "s"} used</small></div>
              </div>
              <div className="code-review-controls">
                <label>Language<select value={problemDraft.codeLanguage || settings.primaryLanguage} onChange={(event) => setProblemDraft({ ...problemDraft, codeLanguage: event.target.value, codeReview: null })}><option>Python 3</option><option>TypeScript</option><option>JavaScript</option><option>Java</option><option>C++</option><option>C#</option><option>Go</option><option>Rust</option><option>Swift</option><option>Kotlin</option></select></label>
                <span>Your code and journal answers are sent to OpenAI only when you request a review.</span>
                <button className="review-button" disabled={reviewRunning || !hasReviewableInput(problemDraft)} onClick={() => void evaluateCode()}>{reviewRunning ? "Scoring your work…" : problemDraft.codeReview ? "Score again" : "Score all my work"}</button>
              </div>
              <JournalField id="solution-code" className="code-input-label" label={`Paste your ${problemDraft.codeLanguage || settings.primaryLanguage} solution`} hint={journalHints.code} penalizeHint onHintShown={() => recordHintUse("solution-code")}><textarea id="solution-code" aria-describedby="solution-code-hint" className="code-input" rows={14} spellCheck={false} value={problemDraft.code} onChange={(event) => setProblemDraft({ ...problemDraft, code: event.target.value, codeReview: null })} placeholder={`Paste your ${problemDraft.codeLanguage || settings.primaryLanguage} solution here…`} /></JournalField>
              {reviewRunning && <div className="review-loading" role="status"><span /><div><strong>Checking your code, reasoning, and explanation…</strong><small>This usually takes under a minute.</small></div></div>}
              {reviewError && <div className="review-error" role="alert"><strong>Review could not run</strong><span>{reviewError}</span><small>Your journal stays saved in this browser. If the connection message repeats, confirm Job Hub is still running locally and refresh.</small></div>}
              {problemDraft.codeReview && (
                <div className="review-result">
                  <div className="review-score-row">
                    <div className={`verdict-badge verdict-${problemDraft.codeReview.verdict.toLowerCase().replaceAll(" ", "-")}`}>{problemDraft.codeReview.verdict}</div>
                    <div className="review-score"><small>Final submission</small><div><strong>{problemDraft.codeReview.score}</strong><span>/100</span></div></div>
                    <div className="review-score independence-result"><small>Independence</small><div><strong>{currentIndependenceScore}</strong><span>/100</span></div></div>
                    <div><strong>{problemDraft.codeReview.summary}</strong><small>Reviewed {formatSyncTime(problemDraft.codeReview.reviewedAt)} · {problemDraft.codeReview.model}</small></div>
                  </div>
                  {problemDraft.codeReview.scoreBreakdown && (
                    <div className="score-breakdown">
                      <div className="score-breakdown-heading"><div><p className="eyebrow">Weighted scorecard</p><h4>How every part of your submission scored</h4></div>{problemDraft.codeReview.inputCoverage && <span>{problemDraft.codeReview.inputCoverage.used.length} inputs reviewed</span>}</div>
                      <div className="score-bars">{scoreCategories(problemDraft.codeReview.scoreBreakdown).map((category) => <div className="score-bar-row" key={category.label}><div><strong>{category.label}</strong><small>{category.weight} of total</small></div><div className="score-bar-track"><span style={{ width: `${category.score}%` }} /></div><b>{category.score}</b></div>)}</div>
                      {problemDraft.codeReview.inputCoverage && <div className="input-coverage"><div><strong>Evidence used</strong>{problemDraft.codeReview.inputCoverage.used.map((item) => <span className="coverage-chip used" key={item}>✓ {formatCoverageLabel(item)}</span>)}</div>{problemDraft.codeReview.inputCoverage.missing.length > 0 && <div><strong>Still missing</strong>{problemDraft.codeReview.inputCoverage.missing.map((item) => <span className="coverage-chip missing" key={item}>+ {formatCoverageLabel(item)}</span>)}</div>}</div>}
                    </div>
                  )}
                  <div className="review-two-column">
                    <article><p className="eyebrow">Correctness</p><p>{problemDraft.codeReview.correctness}</p></article>
                    <article><p className="eyebrow">Complexity</p><div className="complexity-pills"><span>Time <b>{problemDraft.codeReview.complexity.time}</b></span><span>Space <b>{problemDraft.codeReview.complexity.space}</b></span></div><p>{problemDraft.codeReview.complexity.assessment}</p></article>
                  </div>
                  <div className="review-section">
                    <div className="review-section-title"><p className="eyebrow">Findings</p><h4>{problemDraft.codeReview.issues.length ? `${problemDraft.codeReview.issues.length} thing${problemDraft.codeReview.issues.length === 1 ? "" : "s"} to inspect` : "No major issues found"}</h4></div>
                    {problemDraft.codeReview.issues.length > 0 && <div className="issue-list">{problemDraft.codeReview.issues.map((issue, index) => <article key={`${issue.title}-${index}`}><span className={`severity severity-${issue.severity.toLowerCase()}`}>{issue.severity}</span><div><strong>{issue.title}</strong><p>{issue.detail}</p><small><b>Fix:</b> {issue.fix}</small></div></article>)}</div>}
                  </div>
                  <div className="review-two-column">
                    <article><p className="eyebrow">Reference approach</p><p>{problemDraft.codeReview.referenceApproach}</p></article>
                    <article><p className="eyebrow">Your next action</p><p>{problemDraft.codeReview.nextAction}</p></article>
                  </div>
                  <div className="review-section">
                    <div className="review-section-title"><p className="eyebrow">Edge-case test deck</p><h4>Try these before submitting</h4></div>
                    <div className="edge-case-grid">{problemDraft.codeReview.edgeCases.map((edgeCase, index) => <article key={`${edgeCase.case}-${index}`}><strong>{edgeCase.case}</strong><span>Expected: {edgeCase.expected}</span><small>{edgeCase.why}</small></article>)}</div>
                  </div>
                  <div className="interview-coach-card">
                    <p className="eyebrow">Interview explanation</p>
                    <div><strong>Strong point</strong><span>{problemDraft.codeReview.interviewFeedback.strongPoint}</span></div>
                    <div><strong>Improve</strong><span>{problemDraft.codeReview.interviewFeedback.improve}</span></div>
                    <div><strong>60-second outline</strong><span>{problemDraft.codeReview.interviewFeedback.explanationOutline}</span></div>
                  </div>
                  {problemDraft.codeReview.explanationReview && (
                    <div className="explanation-review-card">
                      <div><p className="eyebrow">Your written explanation</p><h4>Communication review</h4><p>{problemDraft.codeReview.explanationReview.assessment}</p></div>
                      <section><strong>Accurate points</strong>{problemDraft.codeReview.explanationReview.accuratePoints.length > 0 ? <ul>{problemDraft.codeReview.explanationReview.accuratePoints.map((point) => <li key={point}>{point}</li>)}</ul> : <p>No clearly supported points were provided yet.</p>}</section>
                      <section><strong>Gaps to close</strong>{problemDraft.codeReview.explanationReview.gaps.length > 0 ? <ul>{problemDraft.codeReview.explanationReview.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p>No major communication gaps found.</p>}</section>
                      <section className="structure-suggestion"><strong>How to structure your next attempt</strong><p>{problemDraft.codeReview.explanationReview.structureSuggestion}</p></section>
                    </div>
                  )}
                  {problemDraft.codeReview.hints && problemDraft.codeReview.hints.length > 0 && (
                    <div className="hint-section">
                      <div className="review-section-title"><p className="eyebrow">Progressive hints</p><h4>Reveal only as much as you need</h4></div>
                      <div className="hint-ladder">{problemDraft.codeReview.hints.map((hint, index) => <details key={`${hint.level}-${index}`} onToggle={(event) => event.currentTarget.open && recordHintUse(`ai-review-hint-${index}`)}><summary><span>{index + 1}</span><strong>{hint.level}</strong><small>Reveal · −{HINT_PENALTY} independence</small></summary><p>{hint.text}</p></details>)}</div>
                    </div>
                  )}
                  {problemDraft.codeReview.sources.length > 0 && <div className="review-sources"><span>References checked</span>{problemDraft.codeReview.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title} ↗</a>)}</div>}
                  <p className="review-disclaimer">AI feedback can be wrong and does not execute your code. Confirm with LeetCode tests before marking the problem solved.</p>
                </div>
              )}
            </section>
            <div className="modal-actions"><span /><button className="secondary-button" onClick={() => setSelectedProblem(null)}>Cancel</button><button className="primary-button" onClick={saveProblemJournal}>Save journal</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
