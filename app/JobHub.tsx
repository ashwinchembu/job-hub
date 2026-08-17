"use client";

import { ChangeEvent, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BLIND_75_TOTAL, blind75CoverageCount, interviewPlan, InterviewProblem, weekThemes } from "./data";
import {
  AGENT_PREFERENCES_KEY,
  AGENT_TOKEN_SESSION_KEY,
  buildCodexGuide,
  buildSafeRuntimeSetup,
  DEFAULT_PRIVATE_ROOT,
  isAllowedAgentBaseUrl,
  isSafePrivateRoot,
  normalizeAgentBaseUrl,
} from "./agent-setup";

type View = "overview" | "matches" | "sourcing" | "career" | "applications" | "application" | "funnel" | "prep" | "data";
type ApplicationWorkspaceTab = "overview" | "match" | "career" | "interviews" | "edit";
type ApplicationSortKey = "company" | "status" | "next" | "compensation" | "priority" | "match";
type SortDirection = "asc" | "desc";
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

type ApplicationApprovalPackage = {
  id: string;
  tier: "A" | "B" | "C";
  status: "Validated" | "Pending" | "Approved" | "Rejected" | "Submitted" | "Blocked";
  preparedAt: string;
  approvedAt?: string;
  reviewedAt?: string;
  submittedAt?: string;
  tailoringLevel?: "Full" | "Concise" | "Review only";
  score?: number;
  track?: string;
  officialJobUrl: string;
  officialVerifiedAt?: string;
  compensation?: string;
  requirements: string[];
  gaps: string[];
  answers: Array<{ question: string; answer: string }>;
  resumeFileName?: string;
  resumePath?: string;
  resumeSha256?: string;
  resumePreview?: string;
  resumePreviewUrl?: string;
  immutableArtifactPath?: string;
  stableIdempotencyKey?: string;
  uploadedPdfSha256?: string;
  exceptionReasons?: string[];
  validation?: Record<string, boolean>;
};

type InterviewFollowUpDrill = {
  headline: string;
  researchedSummary: string;
  questionGroups: Array<{
    trigger: string;
    questions: string[];
    answerAnchor: string;
    verifiedEvidence: string;
    truthBoundary: string;
  }>;
  unsupportedOrUnverified: string[];
  freshnessNote: string;
  sources: Array<{ title: string; url: string }>;
  generatedAt: string;
  model: string;
  inputFingerprint?: string;
};

type CompanyScreeningPrep = {
  status: "Not started" | "Researching" | "Ready to rehearse" | "Rehearsed";
  researchedAt: string;
  companySnapshot: string;
  whyCompany: string;
  recruiterPitch: string;
  roleFit: string;
  technicalStories: string;
  likelyQuestions: string;
  followUpQuestions: string;
  followUpAnswerPlan: string;
  followUpDrill?: InterviewFollowUpDrill;
  questionsToAsk: string;
  interviewProcess: string;
  predictedNextStep: string;
  expectedNextInterviewDate: string;
  expectedDateConfirmed: boolean;
  expectedDateConfidence: "Low" | "Medium" | "High";
  predictionBasis: string;
  fullPipelinePlan: string;
  preparationPlan: string;
  recruiterNarrative: string;
  lastMailboxCheck: string;
  mailboxSignal: string;
  risksAndBoundaries: string;
  sources: string;
  checklist: string;
};

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
  screeningPrep?: CompanyScreeningPrep;
  sheetSynced?: boolean;
  backendActionIds?: string[];
  approval?: ApplicationApprovalPackage;
  demo?: boolean;
};

type FunnelDiagnosis = {
  key: "insufficient" | "targeting" | "narrative" | "technical" | "closing" | "healthy";
  title: string;
  summary: string;
  action: string;
  confidence: "Early signal" | "Evidence-backed";
  sampleSize: number;
  screens: number;
  technicalRounds: number;
  finalRounds: number;
  offers: number;
  screenRate: number;
  technicalRate: number;
  finalRate: number;
  offerRate: number;
};

type ApplicationMatch = {
  score: number;
  confidence: "Low" | "Medium" | "High";
  track: string;
  dimensions: Array<{ label: string; score: number }>;
  matchedCapabilities: Array<{ label: string; evidence: string }>;
  gaps: string[];
  rationale: string;
};

type GapBridge = {
  title: string;
  boundary: string;
  transferableEvidence: string;
  rampPlan: string;
  recruiterQuestion: string;
  talkTrack: string;
  rehearsalReady: boolean;
};

type SheetSyncState = {
  status: "connecting" | "connected" | "error";
  workbook: string;
  modifiedAt: string;
  checkedAt: string;
  rowCount: number;
  message: string;
};

type DiscoverySource = {
  key: string;
  name: string;
  lane: string;
  cadence: string;
  verification: string;
  lastScan: string;
  scanStatus: "not-started" | "completed" | "partial" | "blocked";
  resultsFound: number;
  qualifiedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  note: string;
};

type DiscoveryLead = {
  id: string;
  company: string;
  role: string;
  location: string;
  status: "Discovered" | "Verified" | "Qualified" | "Rejected" | "Duplicate" | "Applied" | "Blocked";
  source: string;
  sourceUrl?: string;
  officialUrl?: string;
  discoveredSources?: string[];
  salaryMin?: string;
  salaryMax?: string;
  workModel?: string;
  experienceLevel?: string;
  reason?: string;
  discoveredAt?: string;
  updatedAt?: string;
};

type DiscoveryRun = {
  eventId?: string;
  recordedAt?: string;
  run?: {
    runId?: string;
    sourcesAttempted?: number;
    leadsFound?: number;
    leadsQualified?: number;
    applicationsSubmitted?: number;
    note?: string;
  };
};

type DiscoveryDashboard = {
  status: "loading" | "connected" | "error";
  sources: DiscoverySource[];
  leads: DiscoveryLead[];
  runs: DiscoveryRun[];
  updatedAt: string;
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

type LocalJournalBackupState = {
  status: "ready" | "saving" | "saved" | "error";
  message: string;
  rowCount: number;
  jsonPath: string;
  csvPath: string;
  xlsxPath: string;
};

type JournalSyncState = {
  status: "idle" | "queued" | "saving" | "saved" | "error";
  pending: number;
  message: string;
};

const APPLICATIONS_KEY = "job-hub:applications:v1";
const PROGRESS_KEY = "job-hub:problem-progress:v1";
const SETTINGS_KEY = "job-hub:settings:v1";
const BACKEND_SYNC_DELAY_MS = 700;
const RECRUITER_OUTREACH_WAIT_DAYS = 7;
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

const emptyScreeningPrep: CompanyScreeningPrep = {
  status: "Not started",
  researchedAt: "",
  companySnapshot: "",
  whyCompany: "",
  recruiterPitch: "",
  roleFit: "",
  technicalStories: "",
  likelyQuestions: "",
  followUpQuestions: "",
  followUpAnswerPlan: "",
  questionsToAsk: "",
  interviewProcess: "",
  predictedNextStep: "",
  expectedNextInterviewDate: "",
  expectedDateConfirmed: false,
  expectedDateConfidence: "Low",
  predictionBasis: "",
  fullPipelinePlan: "",
  preparationPlan: "",
  recruiterNarrative: "Summarize the candidate’s verified background, the role they want next, and the positive reason for the transition. Keep the explanation concise, factual, and free of private employer commentary.",
  lastMailboxCheck: "",
  mailboxSignal: "",
  risksAndBoundaries: "",
  sources: "",
  checklist: "Research company and products\nWrite a specific why-company answer\nPrepare a 60-second introduction\nMap three verified technical stories\nPractice likely recruiter questions\nPrepare three questions to ask\nConfirm interview stages and logistics",
};

const featuredApplications: Application[] = [];

const confirmedSubmissionUpdates: Array<{
  company: string;
  role: string;
  submittedAt: string;
  followUpDate: string;
  link: string;
}> = [];

function reconcileConfirmedSubmission(application: Application): Application {
  const update = confirmedSubmissionUpdates.find((candidate) =>
    application.company.trim().toLowerCase() === candidate.company.toLowerCase()
    && application.role.trim().toLowerCase() === candidate.role.toLowerCase());
  if (!update || ["Interviewing", "Offer", "Rejected", "Closed"].includes(application.status)) return application;

  const cleanedNotes = application.notes
    .replace(/(?:no final submission|final submit (?:was )?not clicked|complete, unsubmitted form)[^.]*(?:\.|$)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const confirmation = `Submission confirmed ${update.submittedAt}; tailored resume package used.`;
  return {
    ...application,
    status: "Applied",
    workbookStatus: "Submitted",
    appliedDate: update.submittedAt,
    followUpDate: application.followUpDate || update.followUpDate,
    link: application.link || update.link,
    nextAction: "Daily morning Gmail status check",
    currentRound: "Application submitted",
    notes: cleanedNotes.includes("Submission confirmed") ? cleanedNotes : `${cleanedNotes}${cleanedNotes ? " " : ""}${confirmation}`,
  };
}

function mergeFeaturedApplications(applications: Application[]) {
  const featuredByKey = new Map(featuredApplications.map((item) => [applicationKey(item), item]));
  const merged = applications.map((item) => {
    const featured = featuredByKey.get(applicationKey(item));
    if (!featured) return item;
    featuredByKey.delete(applicationKey(item));
    return { ...featured, ...item, screeningPrep: item.screeningPrep || featured.screeningPrep };
  });
  return [...merged, ...featuredByKey.values()]
    .map((item) => ({
      ...item,
      id: item.id || `backend-${applicationKey(item).replace(/[^a-z0-9]+/g, "-")}`,
      company: item.company || "Unknown company",
      role: item.role || "Unknown role",
      location: item.location || "",
      status: applicationStatuses.includes(item.status) ? item.status : "Saved",
      appliedDate: item.appliedDate || "",
      followUpDate: item.followUpDate || "",
      salaryMin: item.salaryMin || "",
      salaryMax: item.salaryMax || "",
      source: item.source || "",
      link: item.link || "",
      priority: ["High", "Medium", "Low"].includes(item.priority) ? item.priority : "Medium",
      notes: item.notes || "",
      screeningPrep: item.screeningPrep ? { ...emptyScreeningPrep, ...item.screeningPrep } : undefined,
    } as Application))
    .map(reconcileConfirmedSubmission);
}

const verifiedCapabilities = [
  {
    label: "Frontend product engineering",
    terms: ["react", "typescript", "javascript", "frontend", "front-end", "fullstack", "full stack", "product engineer"],
    evidence: "Candidate-specific evidence must be configured in the private application record.",
  },
  {
    label: "Backend services and APIs",
    terms: ["python", "java", "node", "backend", "back-end", "api", "service", "server"],
    evidence: "Candidate-specific evidence must be configured in the private application record.",
  },
  {
    label: "Applied AI and retrieval",
    terms: ["ai", "machine learning", "ml", "rag", "retrieval", "agent", "llm", "embedding", "vector"],
    evidence: "Candidate-specific evidence must be configured in the private application record.",
  },
  {
    label: "Data systems and quality",
    terms: ["data", "sql", "warehouse", "etl", "analytics", "entity", "quality", "pipeline"],
    evidence: "Candidate-specific evidence must be configured in the private application record.",
  },
  {
    label: "Cloud and integration engineering",
    terms: ["cloud", "aws", "azure", "gcp", "integration", "webhook", "openapi", "mcp", "platform", "infrastructure"],
    evidence: "Candidate-specific evidence must be configured in the private application record.",
  },
  {
    label: "Testing and delivery",
    terms: ["test", "testing", "quality", "uat", "validation", "stakeholder", "reliability", "regulated"],
    evidence: "Candidate-specific evidence must be configured in the private application record.",
  },
] as const;

function applicationEvidenceText(application: Application) {
  const prep = application.screeningPrep || emptyScreeningPrep;
  return [
    application.company,
    application.role,
    application.location,
    application.notes,
    application.source,
    application.approval?.requirements.join(" ") || "",
    application.approval?.gaps.join(" ") || "",
    prep.roleFit,
    prep.companySnapshot,
    prep.technicalStories,
  ].join(" ").toLowerCase();
}

function applicationTrack(application: Application) {
  const text = applicationEvidenceText(application);
  if (/forward deployed|solutions engineer|implementation|customer engineer/.test(text)) return "Forward-deployed / solutions";
  if (/machine learning|\bai\b|rag|llm|agentic|retrieval/.test(text)) return "Applied AI product";
  if (/data engineer|analytics|snowflake|etl|data platform/.test(text)) return "Data engineering";
  if (/frontend|front-end|react|user interface|ui engineer/.test(text)) return "Frontend product";
  if (/backend|back-end|platform engineer|infrastructure|distributed/.test(text)) return "Backend / platform";
  if (/fullstack|full stack|product engineer/.test(text)) return "Full-stack product";
  return "Software product engineering";
}

function roleFitGaps(application: Application, text: string) {
  const source = `${application.screeningPrep?.roleFit || ""} ${application.notes}`;
  const explicit = source.match(/(?:honest gaps|fit gaps(?: recorded)?|missing requirements?|unsupported requirements?|no verified)\s*[:—-]?\s*([^.]*(?:\.[^.]*)?)/i)?.[1]
    ?.replace(/^experience\s*/i, "")
    .trim();
  if (explicit) {
    const gaps = explicit.split(/;|,(?=\s*(?:no |limited |direct |professional |[A-Z][a-z]+\b))/).map((item) => item.trim()).filter(Boolean);
    if (gaps.length) return gaps.slice(0, 5);
  }
  if (/senior|staff|principal|lead/.test(text)) return ["Role seniority may exceed the verified new-grad-to-roughly-two-years target range."];
  if (/fintech|payment|banking|card network/.test(text)) return ["No verified fintech, payments, or card-network ownership."];
  if (/insurance|claims|underwriting/.test(text)) return ["Verify the candidate’s insurance-domain experience before claiming it."];
  return ["The full job description is not stored in this record, so requirement coverage is incomplete until it is added."];
}

function calculateApplicationMatch(application: Application): ApplicationMatch {
  const text = applicationEvidenceText(application);
  const matchedCapabilities = verifiedCapabilities
    .filter((capability) => capability.terms.some((term) => text.includes(term)))
    .map(({ label, evidence }) => ({ label, evidence }));
  const hasDetailedEvidence = (application.screeningPrep?.roleFit?.length || 0) > 80 || application.notes.length > 450;
  const skills = Math.min(96, 56 + matchedCapabilities.length * 6 + (hasDetailedEvidence ? 5 : 0));
  const experience = /principal|staff/.test(text) ? 48 : /senior|lead/.test(text) ? 60 : /junior|new grad|entry|0-2|1-3|2\+/.test(text) ? 94 : 84;
  const location = /san francisco|bay area|san jose|mountain view|u\.s\. remote|us remote|remote.*united states/.test(text) ? 96 : /remote/.test(text) ? 88 : /unknown|location under review/.test(text) ? 66 : 72;
  const domain = /health|clinical|life science/.test(text) ? 93 : /\bai\b|machine learning|rag|llm|retrieval/.test(text) ? 90 : /data|analytics|snowflake|etl/.test(text) ? 88 : /fintech|payment|banking/.test(text) ? 62 : /insurance|claims|underwriting/.test(text) ? 68 : 80;
  const score = Math.round(skills * 0.45 + experience * 0.25 + domain * 0.15 + location * 0.15);
  const confidence: ApplicationMatch["confidence"] = hasDetailedEvidence && matchedCapabilities.length >= 4
    ? "High"
    : matchedCapabilities.length >= 2 || application.notes.length > 140
      ? "Medium"
      : "Low";
  const track = applicationTrack(application);
  const capabilities = matchedCapabilities.length
    ? matchedCapabilities.slice(0, 6)
    : verifiedCapabilities.slice(0, 2).map(({ label, evidence }) => ({ label, evidence }));

  return {
    score,
    confidence,
    track,
    dimensions: [
      { label: "Skills", score: skills },
      { label: "Experience", score: experience },
      { label: "Domain", score: domain },
      { label: "Location", score: location },
    ],
    matchedCapabilities: capabilities,
    gaps: roleFitGaps(application, text),
    rationale: `${track} fit based on the requirements and role evidence stored in Job Hub, mapped only to verified experience from the candidate fact sheet. ${confidence} confidence; add the complete job description and role-fit notes to improve precision.`,
  };
}

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function gapBridgeDetails(application: Application, gap: string, match: ApplicationMatch): GapBridge {
  const normalized = gap.toLowerCase();
  const researchOnly = /full job description|not stored|coverage is incomplete|verify (?:the )?candidate/.test(normalized);
  const preferredCapability = match.matchedCapabilities.find((capability) => {
    const evidence = `${capability.label} ${capability.evidence}`.toLowerCase();
    if (/java|backend|service/.test(normalized)) return /backend|api|service|python|fastapi/.test(evidence);
    if (/guidewire|insurance|p&c|fintech|payment|banking/.test(normalized)) return /regulated|data|api|integration|testing|stakeholder/.test(evidence);
    return true;
  }) || match.matchedCapabilities[0];
  const transferableEvidence = preferredCapability?.evidence || "Use the strongest verified adjacent evidence in this application package.";

  let title = "Unsupported or unverified requirement";
  let rampPlan = "Confirm the team’s exact expectation, study the existing implementation, and deliver one small reviewed change with tests before expanding scope.";
  if (/java/.test(normalized)) {
    title = "Professional Java depth";
    rampPlan = "Learn the team’s Java framework and code conventions, trace one existing service end to end, and ship a small reviewed change with focused tests.";
  } else if (/guidewire|p&c|insurance/.test(normalized)) {
    title = "Industry platform and domain experience";
    rampPlan = "Learn one core domain workflow and its data model with an expert, trace it across the product stack, and own a small tested change in that workflow.";
  } else if (/fintech|payment|banking|card-network/.test(normalized)) {
    title = "Fintech or payments-domain ownership";
    rampPlan = "Learn the product’s money movement and risk boundaries, trace one transaction path, and validate a small change against the team’s correctness and audit controls.";
  } else if (/seniority|senior|staff|principal|lead/.test(normalized)) {
    title = "Seniority and ownership scope";
    rampPlan = "Confirm the expected scope, demonstrate depth on one owned system, and use early design and code reviews to prove readiness before taking broader ownership.";
  } else if (researchOnly) {
    title = "Role evidence is incomplete";
    rampPlan = "Add the complete job description and identify the exact unsupported requirement before generating or rehearsing an answer.";
  }

  const boundary = sentence(gap);
  const spokenBoundary = /^no\s/i.test(gap.trim())
    ? sentence(`I do not yet have direct ${gap.trim().replace(/^no\s+(?:prior\s+|verified\s+)?/i, "")}`)
    : boundary;
  const recruiterQuestion = researchOnly
    ? "Which job requirement is actually unsupported or still unverified?"
    : `For this ${application.role} role, you do not yet have ${title.toLowerCase()}. What transfers, and how would you close that gap?`;
  const talkTrack = researchOnly
    ? "Do not rehearse a gap answer yet. Add the complete job description and identify the exact requirement first."
    : `“That’s a fair concern. ${spokenBoundary} I would not present adjacent experience as direct experience. What does transfer is this: ${sentence(transferableEvidence)} My ramp plan would be concrete: ${sentence(rampPlan)} That gives the team a small, reviewed result early while I build the missing depth.”`;

  return {
    title,
    boundary,
    transferableEvidence: sentence(transferableEvidence),
    rampPlan: sentence(rampPlan),
    recruiterQuestion,
    talkTrack,
    rehearsalReady: !researchOnly,
  };
}

function hiringManagerSearch(application: Application) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${application.company} hiring manager engineering ${application.role}`)}`;
}

function outreachMessage(application: Application) {
  const match = calculateApplicationMatch(application);
  const proof = match.matchedCapabilities.slice(0, 2).map((item) => item.label.toLowerCase()).join(" and ");
  return `Hi — I’m interested in the ${application.role} role at ${application.company}. My background in ${proof} looks especially relevant to this team. I’d appreciate the chance to learn what you value most in this hire.`;
}

function salaryPlan(application: Application) {
  const minimum = Number(application.salaryMin) || 0;
  const maximum = Number(application.salaryMax) || minimum;
  const target = minimum && maximum ? Math.round((minimum + (maximum - minimum) * 0.65) / 1000) * 1000 : 0;
  return { minimum, maximum, target };
}

function interviewStages(application: Application) {
  const prep = application.screeningPrep || emptyScreeningPrep;
  const fallback = [
    "Application review — resume and basic eligibility",
    "Recruiter screen — motivation, logistics, authorization, and compensation",
    "Technical assessment — coding, debugging, or take-home exercise",
    "Hiring-manager screen — role fit, project depth, and team expectations",
    "Technical loop — implementation, system design, and collaboration",
    "Final conversation / decision — values, scope, references, and offer",
  ];
  const source = prep.fullPipelinePlan.trim()
    ? prep.fullPipelinePlan.split("\n").map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean)
    : fallback;
  const preparation = prep.preparationPlan.split("\n").map((line) => line.trim()).filter(Boolean);
  const completed = application.status === "Offer"
    ? source.length
    : Math.max(application.completedRounds || 0, ["Applied", "Interviewing"].includes(application.status) ? 1 : 0);
  return source.map((line, index) => {
    const [title, ...detailParts] = line.split(/\s+[—–-]\s+/);
    const state = index < completed ? "Completed" : index === completed ? "Current" : "Upcoming";
    return {
      title: title || `Stage ${index + 1}`,
      detail: detailParts.join(" — ") || line,
      state,
      prep: preparation[index] || (index === completed ? prep.predictedNextStep || "Confirm the format, interviewer, and evaluation criteria." : "Prepare once the recruiter confirms this stage."),
      confirmed: /\bconfirmed\b|\bscheduled\b|\bvoicemail\b|inbound recruiter contact/i.test(line) || index < completed,
    };
  });
}

function hasConfirmedInterview(application: Application) {
  if (["Interviewing", "Offer"].includes(application.status)) return true;
  const signal = [
    application.currentRound,
    application.latestEmailSubject,
    application.screeningPrep?.mailboxSignal,
    application.screeningPrep?.interviewProcess,
  ].filter(Boolean).join(" ").toLowerCase();
  return /interview (?:is )?confirmed|interview scheduled|scheduled (?:recruiter|technical|hiring|manager|screen)|invited to (?:an )?(?:interview|assessment)/.test(signal);
}

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
  ].some((value) => typeof value === "string" && value.trim());
}

function normalizeLanguage(language?: string) {
  if (!language || language === "Python") return "Python 3";
  return language;
}

function languageBadge(language: string) {
  const badges: Record<string, string> = {
    "Python 3": "Py",
    TypeScript: "TS",
    JavaScript: "JS",
    Java: "Jv",
    "C++": "C+",
    "C#": "C#",
    Go: "Go",
    Rust: "Rs",
    Swift: "Sw",
    Kotlin: "Kt",
  };
  return badges[normalizeLanguage(language)] ?? "</>";
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
  };
  return labels[value] || value;
}

function scoreCategories(breakdown: NonNullable<CodeReview["scoreBreakdown"]>) {
  return [
    { label: "Code correctness", weight: "40%", score: breakdown.codeCorrectness },
    { label: "Approach & reasoning", weight: "20%", score: breakdown.approachReasoning },
    { label: "Complexity analysis", weight: "10%", score: breakdown.complexityAnalysis },
    { label: "Edge-case coverage", weight: "10%", score: breakdown.edgeCaseCoverage },
    { label: "Reasoning clarity", weight: "20%", score: breakdown.explanationQuality },
  ];
}

function formatSheetDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
}

function journalSheetRow(problem: InterviewProblem, item: ProblemProgress) {
  const review = item.codeReview;
  const totalSeconds = item.totalSeconds || item.minutes * 60;
  return {
    "Sync Key": String(problem.id),
    "Problem ID": problem.id,
    "Problem": problem.title,
    "Day": problem.day,
    "Week": problem.week,
    "Pattern": problem.pattern,
    "Difficulty": problem.difficulty,
    "Status": item.status,
    "Confidence": item.confidence,
    "Total Seconds": totalSeconds,
    "Time (HH:MM:SS)": formatSheetDuration(totalSeconds),
    "Independence Score": independenceScore(item),
    "Final Score": review?.score ?? "",
    "Verdict": review?.verdict ?? "",
    "Code Correctness": review?.scoreBreakdown?.codeCorrectness ?? "",
    "Approach & Reasoning": review?.scoreBreakdown?.approachReasoning ?? "",
    "Complexity Analysis": review?.scoreBreakdown?.complexityAnalysis ?? "",
    "Edge-Case Coverage": review?.scoreBreakdown?.edgeCaseCoverage ?? "",
    "Reasoning Clarity": review?.scoreBreakdown?.explanationQuality ?? "",
    "Missing Inputs": review?.inputCoverage?.missing.map(formatCoverageLabel).join("\n") ?? "",
    "Issues to Fix": review?.issues.map((issue) => `${issue.severity}: ${issue.title} — ${issue.fix}`).join("\n") ?? "",
    "Next Action": review?.nextAction ?? "",
    "Review Summary": review?.summary ?? "",
    "Last Attempt": item.lastAttempt,
    "Reviewed At": review?.reviewedAt ?? "",
    "Language": normalizeLanguage(item.codeLanguage),
    "Code": item.code,
    "Brute-Force Approach": item.naiveApproach,
    "Brute-Force Time": item.bruteForceTimeComplexity,
    "Brute-Force Space": item.bruteForceSpaceComplexity,
    "Invariant / Decision Rule": item.invariant,
    "Optimal Steps": item.solutionSteps,
    "Optimal Time": item.optimalTimeComplexity || item.complexity || "",
    "Optimal Space": item.optimalSpaceComplexity,
    "Edge Cases & Tests": item.edgeCases,
    "Mistakes / Bug Cause": item.mistakes,
    "Hints Used": item.hintsUsed.join("\n"),
    "Last Synced": new Date().toISOString(),
  };
}

function buildDailyCoaching(progress: Record<string, ProblemProgress>) {
  const recent = Object.entries(progress)
    .flatMap(([problemId, item]) => {
      const problem = interviewPlan.find((candidate) => String(candidate.id) === problemId);
      return problem && item.codeReview ? [{ problem, item, review: item.codeReview }] : [];
    })
    .sort((a, b) => b.review.reviewedAt.localeCompare(a.review.reviewedAt))
    .slice(0, 3);

  if (!recent.length) return null;

  const missingCounts = new Map<string, number>();
  recent.forEach(({ review }) =>
    review.inputCoverage?.missing.forEach((item) =>
      missingCounts.set(item, (missingCounts.get(item) ?? 0) + 1),
    ),
  );
  const missing = [...missingCounts.entries()]
    .sort((a, b) => b[1] - a[1] || formatCoverageLabel(a[0]).localeCompare(formatCoverageLabel(b[0])))
    .slice(0, 3)
    .map(([item, count]) => ({ label: formatCoverageLabel(item), count }));

  const categoryAverages = [
    ["Code correctness", "codeCorrectness"],
    ["Approach & reasoning", "approachReasoning"],
    ["Complexity analysis", "complexityAnalysis"],
    ["Edge-case coverage", "edgeCaseCoverage"],
    ["Reasoning clarity", "explanationQuality"],
  ].flatMap(([label, key]) => {
    const scores = recent.flatMap(({ review }) => {
      const breakdown = review.scoreBreakdown;
      return breakdown ? [breakdown[key as keyof typeof breakdown]] : [];
    });
    return scores.length
      ? [{ label, score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) }]
      : [];
  });
  categoryAverages.sort((a, b) => a.score - b.score);

  const severityRank = { Critical: 0, Important: 1, Minor: 2 };
  const issue = recent
    .flatMap(({ review }) => review.issues)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])[0];
  const latest = recent[0];
  const averageScore = Math.round(
    recent.reduce((sum, entry) => sum + entry.review.score, 0) / recent.length,
  );

  return {
    recentCount: recent.length,
    problemNames: recent.map(({ problem }) => problem.title),
    missing,
    lowestCategory: categoryAverages[0] ?? null,
    averageScore,
    nextAction: issue?.fix || latest.review.nextAction || latest.review.interviewFeedback.improve,
  };
}

function JournalField({
  id,
  label,
  generateHint,
  className = "",
  penalizeHint = false,
  onHintShown,
  children,
}: {
  id: string;
  label: string;
  generateHint?: () => Promise<string>;
  className?: string;
  penalizeHint?: boolean;
  onHintShown?: () => void;
  children: ReactNode;
}) {
  const [showHint, setShowHint] = useState(false);
  const [generatedHint, setGeneratedHint] = useState("");
  const [hintError, setHintError] = useState("");
  const [hintLoading, setHintLoading] = useState(false);
  const hintId = `${id}-hint`;
  const toggleHint = async () => {
    if (showHint) {
      setShowHint(false);
      return;
    }
    if (generatedHint) {
      setShowHint(true);
      return;
    }
    if (!generateHint || hintLoading) return;
    setHintLoading(true);
    setHintError("");
    try {
      const nextHint = await generateHint();
      setGeneratedHint(nextHint);
      setShowHint(true);
      if (penalizeHint) onHintShown?.();
    } catch (error) {
      setHintError(error instanceof Error ? error.message : "The AI hint could not be generated.");
    } finally {
      setHintLoading(false);
    }
  };
  return (
    <div className={`journal-field ${className}`}>
      <div className="journal-field-heading">
        <label htmlFor={id}>{label}</label>
        {generateHint && <button type="button" className="journal-hint-button" disabled={hintLoading} aria-expanded={showHint} aria-controls={hintId} onClick={() => void toggleHint()}>{hintLoading ? "Generating…" : showHint ? "Hide AI hint" : `Generate AI hint${penalizeHint ? ` · −${HINT_PENALTY}` : ""}`}</button>}
      </div>
      {showHint && generatedHint && <p className="journal-hint" id={hintId}><b>AI hint</b>{generatedHint}</p>}
      {hintError && <p className="journal-hint-error" role="alert">{hintError}</p>}
      {children}
    </div>
  );
}

function getProblemHintContext(problem: InterviewProblem) {
  const pattern = problem.pattern.toLowerCase();
  if (problem.id === 242) return {
    strategy: "a frequency table that records how many copies of each character are still needed",
    bruteForce: "the literal brute force scans for one unused matching character in the other string for every character, which is O(n²). Sorting both strings and comparing them is also a valid baseline, but it improves that to O(n log n)",
    state: "each count equals occurrences in s minus occurrences consumed from the processed prefix of t, and no count may fall below zero",
    operation: "the two string passes and constant-time expected dictionary updates",
    tests: "different lengths, repeated letters, the same letters in different orders, and one mismatched character",
    failure: "calling max on an empty count map, forgetting the length mismatch, or allowing a character count to go below zero",
    code: "check the lengths first, increment counts from s, reject any unavailable character from t, and return true after every character is consumed",
  };
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
    bruteForceApproach: `${problem.title}: ${context.bruteForce}. Then state when that baseline finds the answer.`,
    bruteForceTime: problem.id === 242
      ? "Literal repeated matching is O(n²). Your sorting baseline is O(n log n), not O(log n), because sorting n characters dominates the final comparison."
      : `For ${problem.title}, count the exhaustive candidates or repeated work before applying the insight ${cue}`,
    bruteForceSpace: problem.id === 242
      ? "In Python, sorted(s) and sorted(t) create new lists, so the sorting baseline uses O(n) auxiliary space for equal-length strings—not O(1)."
      : `For the baseline ${problem.title} solution, count only auxiliary storage and recursion; name what grows with the input.`,
    invariant: `For ${problem.title}, write three sentences: (1) “Before each step, ${context.state} represents ___.” (2) “That means I can safely make this decision because ___.” (3) “After I update the state, the same statement is still true because ___.” Connect every blank to ${cue}. An invariant is not just what your data structure stores—it is the promise that stays true before and after every loop or recursive call and proves you never discard a valid answer.`,
    optimalSteps: `Build the ${problem.title} procedure around ${context.strategy}. Write the initialization, repeated decision, update, and return in order.`,
    optimalTime: `For this ${problem.pattern} solution, justify time using ${context.operation}; do not give Big-O without the reason.`,
    optimalSpace: `Name every growing structure used for ${context.state}, then give the largest auxiliary-space term.`,
    edgeCases: `For ${problem.title}, test ${context.tests}. Include concrete input and expected output for each.`,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDateFromTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : toISODate(date);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function usesDailyMailboxChecks(application: Application) {
  return ["Applied", "Interviewing", "Offer"].includes(application.status);
}

function mailboxNextCheckLabel(application: Application) {
  return usesDailyMailboxChecks(application) ? "Next mailbox check: tomorrow morning" : "";
}

function recruiterOutreachPlan(application: Application, today: string) {
  if (application.status !== "Applied" || !application.appliedDate) return null;
  const submitted = application.appliedDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!submitted) return null;
  const earliest = addDays(submitted, RECRUITER_OUTREACH_WAIT_DAYS);
  return {
    earliest,
    ready: today >= earliest,
    label: today >= earliest
      ? "Recruiter outreach can be considered now"
      : `Recruiter outreach: wait until ${formatHumanDate(earliest)}`,
  };
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function calculateFunnelDiagnosis(applications: Application[]): FunnelDiagnosis {
  const submitted = applications
    .filter((application) => Boolean(application.appliedDate) && !["Saved", "Preparing"].includes(application.status))
    .sort((a, b) => b.appliedDate.localeCompare(a.appliedDate))
    .slice(0, 100);

  const stages = submitted.map((application) => {
    const confirmedEvidence = [
      application.currentRound,
      application.latestEmailSubject,
      application.latestEmail,
      application.workbookStatus,
    ].filter(Boolean).join(" ").toLowerCase();
    const completedRounds = Math.max(0, Number(application.completedRounds) || 0);
    const offer = application.status === "Offer";
    const finalRound = offer || completedRounds >= 3 || /\b(final|onsite|on-site|panel|interview loop|executive)\b/.test(confirmedEvidence);
    const technicalRound = finalRound || completedRounds >= 2 || /\b(technical|coding|assessment|take-home|pair programming|system design|hiring manager)\b/.test(confirmedEvidence);
    const screen = technicalRound || completedRounds >= 1 || ["Interviewing", "Offer"].includes(application.status) || /\b(recruiter|phone screen|initial screen)\b/.test(confirmedEvidence);
    return { screen, technicalRound, finalRound, offer };
  });

  const sampleSize = submitted.length;
  const screens = stages.filter((stage) => stage.screen).length;
  const technicalRounds = stages.filter((stage) => stage.technicalRound).length;
  const finalRounds = stages.filter((stage) => stage.finalRound).length;
  const offers = stages.filter((stage) => stage.offer).length;
  const metrics = {
    sampleSize,
    screens,
    technicalRounds,
    finalRounds,
    offers,
    screenRate: percent(screens, sampleSize),
    technicalRate: percent(technicalRounds, screens),
    finalRate: percent(finalRounds, technicalRounds),
    offerRate: percent(offers, finalRounds),
  };

  if (finalRounds >= 3 && offers === 0) {
    return {
      ...metrics,
      key: "closing",
      title: "Strengthen behavioral answers and closing",
      summary: `${finalRounds} confirmed final-round pipelines have produced no offer yet. The bottleneck is now after technical validation, not application volume.`,
      action: "Tighten leadership and conflict stories, role motivation, reference readiness, compensation alignment, and the final close for why this team should choose you.",
      confidence: "Evidence-backed",
    };
  }

  if (technicalRounds >= 3 && finalRounds === 0) {
    return {
      ...metrics,
      key: "technical",
      title: "Increase coding and technical-round preparation",
      summary: `${technicalRounds} technical rounds have produced no final-round advancement. Resume changes are no longer the primary lever.`,
      action: "Prioritize timed coding, debugging aloud, API and system-design explanations, and post-round review of the exact failure pattern.",
      confidence: "Evidence-backed",
    };
  }

  if (screens >= 5 && technicalRounds === 0) {
    return {
      ...metrics,
      key: "narrative",
      title: "Fix the professional narrative",
      summary: `${screens} recruiter screens have produced no technical-round advancement. The resume is opening doors, but the screen story is not converting.`,
      action: "Rehearse the 60-second introduction, career-transition narrative, role motivation, strongest technical evidence, level fit, and concise answers to logistics and compensation.",
      confidence: "Evidence-backed",
    };
  }

  if (sampleSize >= 100 && screens < 5) {
    return {
      ...metrics,
      key: "targeting",
      title: "Fix resume positioning and targeting",
      summary: `The latest 100 confirmed applications produced ${screens} recruiter screen${screens === 1 ? "" : "s"}. That is below the five-screen evidence threshold.`,
      action: "Narrow role selection, compare submitted resumes against repeated job requirements, strengthen the first-page evidence, and stop spending applications on weak-fit titles.",
      confidence: "Evidence-backed",
    };
  }

  const downstreamProgress = technicalRounds > 0 || finalRounds > 0 || offers > 0;
  if (screens >= 5 && downstreamProgress) {
    return {
      ...metrics,
      key: "healthy",
      title: "Consistent progress—keep running the system",
      summary: `${screens} screens have produced ${technicalRounds} technical round${technicalRounds === 1 ? "" : "s"}, ${finalRounds} final round${finalRounds === 1 ? "" : "s"}, and ${offers} offer${offers === 1 ? "" : "s"}.`,
      action: "Keep the current targeting and application mix. Improve only the weakest measured conversion instead of rebuilding the whole system.",
      confidence: "Evidence-backed",
    };
  }

  return {
    ...metrics,
    key: "insufficient",
    title: "Keep collecting evidence",
    summary: `${sampleSize} of 100 submitted applications are available for the primary screen-rate diagnosis. Later-stage evidence has not repeated enough to support a hard conclusion.`,
    action: "Keep the current system stable, prepare seriously for every live screen, and avoid changing the resume or targeting based on a handful of outcomes.",
    confidence: "Early signal",
  };
}

function dayDifference(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`).getTime();
  const endDate = new Date(`${end}T12:00:00`).getTime();
  return Math.floor((endDate - startDate) / 86_400_000);
}

function formatHumanDate(dateString: string) {
  if (!dateString) return "Not set";
  const value = dateString.trim();
  const datePrefix = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let date: Date;

  if (datePrefix) {
    date = new Date(
      Number(datePrefix[1]),
      Number(datePrefix[2]) - 1,
      Number(datePrefix[3]),
      12,
    );
  } else if (/^\d+(?:\.\d+)?$/.test(value)) {
    // Spreadsheet imports can contain Excel serial dates instead of ISO dates.
    const utcDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86_400_000);
    date = new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), 12);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    date,
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
    second: "2-digit",
  }).format(date);
}

function applicationKey(application: Pick<Application, "company" | "role">) {
  return `${application.company}::${application.role}`.trim().toLowerCase();
}

function followUpInputFingerprint(application: Application, prep: CompanyScreeningPrep) {
  const source = JSON.stringify([
    application.company,
    application.role,
    application.link,
    application.location,
    application.currentRound,
    application.latestEmailSubject,
    application.approval?.requirements || [],
    prep.companySnapshot,
    prep.roleFit,
    prep.technicalStories,
    prep.interviewProcess,
    prep.risksAndBoundaries,
  ]);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `career-followups-${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
    screeningPrep: { ...emptyScreeningPrep },
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
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`
    : `${pad(minutes)}:${pad(remainingSeconds)}`;
}

export default function JobHub() {
  const today = toISODate();
  const [view, setView] = useState<View>("overview");
  const [ready, setReady] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [progress, setProgress] = useState<Record<string, ProblemProgress>>({});
  const [settings, setSettings] = useState<Settings>({ startDate: today, primaryLanguage: "Python 3", weeklyGoal: 7 });
  const [applicationDraft, setApplicationDraft] = useState<Application | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [applicationWorkspaceTab, setApplicationWorkspaceTab] = useState<ApplicationWorkspaceTab>("overview");
  const [selectedProblem, setSelectedProblem] = useState<InterviewProblem | null>(null);
  const [problemDraft, setProblemDraft] = useState<ProblemProgress>(emptyProgress);
  const [applicationSearch, setApplicationSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ApplicationStatus>("All");
  const [applicationSort, setApplicationSort] = useState<{ key: ApplicationSortKey; direction: SortDirection }>({ key: "next", direction: "asc" });
  const [prepWeek, setPrepWeek] = useState(1);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerProblemId, setTimerProblemId] = useState<number | null>(null);
  const [focusDayOffset, setFocusDayOffset] = useState(0);
  const [focusSlideDirection, setFocusSlideDirection] = useState<"forward" | "back">("forward");
  const [reviewRunning, setReviewRunning] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [approvalBusyId, setApprovalBusyId] = useState("");
  const [followUpRunningId, setFollowUpRunningId] = useState("");
  const [followUpError, setFollowUpError] = useState("");
  const [localJournalBackup, setLocalJournalBackup] = useState<LocalJournalBackupState>({
    status: "ready",
    message: "Every journal save is synced to your private Sites database.",
    rowCount: 0,
    jsonPath: "private-data/job-hub-journals.json",
    csvPath: "private-data/job-hub-journals.csv",
    xlsxPath: "private-data/Job_Hub_LeetCode_Journal.xlsx",
  });
  const [journalSync, setJournalSync] = useState<JournalSyncState>({ status: "idle", pending: 0, message: "" });
  const [agentBaseUrl, setAgentBaseUrl] = useState("");
  const [agentPrivateRoot, setAgentPrivateRoot] = useState(DEFAULT_PRIVATE_ROOT);
  const [agentToken, setAgentToken] = useState("");
  const [agentTokenVisible, setAgentTokenVisible] = useState(false);
  const [agentConnection, setAgentConnection] = useState<{ status: "idle" | "checking" | "verified" | "error"; message: string }>({
    status: "idle",
    message: "Enter this deployment's runtime token to verify read-only agent access.",
  });
  const [toast, setToast] = useState("");
  const [liveSyncConnected, setLiveSyncConnected] = useState(false);
  const [sheetSync, setSheetSync] = useState<SheetSyncState>({
    status: "connecting",
    workbook: "",
    modifiedAt: "",
    checkedAt: "",
    rowCount: 0,
    message: "Connecting to the project tracker…",
  });
  const [discoveryDashboard, setDiscoveryDashboard] = useState<DiscoveryDashboard>({
    status: "loading",
    sources: [],
    leads: [],
    runs: [],
    updatedAt: "",
    message: "Loading source coverage…",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localBackupHydratedRef = useRef(false);
  const backendHydratedRef = useRef(false);
  const backendRevisionRef = useRef("");
  const pendingJournalIdsRef = useRef(new Set<string>());
  const localJournalQueueRef = useRef(new Map<string, { problem: InterviewProblem; item: ProblemProgress }>());
  const localJournalQueueTimerRef = useRef<number | null>(null);
  const localJournalQueueActiveRef = useRef(false);

  async function refreshDiscovery() {
    setDiscoveryDashboard((current) => ({ ...current, status: "loading", message: "Refreshing source coverage…" }));
    try {
      const response = await fetch("/api/discovery", { cache: "no-store" });
      if (!response.ok) throw new Error("Discovery backend is unavailable.");
      const dashboard = await response.json() as Partial<DiscoveryDashboard>;
      setDiscoveryDashboard({
        status: "connected",
        sources: Array.isArray(dashboard.sources) ? dashboard.sources : [],
        leads: Array.isArray(dashboard.leads) ? dashboard.leads : [],
        runs: Array.isArray(dashboard.runs) ? dashboard.runs : [],
        updatedAt: typeof dashboard.updatedAt === "string" ? dashboard.updatedAt : "",
        message: "Source scans and lead decisions are writing directly to the Job Hub backend.",
      });
    } catch {
      setDiscoveryDashboard((current) => ({ ...current, status: "error", message: "Source coverage could not be loaded. Application tracking is unaffected." }));
    }
  }

  useEffect(() => {
    void refreshDiscovery();
    // The source dashboard has its own backend revision and refresh lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let preferences: { baseUrl?: string; privateRoot?: string } = {};
    try {
      preferences = JSON.parse(localStorage.getItem(AGENT_PREFERENCES_KEY) || "{}");
    } catch {
      preferences = {};
    }
    setAgentBaseUrl(preferences.baseUrl || window.location.origin);
    setAgentPrivateRoot(preferences.privateRoot || DEFAULT_PRIVATE_ROOT);
    setAgentToken(sessionStorage.getItem(AGENT_TOKEN_SESSION_KEY) || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const localToday = toISODate();
      const storedApplications = localStorage.getItem(APPLICATIONS_KEY);
      const storedProgress = localStorage.getItem(PROGRESS_KEY);
      const storedSettings = localStorage.getItem(SETTINGS_KEY);
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("Backend state is unavailable.");
        const backend = await response.json();
        if (cancelled) return;
        const backendApplications = Array.isArray(backend.applications) ? backend.applications as Application[] : [];
        setApplications(mergeFeaturedApplications(backendApplications));
        const savedProgress = (backend.progress && typeof backend.progress === "object"
          ? backend.progress
          : storedProgress ? JSON.parse(storedProgress) : {}) as Record<string, Partial<ProblemProgress>>;
        setProgress(Object.fromEntries(Object.entries(savedProgress).map(([id, item]) => [id, normalizeStoredProgress(item)])));
        const savedSettings = (backend.settings && typeof backend.settings === "object"
          ? backend.settings
          : storedSettings ? JSON.parse(storedSettings) : { startDate: localToday, primaryLanguage: "Python 3", weeklyGoal: 7 }) as Settings;
        setSettings({ ...savedSettings, primaryLanguage: normalizeLanguage(savedSettings.primaryLanguage) });
        backendRevisionRef.current = typeof backend.updatedAt === "string" ? backend.updatedAt : "";
        setSheetSync({ status: "connected", workbook: "Sites database", modifiedAt: backend.updatedAt ?? "", checkedAt: new Date().toISOString(), rowCount: backendApplications.length, message: "Applications and prep are synced across your devices." });
      } catch {
        setApplications(mergeFeaturedApplications(storedApplications ? JSON.parse(storedApplications) : makeDemoApplications(localToday)));
        if (storedProgress) {
          const savedProgress = JSON.parse(storedProgress) as Record<string, Partial<ProblemProgress>>;
          setProgress(Object.fromEntries(Object.entries(savedProgress).map(([id, item]) => [id, normalizeStoredProgress(item)])));
        }
        if (storedSettings) setSettings(JSON.parse(storedSettings));
        setSheetSync((current) => ({ ...current, status: "error", message: "Backend sync is temporarily unavailable; this browser copy is still safe." }));
      }
      backendHydratedRef.current = true;
      setReady(true);
    };
    void hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(applications));
  }, [applications, ready]);

  useEffect(() => {
    if (!ready || !backendHydratedRef.current) return;
    const timeout = window.setTimeout(async () => {
      const journalIdsAtStart = new Set(pendingJournalIdsRef.current);
      if (journalIdsAtStart.size) setJournalSync({ status: "saving", pending: journalIdsAtStart.size, message: `Saving ${journalIdsAtStart.size} question${journalIdsAtStart.size === 1 ? "" : "s"} in the background…` });
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applications, progress, settings, baseUpdatedAt: backendRevisionRef.current }),
        });
        if (response.status === 409) {
          const conflict = await response.json();
          if (Array.isArray(conflict.applications)) setApplications(mergeFeaturedApplications(conflict.applications));
          if (conflict.progress && typeof conflict.progress === "object") {
            const pendingProgress = Object.fromEntries([...pendingJournalIdsRef.current]
              .filter((id) => progress[id])
              .map((id) => [id, progress[id]]));
            setProgress({ ...conflict.progress, ...pendingProgress });
          }
          if (conflict.settings && typeof conflict.settings === "object") setSettings(conflict.settings);
          backendRevisionRef.current = typeof conflict.updatedAt === "string" ? conflict.updatedAt : backendRevisionRef.current;
          setLiveSyncConnected(true);
          setSheetSync((current) => ({ ...current, status: "connected", checkedAt: new Date().toISOString(), message: "A newer backend update was loaded." }));
          if (pendingJournalIdsRef.current.size) setJournalSync({ status: "queued", pending: pendingJournalIdsRef.current.size, message: "Newer backend data was merged. Your queued questions are retrying automatically." });
          return;
        }
        if (!response.ok) throw new Error("Backend save failed");
        const saved = await response.json();
        backendRevisionRef.current = typeof saved.updatedAt === "string" ? saved.updatedAt : backendRevisionRef.current;
        if (journalIdsAtStart.size) {
          journalIdsAtStart.forEach((id) => pendingJournalIdsRef.current.delete(id));
          setJournalSync(pendingJournalIdsRef.current.size
            ? { status: "queued", pending: pendingJournalIdsRef.current.size, message: `${pendingJournalIdsRef.current.size} newer question${pendingJournalIdsRef.current.size === 1 ? " is" : "s are"} still queued.` }
            : { status: "saved", pending: 0, message: `${journalIdsAtStart.size} question${journalIdsAtStart.size === 1 ? "" : "s"} saved. Keep working.` });
        }
        setLiveSyncConnected(true);
        setSheetSync((current) => ({ ...current, status: "connected", workbook: "Sites database", checkedAt: new Date().toISOString(), rowCount: applications.length, message: "Applications and prep are synced across your devices." }));
      } catch {
        setLiveSyncConnected(false);
        setSheetSync((current) => ({ ...current, status: "error", message: "Backend sync needs attention; this browser copy is still safe." }));
        if (pendingJournalIdsRef.current.size) setJournalSync({ status: "error", pending: pendingJournalIdsRef.current.size, message: "Questions remain safely queued in this browser. The next edit will retry the backend." });
      }
    }, BACKEND_SYNC_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [applications, progress, ready, settings]);

  useEffect(() => {
    if (journalSync.status !== "saved") return;
    const timeout = window.setTimeout(() => setJournalSync({ status: "idle", pending: 0, message: "" }), 2200);
    return () => window.clearTimeout(timeout);
  }, [journalSync.status]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }, [progress, ready]);

  useEffect(() => {
    if (!ready || localBackupHydratedRef.current) return;
    if (!canUseLocalJournalBackup()) {
      localBackupHydratedRef.current = true;
      return;
    }
    const entries = Object.entries(progress).flatMap(([problemId, item]) => {
      const problem = interviewPlan.find((candidate) => String(candidate.id) === problemId);
      return problem ? [{ problem, item }] : [];
    });
    if (!entries.length) return;
    void backupJournalRowsLocally(entries).then((saved) => {
      if (saved) localBackupHydratedRef.current = true;
    });
    // This is a one-time hydration pass; later saves call the backup directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const earliestUnsolvedIndex = interviewPlan.findIndex((problem) => {
    const status = progress[String(problem.id)]?.status ?? "Not Started";
    return !["Solved with Hint", "Solved Independently"].includes(status);
  });
  const focusAnchorIndex = earliestUnsolvedIndex === -1 ? LAST_PLAN_INDEX : earliestUnsolvedIndex;

  const filteredApplications = useMemo(() => {
    const query = applicationSearch.toLowerCase().trim();
    const filtered = applications.filter((application) => {
      const matchesStatus = statusFilter === "All" || application.status === statusFilter;
      const matchesQuery =
        !query ||
        `${application.company} ${application.role} ${application.location} ${application.notes} ${application.nextAction ?? ""} ${application.latestEmailSubject ?? ""}`
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesQuery;
    });
    const statusRank: Record<ApplicationStatus, number> = { Saved: 0, Preparing: 1, Applied: 2, Interviewing: 3, Offer: 4, Rejected: 5, Closed: 6 };
    const priorityRank = { High: 3, Medium: 2, Low: 1 };
    const valueFor = (application: Application) => {
      switch (applicationSort.key) {
        case "company": return `${application.company} ${application.role}`.toLowerCase();
        case "status": return statusRank[application.status];
        case "next": return usesDailyMailboxChecks(application) ? "0000-00-00" : application.followUpDate || application.screeningPrep?.expectedNextInterviewDate || "9999-12-31";
        case "compensation": return Number(application.salaryMax || application.salaryMin) || -1;
        case "priority": return priorityRank[application.priority];
        case "match": return calculateApplicationMatch(application).score;
      }
    };
    return [...filtered].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue));
      return comparison * (applicationSort.direction === "asc" ? 1 : -1);
    });
  }, [applicationSearch, applications, applicationSort, statusFilter]);

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
  const totalPrepSeconds = Object.values(progress).reduce(
    (sum, item) => sum + (item.totalSeconds || (item.minutes || 0) * 60),
    0,
  );
  const interviewCount = applications.filter((item) => item.status === "Interviewing").length;
  const appliedCount = applications.filter((item) => ["Applied", "Interviewing", "Offer"].includes(item.status)).length;
  const offerCount = applications.filter((item) => item.status === "Offer").length;
  const activeApplications = applications.filter((item) => !["Rejected", "Closed"].includes(item.status));
  const dailyCoaching = useMemo(() => buildDailyCoaching(progress), [progress]);
  const funnelDiagnosis = useMemo(() => calculateFunnelDiagnosis(applications), [applications]);

  function showToast(message: string) {
    setToast(message);
  }

  function saveAgentPreferences(baseUrl: string, privateRoot: string) {
    localStorage.setItem(AGENT_PREFERENCES_KEY, JSON.stringify({ baseUrl, privateRoot }));
  }

  function updateAgentBaseUrl(value: string) {
    setAgentBaseUrl(value);
    saveAgentPreferences(value, agentPrivateRoot);
    setAgentConnection({ status: "idle", message: "Connection changed. Verify read-only access again." });
  }

  function updateAgentPrivateRoot(value: string) {
    setAgentPrivateRoot(value);
    saveAgentPreferences(agentBaseUrl, value);
  }

  function updateAgentToken(value: string) {
    setAgentToken(value);
    if (value) sessionStorage.setItem(AGENT_TOKEN_SESSION_KEY, value);
    else sessionStorage.removeItem(AGENT_TOKEN_SESSION_KEY);
    setAgentConnection({ status: "idle", message: "Token changed. Verify read-only access again." });
  }

  async function verifyAgentAccess() {
    const baseUrl = normalizeAgentBaseUrl(agentBaseUrl);
    if (!isAllowedAgentBaseUrl(baseUrl) || !agentToken.trim()) return;
    setAgentConnection({ status: "checking", message: "Checking GET /api/state with this tab's token…" });
    try {
      const response = await fetch(`${baseUrl}/api/state`, {
        cache: "no-store",
        headers: { "OAI-Sites-Authorization": `Bearer ${agentToken.trim()}` },
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Token rejected or expired." : `Backend returned ${response.status}.`);
      await response.json();
      setAgentConnection({ status: "verified", message: "Read-only agent access verified. The token remains in this browser tab only." });
    } catch (error) {
      setAgentConnection({ status: "error", message: error instanceof Error ? error.message : "Agent access could not be verified." });
    }
  }

  async function copyAgentRuntimeSetup() {
    await navigator.clipboard.writeText(buildSafeRuntimeSetup({ baseUrl: agentBaseUrl, privateRoot: agentPrivateRoot }));
    showToast("Safe terminal setup copied · token is prompted separately");
  }

  async function copyCodexGuide() {
    await navigator.clipboard.writeText(buildCodexGuide({ baseUrl: agentBaseUrl, privateRoot: agentPrivateRoot }));
    showToast("Codex setup guide copied");
  }

  function downloadCodexGuide() {
    const blob = new Blob([buildCodexGuide({ baseUrl: agentBaseUrl, privateRoot: agentPrivateRoot })], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "AGENTS.md";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Credential-free AGENTS.md downloaded");
  }

  function clearAgentToken() {
    sessionStorage.removeItem(AGENT_TOKEN_SESSION_KEY);
    setAgentToken("");
    setAgentTokenVisible(false);
    setAgentConnection({ status: "idle", message: "Token cleared from this browser tab." });
  }

  async function reviewApplicationPackage(application: Application, decision: "APPROVED" | "APPROVAL_REJECTED") {
    const approval = application.approval;
    if (!approval || !["Pending", "Blocked"].includes(approval.status) || approvalBusyId) return;
    setApprovalBusyId(approval.id);
    try {
      const response = await fetch("/api/application-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: decision,
          idempotencyKey: `${approval.id}:${decision.toLowerCase()}:v1`,
          packageId: approval.id,
          applicationId: application.id,
          company: application.company,
          role: application.role,
          recordedAt: new Date().toISOString(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The review decision could not be saved.");
      const stateResponse = await fetch("/api/state", { cache: "no-store" });
      if (!stateResponse.ok) throw new Error("The decision saved, but the refreshed queue could not be loaded.");
      const state = await stateResponse.json();
      const backendApplications = Array.isArray(state.applications) ? state.applications as Application[] : [];
      setApplications(mergeFeaturedApplications(backendApplications));
      backendRevisionRef.current = typeof state.updatedAt === "string" ? state.updatedAt : backendRevisionRef.current;
      setSheetSync((current) => ({ ...current, status: "connected", checkedAt: new Date().toISOString(), rowCount: backendApplications.length, message: "Exception queue synced directly to the Job Hub backend." }));
      showToast(decision === "APPROVED" ? "Exception resolved for this exact package" : "Application rejected");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Approval needs attention");
    } finally {
      setApprovalBusyId("");
    }
  }

  function openNewApplication() {
    setApplicationDraft(emptyApplication(today));
    setSelectedApplicationId(null);
    setApplicationWorkspaceTab("edit");
    setView("application");
  }

  function openApplication(application: Application, tab: ApplicationWorkspaceTab = "overview") {
    setApplicationDraft({
      ...application,
      screeningPrep: { ...emptyScreeningPrep, ...(application.screeningPrep || {}) },
    });
    setSelectedApplicationId(application.id);
    setApplicationWorkspaceTab(tab);
    setView("application");
  }

  function toggleApplicationSort(key: ApplicationSortKey) {
    setApplicationSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: ["match", "priority", "compensation"].includes(key) ? "desc" : "asc" });
  }

  function updateScreeningPrep<K extends keyof CompanyScreeningPrep>(field: K, value: CompanyScreeningPrep[K]) {
    if (!applicationDraft) return;
    setApplicationDraft({
      ...applicationDraft,
      screeningPrep: { ...(applicationDraft.screeningPrep || emptyScreeningPrep), [field]: value },
    });
  }

  async function generateCareerFollowUps(application: Application) {
    if (followUpRunningId) return;
    if (!["Applied", "Interviewing", "Offer"].includes(application.status)) {
      setFollowUpError("Follow-up preparation starts after the application is submitted.");
      return;
    }
    const prep = { ...emptyScreeningPrep, ...(application.screeningPrep || {}) };
    const match = calculateApplicationMatch(application);
    const inputFingerprint = followUpInputFingerprint(application, prep);
    setFollowUpRunningId(application.id);
    setFollowUpError("");
    try {
      const response = await fetch("/api/career-lab-followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: application.company,
          role: application.role,
          officialUrl: application.approval?.officialJobUrl || application.link,
          location: application.location,
          currentRound: application.currentRound || application.status,
          jobRequirements: application.approval?.requirements || [],
          companySnapshot: prep.companySnapshot,
          roleFit: prep.roleFit,
          technicalStories: prep.technicalStories || match.matchedCapabilities.map((item) => item.evidence).join("\n"),
          likelyQuestions: prep.likelyQuestions,
          risksAndBoundaries: prep.risksAndBoundaries || match.gaps.join("\n"),
          interviewProcess: prep.interviewProcess,
          latestSignal: [application.latestEmailSubject, application.latestEmail, prep.mailboxSignal].filter(Boolean).join("\n"),
          matchedCapabilities: match.matchedCapabilities,
          gaps: match.gaps,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.drill) throw new Error(payload.error || "Live follow-up research could not be completed.");
      const drill = { ...payload.drill, inputFingerprint } as InterviewFollowUpDrill;
      const followUpQuestions = drill.questionGroups
        .map((group) => `${group.trigger}\n${group.questions.map((question) => `• ${question}`).join("\n")}`)
        .join("\n\n");
      const followUpAnswerPlan = drill.questionGroups
        .map((group) => `${group.trigger}\nAnswer anchor: ${group.answerAnchor}\nVerified evidence: ${group.verifiedEvidence}\nTruth boundary: ${group.truthBoundary}`)
        .join("\n\n");
      const updated: Application = {
        ...application,
        screeningPrep: { ...prep, followUpQuestions, followUpAnswerPlan, followUpDrill: drill },
      };
      setApplicationDraft(updated);
      setApplications((items) => items.map((item) => item.id === updated.id ? updated : item));
      showToast("Live follow-up drill researched and cached");
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : "Live follow-up research could not be completed.");
    } finally {
      setFollowUpRunningId("");
    }
  }

  function saveApplication(event: FormEvent) {
    event.preventDefault();
    if (!applicationDraft?.company.trim() || !applicationDraft.role.trim()) return;
    const saved = { ...applicationDraft, id: applicationDraft.id || crypto.randomUUID(), demo: false };
    setApplications((items) => {
      const exists = items.some((item) => item.id === saved.id);
      return exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items];
    });
    setApplicationDraft(saved);
    setSelectedApplicationId(saved.id);
    setApplicationWorkspaceTab("overview");
    setView("application");
    showToast(applicationDraft.id ? "Application updated" : "Application added");
  }

  function deleteApplication(application: Application) {
    if (!window.confirm(`Delete ${application.company} — ${application.role}?`)) return;
    setApplications((items) => items.filter((item) => item.id !== application.id));
    setApplicationDraft(null);
    setSelectedApplicationId(null);
    setView("applications");
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

  async function backupJournalRowsLocally(
    entries: Array<{ problem: InterviewProblem; item: ProblemProgress }>,
    announce = false,
  ) {
    if (!entries.length) {
      if (announce) showToast("No saved journals to back up yet");
      return false;
    }
    const rows = entries.map(({ problem, item }) => journalSheetRow(problem, item));
    setLocalJournalBackup((current) => ({
      ...current,
      status: "saving",
      message: `Saving ${rows.length} journal${rows.length === 1 ? "" : "s"} to your local drive…`,
    }));
    try {
      const response = await fetch("/api/journal-local-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "The local-drive journal backup could not be written.");
      }
      setLocalJournalBackup({
        status: "saved",
        message: `${payload.rowCount} journal${payload.rowCount === 1 ? "" : "s"} safely stored on this Mac.`,
        rowCount: payload.rowCount,
        jsonPath: payload.jsonPath,
        csvPath: payload.csvPath,
        xlsxPath: payload.xlsxPath,
      });
      if (announce) showToast(`${payload.rowCount} journals backed up to the local drive`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The local-drive journal backup could not be written.";
      setLocalJournalBackup((current) => ({ ...current, status: "error", message }));
      if (announce) showToast("Local-drive backup needs attention");
      return false;
    }
  }

  function canUseLocalJournalBackup() {
    return ["localhost", "127.0.0.1"].includes(window.location.hostname);
  }

  async function flushLocalJournalQueue() {
    if (localJournalQueueActiveRef.current || !localJournalQueueRef.current.size) return;
    const entries = [...localJournalQueueRef.current.values()];
    localJournalQueueRef.current.clear();
    localJournalQueueActiveRef.current = true;
    try {
      await backupJournalRowsLocally(entries);
    } finally {
      localJournalQueueActiveRef.current = false;
      if (localJournalQueueRef.current.size) localJournalQueueTimerRef.current = window.setTimeout(() => void flushLocalJournalQueue(), 0);
    }
  }

  function queueLocalJournalBackup(problem: InterviewProblem, item: ProblemProgress) {
    if (!canUseLocalJournalBackup()) return;
    localJournalQueueRef.current.set(String(problem.id), { problem, item });
    if (localJournalQueueActiveRef.current) return;
    if (localJournalQueueTimerRef.current !== null) window.clearTimeout(localJournalQueueTimerRef.current);
    localJournalQueueTimerRef.current = window.setTimeout(() => void flushLocalJournalQueue(), 450);
  }

  function saveProblemEverywhere(problem: InterviewProblem, item: ProblemProgress) {
    pendingJournalIdsRef.current.add(String(problem.id));
    setJournalSync({
      status: "queued",
      pending: pendingJournalIdsRef.current.size,
      message: `${pendingJournalIdsRef.current.size} question${pendingJournalIdsRef.current.size === 1 ? "" : "s"} queued. You can keep editing or open another question.`,
    });
    queueLocalJournalBackup(problem, item);
  }

  function backupAllJournalsLocally() {
    const entries = Object.entries(progress).flatMap(([problemId, item]) => {
      const problem = interviewPlan.find((candidate) => String(candidate.id) === problemId);
      return problem ? [{ problem, item }] : [];
    });
    return backupJournalRowsLocally(entries, true);
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
    saveProblemEverywhere(selectedProblem, updatedDraft);
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

  async function generateJournalHint(fieldId: string, fieldLabel: string, currentAnswer: string) {
    if (!selectedProblem) throw new Error("Open a problem before requesting a hint.");
    const response = await fetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: selectedProblem.title,
        problemUrl: selectedProblem.url,
        pattern: selectedProblem.pattern,
        cue: selectedProblem.cue,
        fieldId,
        fieldLabel,
        currentAnswer,
        language: problemDraft.codeLanguage || settings.primaryLanguage,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.hint) throw new Error(payload.error || "The AI hint could not be generated.");
    return payload.hint as string;
  }

  function saveCurrentProblem(closeAfterSave: boolean) {
    if (!selectedProblem) return false;
    const markedAttempted = problemDraft.status === "Not Started";
    const saved: ProblemProgress = {
      ...problemDraft,
      status: markedAttempted ? "Attempted" : problemDraft.status,
      lastAttempt: today,
      codeLanguage: normalizeLanguage(problemDraft.codeLanguage || settings.primaryLanguage),
    };
    setProgress((items) => ({ ...items, [String(selectedProblem.id)]: saved }));
    saveProblemEverywhere(selectedProblem, saved);
    if (closeAfterSave) setSelectedProblem(null);
    return markedAttempted;
  }

  function saveProblemJournal() {
    const markedAttempted = saveCurrentProblem(true);
    showToast(markedAttempted ? "Journal queued · problem marked Attempted" : "Journal queued · keep working");
  }

  function saveAndOpenNextProblem() {
    if (!selectedProblem) return;
    const currentIndex = interviewPlan.findIndex((problem) => problem.id === selectedProblem.id);
    const nextProblem = interviewPlan[Math.min(currentIndex + 1, LAST_PLAN_INDEX)];
    saveCurrentProblem(false);
    if (nextProblem.id === selectedProblem.id) {
      setSelectedProblem(null);
      showToast("Final journal queued");
      return;
    }
    openProblem(nextProblem);
    showToast("Journal queued · next question opened");
  }

  async function evaluateCode() {
    if (!selectedProblem || reviewRunning) return;
    if (!hasReviewableInput(problemDraft)) {
      setReviewError("Add your code or at least one journal answer first.");
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
      saveProblemEverywhere(selectedProblem, updated);
      showToast("AI review saved to the backend");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI review could not be completed.";
      const connectionLost = error instanceof TypeError && /fetch|network|load/i.test(message);
      setReviewError(connectionLost ? "Job Hub lost its connection to the local AI service. Refresh the page and try the review again." : message);
    } finally {
      setReviewRunning(false);
    }
  }

  function quickUpdateProblem(problem: InterviewProblem, status: PrepStatus) {
    const problemKey = String(problem.id);
    const updated = {
      ...normalizeStoredProgress(progress[problemKey]),
      status,
      lastAttempt: status === "Not Started" ? "" : today,
    };
    setProgress((items) => ({ ...items, [problemKey]: updated }));
    saveProblemEverywhere(problem, updated);
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
      saveProblemEverywhere(selectedProblem, updatedDraft);
    } else {
      const current = normalizeStoredProgress(progress[timerKey]);
      const updatedSeconds = (current.totalSeconds || current.minutes * 60) + timerSeconds;
      const updated = {
        ...current,
        minutes: Math.max(1, Math.ceil(updatedSeconds / 60)),
        totalSeconds: updatedSeconds,
        status: current.status === "Not Started" ? "Attempted" as const : current.status,
        lastAttempt: today,
      };
      setProgress((items) => ({ ...items, [timerKey]: updated }));
      const timerProblem = interviewPlan.find((problem) => String(problem.id) === timerKey);
      if (timerProblem) saveProblemEverywhere(timerProblem, updated);
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
    if (!window.confirm("Delete all synced Job Hub data from the backend and this browser? Export a backup first if you need one.")) return;
    setApplications([]);
    setProgress({});
    showToast("Local data cleared");
  }

  function moveFocusCarousel(step: -1 | 1) {
    setFocusSlideDirection(step > 0 ? "forward" : "back");
    setFocusDayOffset((current) => {
      const minimumOffset = -focusAnchorIndex;
      const maximumOffset = LAST_PLAN_INDEX - focusAnchorIndex;
      const normalized = Math.max(minimumOffset, Math.min(maximumOffset, current));
      return Math.max(minimumOffset, Math.min(maximumOffset, normalized + step));
    });
  }

  function updateLoggedTime(nextMinutes: number, nextSeconds: number) {
    const safeMinutes = Math.max(0, Math.floor(nextMinutes || 0));
    const safeSeconds = Math.max(0, Math.min(59, Math.floor(nextSeconds || 0)));
    const totalSeconds = safeMinutes * 60 + safeSeconds;
    setProblemDraft((current) => ({
      ...current,
      minutes: Math.ceil(totalSeconds / 60),
      totalSeconds,
      codeReview: null,
    }));
  }

  function renderOverview() {
    const focusProblemIndex = Math.max(0, Math.min(LAST_PLAN_INDEX, focusAnchorIndex + focusDayOffset));
    const focusProblem = interviewPlan[focusProblemIndex];
    const focusOffset = focusProblemIndex - focusAnchorIndex;
    const focusProgress = progress[String(focusProblem.id)] ?? emptyProgress;
    const focusTimerActive = timerRunning && timerProblemId === focusProblem.id;
    const focusWorkingSeconds = (focusProgress.totalSeconds || focusProgress.minutes * 60) + (focusTimerActive ? timerSeconds : 0);
    const focusTimeLabel = focusProgress.status.startsWith("Solved") ? "Completed working time" : focusWorkingSeconds > 0 ? "Total working time" : "Practice timer";
    const focusHasSavedJournal = Boolean(progress[String(focusProblem.id)]);
    const focusScheduledDate = addDays(settings.startDate, focusProblem.day - 1);
    const focusDayLabel =
      focusOffset === 0
        ? earliestUnsolvedIndex === -1 ? "Plan complete" : "Earliest unfinished"
        : focusOffset < 0
          ? "Earlier in plan"
          : "Later in plan";
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

        <section className={`daily-coaching ${dailyCoaching ? "" : "is-empty"}`} aria-labelledby="daily-coaching-heading">
          <div className="daily-coaching-heading">
            <div>
              <p className="eyebrow">Daily answer coach</p>
              <h2 id="daily-coaching-heading">
                {dailyCoaching ? "What to improve in today’s answer" : "Your review pattern will appear here"}
              </h2>
              <p>
                {dailyCoaching
                  ? `Based on your last ${dailyCoaching.recentCount} scored journal${dailyCoaching.recentCount === 1 ? "" : "s"}: ${dailyCoaching.problemNames.join(", ")}.`
                  : "Score a journal with the AI coach. Job Hub will compare your latest three reviews and turn repeated gaps into a daily focus."}
              </p>
            </div>
            {dailyCoaching && <span className="daily-score">Recent average <b>{dailyCoaching.averageScore}</b>/100</span>}
          </div>
          {dailyCoaching && (
            <div className="daily-coaching-grid">
              <article>
                <span>Most often missing</span>
                {dailyCoaching.missing.length ? (
                  <div className="daily-missing-list">
                    {dailyCoaching.missing.map((item) => (
                      <b key={item.label}>{item.label}{item.count > 1 ? ` · ${item.count}×` : ""}</b>
                    ))}
                  </div>
                ) : (
                  <strong>No journal sections were missing.</strong>
                )}
              </article>
              <article>
                <span>Lowest recent skill</span>
                {dailyCoaching.lowestCategory ? (
                  <strong>{dailyCoaching.lowestCategory.label} · {dailyCoaching.lowestCategory.score}/100</strong>
                ) : (
                  <strong>Complete another scored review.</strong>
                )}
                <small>Practice the decision, implementation, validation, and learning—not just the final code.</small>
              </article>
              <article className="daily-next-action">
                <span>Do this next</span>
                <strong>{dailyCoaching.nextAction}</strong>
              </article>
            </div>
          )}
        </section>

        <section className="metric-grid" aria-label="Job search summary">
          <article className="metric-card"><span>Active pipeline</span><strong>{activeApplications.length}</strong><small>{appliedCount} applied or beyond</small></article>
          <article className="metric-card"><span>Interviews</span><strong>{interviewCount}</strong><small>{offerCount} offers</small></article>
          <article className={`metric-card ${dueApplications.length ? "metric-alert" : ""}`}><span>Recruiter follow-ups due</span><strong>{dueApplications.length}</strong><small>{dueApplications.length ? "Outreach may be reasonable now" : "No outreach due"}</small></article>
          <article className="metric-card"><span>Prep complete</span><strong>{solvedCount}<em>/{interviewPlan.length}</em></strong><small>{BLIND_75_TOTAL}/{BLIND_75_TOTAL} Blind 75 included</small></article>
        </section>

        <section className="overview-grid">
          <article className="focus-card">
            <button className="focus-carousel-arrow focus-carousel-previous" type="button" aria-label={focusOffset === 1 ? "Back to earliest unfinished problem" : "Show previous or completed problem"} disabled={focusProblemIndex === 0} onClick={() => moveFocusCarousel(-1)}>‹</button>
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
            <button className="focus-carousel-arrow focus-carousel-next" type="button" aria-label={focusOffset === 0 ? "Show the next problem in the plan" : "Show next scheduled problem"} disabled={focusProblemIndex === interviewPlan.length - 1} onClick={() => moveFocusCarousel(1)}>›</button>
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
              <button className="followup-row" key={application.id} onClick={() => openApplication(application)}>
                <span className={`priority-marker priority-${application.priority.toLowerCase()}`} />
                <span className="followup-main"><strong>{application.company}</strong><small>{application.role}</small></span>
                {usesDailyMailboxChecks(application) ? (
                  <span>Next mailbox check: tomorrow morning</span>
                ) : application.followUpDate ? (
                  <span className={application.followUpDate <= today ? "date-overdue" : ""}>{application.followUpDate <= today ? "Due " : ""}{formatHumanDate(application.followUpDate)}</span>
                ) : (
                  <span className="next-action-copy">{application.nextAction}</span>
                )}
              </button>
            )) : <div className="empty-state compact"><strong>No next actions scheduled</strong><span>Backend updates from the job finder will appear here automatically.</span></div>}
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
    const sortButton = (key: ApplicationSortKey, label: string) => {
      const active = applicationSort.key === key;
      return (
        <button
          className={`sort-button ${active ? "is-active" : ""}`}
          onClick={() => toggleApplicationSort(key)}
          aria-label={`Sort by ${label}`}
        >
          {label}<span aria-hidden="true">{active ? applicationSort.direction === "asc" ? "↑" : "↓" : "↕"}</span>
        </button>
      );
    };
    return (
      <>
        <section className="page-heading">
          <div><p className="eyebrow">Application pipeline</p><h1>Every role. One next move.</h1><p>The private Job Hub backend is the source of truth. Browser edits and job-finder updates save there directly.</p></div>
          <button className="primary-button" onClick={openNewApplication}>+ Add application</button>
        </section>
        <div className={`sheet-sync-banner sync-${sheetSync.status}`}>
          <span className="sheet-sync-dot" />
          <span>
            <b>{sheetSync.status === "connected" ? `${sheetSync.rowCount} applications synced${liveSyncConnected ? " · Live" : ""}` : sheetSync.status === "connecting" ? "Syncing applications" : "Backend sync needs attention"}</b>
            <small>
              {sheetSync.status === "connected"
                ? `${sheetSync.workbook} · direct writes enabled · checked ${formatSyncTime(sheetSync.checkedAt)}`
                : sheetSync.message}
            </small>
          </span>
          <button disabled={sheetSync.status === "connecting"} onClick={() => window.location.reload()}>
            {sheetSync.status === "connecting" ? "Checking…" : "Refresh"}
          </button>
        </div>
        {applications.some((item) => item.demo) && <div className="demo-banner"><span><b>Demo records are showing.</b> They are safe placeholders and never leave this browser.</span><button onClick={() => setApplications((items) => items.filter((item) => !item.demo))}>Remove demos</button></div>}
        <section className="toolbar">
          <label className="search-field"><span>⌕</span><input value={applicationSearch} onChange={(event) => setApplicationSearch(event.target.value)} placeholder="Search company, role, location…" /></label>
          <label className="select-field">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | ApplicationStatus)}><option>All</option>{applicationStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <span className="result-count">{filteredApplications.length} role{filteredApplications.length === 1 ? "" : "s"}</span>
        </section>
        <section className="application-list" aria-label="Applications">
          <div className="application-header">
            {sortButton("company", "Company / Role")}
            {sortButton("status", "Status")}
            {sortButton("next", "Next move")}
            {sortButton("compensation", "Compensation")}
            {sortButton("priority", "Priority")}
            {sortButton("match", "Match")}
            <span />
          </div>
          {filteredApplications.map((application) => {
            const match = calculateApplicationMatch(application);
            return (
            <article className="application-row" key={application.id}>
              <div className="company-cell"><strong>{application.company}</strong><span>{application.role}</span><small>{application.location || "Location not set"}{application.sheetSynced ? " · Backend record" : ""}</small></div>
              <div><span className={`status-pill status-${application.status.toLowerCase()}`}>{application.workbookStatus || application.status}</span><small>{application.currentRound && application.currentRound !== application.workbookStatus ? application.currentRound : ""}</small></div>
              <div><strong>{mailboxNextCheckLabel(application) || application.nextAction || "Not set"}</strong><small>{recruiterOutreachPlan(application, today)?.label || (application.appliedDate ? `${application.workbookStatus === "Prepared" ? "Prepared" : "Dated"} ${formatHumanDate(application.appliedDate)}` : application.latestEmailSubject || application.source || "")}</small></div>
              <div><strong>{application.salaryMin ? `${formatMoney(application.salaryMin)}${application.salaryMax ? `–${formatMoney(application.salaryMax).replace("$", "")}` : "+"}` : "Not listed"}</strong><small>{application.source}</small></div>
              <div><span className={`priority-pill priority-${application.priority.toLowerCase()}`}>{application.priority}</span></div>
              <div className="match-cell"><strong>{match.score}%</strong><small>{match.confidence} confidence</small></div>
              <button className="row-action" aria-label={`Open ${application.company} workspace`} onClick={() => openApplication(application)}>→</button>
            </article>
          );})}
          {!filteredApplications.length && <div className="empty-state"><strong>No applications match this view.</strong><span>Clear the filters or add your first role.</span><button className="secondary-button" onClick={openNewApplication}>Add application</button></div>}
        </section>
      </>
    );
  }

  function renderFunnelHealth() {
    const stages = [
      { label: "Submitted", value: funnelDiagnosis.sampleSize, denominator: 100, rate: Math.min(100, funnelDiagnosis.sampleSize), note: "latest confirmed applications" },
      { label: "Recruiter screens", value: funnelDiagnosis.screens, denominator: funnelDiagnosis.sampleSize, rate: funnelDiagnosis.screenRate, note: `${funnelDiagnosis.screenRate}% of submitted` },
      { label: "Technical rounds", value: funnelDiagnosis.technicalRounds, denominator: funnelDiagnosis.screens, rate: funnelDiagnosis.technicalRate, note: `${funnelDiagnosis.technicalRate}% of screens` },
      { label: "Final rounds", value: funnelDiagnosis.finalRounds, denominator: funnelDiagnosis.technicalRounds, rate: funnelDiagnosis.finalRate, note: `${funnelDiagnosis.finalRate}% of technical` },
      { label: "Offers", value: funnelDiagnosis.offers, denominator: funnelDiagnosis.finalRounds, rate: funnelDiagnosis.offerRate, note: `${funnelDiagnosis.offerRate}% of finals` },
    ];
    const decisions = [
      { key: "targeting", label: "Under 5 screens after 100 applications", fix: "Resume and targeting" },
      { key: "narrative", label: "Screens but no technical rounds", fix: "Professional narrative" },
      { key: "technical", label: "Technical rounds without advancement", fix: "Coding preparation" },
      { key: "closing", label: "Final rounds without offers", fix: "Behavioral answers and closing" },
      { key: "healthy", label: "Consistent stage progression", fix: "Keep running the system" },
    ];

    return (
      <>
        <section className={`funnel-hero funnel-${funnelDiagnosis.key}`}>
          <div>
            <p className="eyebrow">Evidence diagnosis · latest 100 submissions</p>
            <h1>{funnelDiagnosis.title}</h1>
            <p>{funnelDiagnosis.summary}</p>
          </div>
          <span>{funnelDiagnosis.confidence}</span>
        </section>

        <section className="funnel-stage-grid" aria-label="Application funnel stages">
          {stages.map((stage) => (
            <article key={stage.label}>
              <span>{stage.label}</span>
              <strong>{stage.value}{stage.label === "Submitted" && <em>/100</em>}</strong>
              <small>{stage.note}</small>
              <div aria-label={`${stage.label}: ${stage.rate}% conversion`}><span style={{ width: `${Math.min(100, stage.rate)}%` }} /></div>
              {stage.denominator === 0 && stage.label !== "Submitted" && <small>No eligible prior-stage evidence yet</small>}
            </article>
          ))}
        </section>

        <section className="funnel-diagnosis-grid">
          <article className="funnel-action-card">
            <p className="eyebrow">Primary intervention</p>
            <h2>{funnelDiagnosis.action}</h2>
            <div className="funnel-evidence-note">
              <strong>Evidence gate</strong>
              <span>Early targeting conclusions wait for 100 applications. Repeated later-stage failures can trigger after three confirmed outcomes because they identify a narrower bottleneck.</span>
            </div>
          </article>

          <article className="funnel-decision-card">
            <p className="eyebrow">Decision ladder</p>
            <h2>Change only the measured bottleneck.</h2>
            <div>
              {decisions.map((decision, index) => (
                <div key={decision.key} className={funnelDiagnosis.key === decision.key ? "is-current" : ""}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p><strong>{decision.label}</strong><small>{decision.fix}</small></p>
                  <b>{funnelDiagnosis.key === decision.key ? "Current" : ""}</b>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="funnel-method">
          <div><p className="eyebrow">Truth boundary</p><h2>Confirmed stages only.</h2></div>
          <p>Job Hub uses submitted dates, current confirmed rounds, completed-round counts, recruiter messages, and offer status. Predicted interviews, suggested follow-up dates, and Career Lab estimates never count as completed funnel progress.</p>
        </section>
      </>
    );
  }

  function renderSourcing() {
    const scannedSources = discoveryDashboard.sources.filter((source) => source.lastScan);
    const latestRun = discoveryDashboard.runs[0]?.run;
    const activeLeads = discoveryDashboard.leads.filter((lead) => !["Rejected", "Duplicate"].includes(lead.status));
    const qualifiedLeads = discoveryDashboard.leads.filter((lead) => ["Qualified", "Applied"].includes(lead.status));
    return (
      <>
        <section className="sourcing-hero">
          <div>
            <p className="eyebrow">Multi-source discovery</p>
            <h1>More places in. Official evidence out.</h1>
            <p>LinkedIn, Indeed, Wellfound, startup boards, direct ATS feeds, company career pages, and recruiter signals now feed one deduplicated discovery ledger. Every candidate still has to pass the official-posting gate.</p>
          </div>
          <button className="primary-button" disabled={discoveryDashboard.status === "loading"} onClick={() => void refreshDiscovery()}>{discoveryDashboard.status === "loading" ? "Refreshing…" : "Refresh coverage"}</button>
        </section>

        <section className="source-metric-grid" aria-label="Discovery totals">
          <article><span>Source network</span><strong>{discoveryDashboard.sources.length}</strong><small>{scannedSources.length} scanned at least once</small></article>
          <article><span>Active leads</span><strong>{activeLeads.length}</strong><small>Discovered through blocked</small></article>
          <article><span>Qualified</span><strong>{qualifiedLeads.length}</strong><small>Official posting verified</small></article>
          <article><span>Latest run</span><strong>{latestRun?.applicationsSubmitted ?? 0}/5</strong><small>{latestRun ? `${latestRun.sourcesAttempted ?? 0} sources · ${latestRun.leadsFound ?? 0} leads` : "Waiting for the next six-hour run"}</small></article>
        </section>

        <section className={`source-status-banner source-status-${discoveryDashboard.status}`}>
          <span className="sheet-sync-dot" />
          <div><strong>{discoveryDashboard.status === "connected" ? "Discovery backend connected" : discoveryDashboard.status === "loading" ? "Loading source ledger" : "Source ledger needs attention"}</strong><small>{discoveryDashboard.message}{discoveryDashboard.updatedAt ? ` · latest evidence ${formatSyncTime(discoveryDashboard.updatedAt)}` : ""}</small></div>
        </section>

        <section className="source-policy-strip">
          <article><span>01</span><div><strong>Discover broadly</strong><small>Search job boards, startup networks, direct ATS boards, and company careers.</small></div></article>
          <article><span>02</span><div><strong>Verify officially</strong><small>Read the live employer posting before qualification or resume work.</small></div></article>
          <article><span>03</span><div><strong>Dedupe once</strong><small>Match official URL, then company, role, and location across discovery and applications.</small></div></article>
          <article><span>04</span><div><strong>Apply with evidence</strong><small>Only authoritative submission confirmation moves a lead to Applied.</small></div></article>
        </section>

        <section className="source-section-heading">
          <div><p className="eyebrow">Coverage map</p><h2>Every enabled source</h2></div>
          <p>Broad boards generate leads. Direct ATS and employer pages establish truth.</p>
        </section>
        <section className="source-grid">
          {discoveryDashboard.sources.map((source) => (
            <article className="source-card" key={source.key}>
              <div className="source-card-head"><span className={`source-state source-state-${source.scanStatus}`}>{source.scanStatus === "not-started" ? "Queued" : source.scanStatus}</span><small>{source.cadence}</small></div>
              <h3>{source.name}</h3>
              <p>{source.lane}</p>
              <div className="source-card-counts"><span><strong>{source.resultsFound}</strong> found</span><span><strong>{source.qualifiedCount}</strong> qualified</span><span><strong>{source.duplicateCount}</strong> duplicates</span></div>
              <small className="source-verification">{source.verification}</small>
              <small>{source.lastScan ? `Last scanned ${formatSyncTime(source.lastScan)}` : "First scan is queued for the next run."}</small>
              {source.note && <p className="source-note">{source.note}</p>}
            </article>
          ))}
        </section>

        <section className="source-section-heading source-lead-heading">
          <div><p className="eyebrow">Discovery ledger</p><h2>Recent leads and decisions</h2></div>
          <p>Discovery source and official verification link stay separate.</p>
        </section>
        <section className="discovery-lead-list">
          {discoveryDashboard.leads.slice(0, 30).map((lead) => (
            <article className="discovery-lead-row" key={lead.id}>
              <div><strong>{lead.company}</strong><span>{lead.role}</span><small>{lead.location || lead.workModel || "Location not recorded"}</small></div>
              <div><span className={`lead-status lead-status-${lead.status.toLowerCase()}`}>{lead.status}</span><small>{lead.discoveredSources?.length ? lead.discoveredSources.join(" · ") : lead.source}</small></div>
              <div><strong>{lead.salaryMin ? `${formatMoney(lead.salaryMin)}${lead.salaryMax ? `–${formatMoney(lead.salaryMax).replace("$", "")}` : "+"}` : "Salary pending"}</strong><small>{lead.experienceLevel || "Experience signal pending"}</small></div>
              <div className="lead-link-cell">{lead.sourceUrl && <a href={lead.sourceUrl} target="_blank" rel="noreferrer">Discovery source ↗</a>}{lead.officialUrl && <a href={lead.officialUrl} target="_blank" rel="noreferrer">Official posting ↗</a>}<small>{lead.reason || "No decision note recorded."}</small></div>
            </article>
          ))}
          {!discoveryDashboard.leads.length && <div className="empty-state"><strong>The source network is ready.</strong><span>The next six-hour finder run will record source scans, raw leads, official verification, duplicates, and qualification decisions here.</span></div>}
        </section>
      </>
    );
  }

  function renderMatches() {
    const reviewQueue = applications
      .filter((application) => application.approval && ["Pending", "Approved"].includes(application.approval.status))
      .sort((a, b) => {
        const statusRank = (item: Application) => item.approval?.status === "Pending" ? 0 : 1;
        const tierRank = (item: Application) => ({ A: 0, B: 1, C: 2 }[item.approval?.tier || "C"]);
        return statusRank(a) - statusRank(b) || tierRank(a) - tierRank(b) || calculateApplicationMatch(b).score - calculateApplicationMatch(a).score;
      });
    const preparedToday = applications.filter((application) => localDateFromTimestamp(application.approval?.preparedAt) === today).length;
    const pendingCount = reviewQueue.filter((application) => application.approval?.status === "Pending").length;
    const tierCount = (tier: "A" | "B" | "C") => reviewQueue.filter((application) => application.approval?.tier === tier).length;

    return (
      <>
        <section className="matches-hero">
          <div>
            <p className="eyebrow">Exception-only application queue</p>
            <h1>Routine applications run. Judgment calls stop here.</h1>
            <p>Tier A and B applications submit directly after every qualification, factual, ATS, rendering, duplicate, answer, immutable-artifact, and live-posting check passes. This page contains only genuine exceptions or exact packages you explicitly resolved.</p>
          </div>
          <div className="matches-hero-stat"><strong>{pendingCount}</strong><span>exceptions needing judgment</span><small>{preparedToday}/20 prepared today · routine approval removed</small></div>
        </section>

        <section className="approval-tier-strip" aria-label="Application preparation tiers">
          <article><span>Tier A</span><strong>{tierCount("A")}</strong><small>4–5 excellent matches · full tailoring + outreach</small></article>
          <article><span>Tier B</span><strong>{tierCount("B")}</strong><small>6–10 solid matches · concise role-specific tailoring</small></article>
          <article><span>Tier C</span><strong>{tierCount("C")}</strong><small>Questionable matches · review only, never submission-ready</small></article>
        </section>

        <section className="match-list" aria-label="Prepared application approval queue">
          {reviewQueue.map((application, index) => {
            const match = calculateApplicationMatch(application);
            const approval = application.approval!;
            const score = approval.score ?? match.score;
            const canApprove = approval.status === "Pending" && approval.tier !== "C";
            const busy = approvalBusyId === approval.id;
            return (
            <article className={`match-card approval-card approval-tier-${approval.tier.toLowerCase()}`} key={approval.id}>
              <div className="match-rank"><span>Tier</span>{approval.tier}</div>
              <div className="match-main">
                <div className="match-title-row">
                  <div><span>{String(index + 1).padStart(2, "0")} · {application.company}</span><h2>{application.role}</h2></div>
                  <div className="approval-card-score"><strong className="match-score">{score}%</strong><span className={`approval-status approval-status-${approval.status.toLowerCase()}`}>{approval.status}</span></div>
                </div>
                <div className="match-meta">
                  <span>{application.location || "Location under review"}</span>
                  <span>{approval.compensation || (application.salaryMin || application.salaryMax ? `${application.salaryMin || "?"}–${application.salaryMax || "?"}` : "Compensation not published")}</span>
                  <span>{approval.track || match.track}</span>
                  <span>{approval.tailoringLevel || (approval.tier === "A" ? "Full" : approval.tier === "B" ? "Concise" : "Review only")} tailoring</span>
                </div>
                <div className="approval-card-grid">
                  <section><p className="eyebrow">Requirements</p><ul>{approval.requirements.length ? approval.requirements.map((item) => <li key={item}>{item}</li>) : <li>No requirement summary was supplied.</li>}</ul></section>
                  <section><p className="eyebrow">Honest gaps</p><ul>{approval.gaps.length ? approval.gaps.map((item) => <li key={item}>{item}</li>) : <li>No material verified gap was recorded.</li>}</ul></section>
                </div>
                {approval.tier !== "C" && (
                  <div className="approval-package-details">
                    <details open>
                      <summary>Exact résumé preview <span>{approval.resumeFileName || "Tailored PDF"}</span></summary>
                      <p className="preformatted">{approval.resumePreview || "Open the exact immutable PDF preview below. The recorded hash prevents document substitution after validation."}</p>
                      <small>SHA-256 · {approval.resumeSha256 || "Missing — package cannot be resolved"}</small>
                      {approval.resumePreviewUrl && <a href={approval.resumePreviewUrl} target="_blank" rel="noreferrer">Open exact PDF preview ↗</a>}
                    </details>
                    <details>
                      <summary>Application answers <span>{approval.answers.length}</span></summary>
                      <div className="approval-answer-list">{approval.answers.length ? approval.answers.map((item) => <div key={`${item.question}-${item.answer}`}><strong>{item.question}</strong><p>{item.answer}</p></div>) : <p>No role-specific written answers were required.</p>}</div>
                    </details>
                  </div>
                )}
                {approval.exceptionReasons?.length ? <p className="tier-c-warning">Exception: {approval.exceptionReasons.join(" · ")}</p> : null}
                {approval.tier === "C" && <p className="tier-c-warning">Tier C is intentionally not submission-ready. It must be rebuilt as Tier A or B after the judgment or evidence gap is resolved.</p>}
                <div className="match-actions">
                  {["Pending", "Blocked"].includes(approval.status) && approval.tier !== "C" && <button className="primary-button" disabled={!canApprove || busy} onClick={() => void reviewApplicationPackage(application, "APPROVED")}>{busy ? "Saving…" : "Resolve for exact package"}</button>}
                  {["Pending", "Blocked"].includes(approval.status) && <button className="secondary-button approval-reject-button" disabled={busy} onClick={() => void reviewApplicationPackage(application, "APPROVAL_REJECTED")}>{busy ? "Saving…" : "Reject"}</button>}
                  {approval.status === "Approved" && <span className="approval-ready-note">Exception resolved · the finder may submit only this exact package</span>}
                  <button className="text-button" onClick={() => openApplication(application, "match")}>Open full workspace</button>
                  <a className="text-button" href={approval.officialJobUrl || application.link} target="_blank" rel="noreferrer">Official posting ↗</a>
                </div>
              </div>
            </article>
          );})}
          {!reviewQueue.length && <div className="empty-state match-empty"><strong>No application exceptions are waiting.</strong><span>Routine qualifying Tier A and B packages proceed directly after validation. Only CAPTCHA, unknown answers, conflicts, duplicates, changed postings, or ambiguous outcomes stop here.</span></div>}
        </section>
      </>
    );
  }

  function renderCareerLab() {
    const careerApplications = applications
      .filter((application) => {
        if (hasConfirmedInterview(application)) return true;
        if (application.status !== "Applied" || !application.appliedDate) return false;
        const age = dayDifference(application.appliedDate.slice(0, 10), today);
        return age >= 0 && age <= 30;
      })
      .sort((a, b) => calculateApplicationMatch(b).score - calculateApplicationMatch(a).score);

    return (
      <>
        <section className="career-hero">
          <div><p className="eyebrow">Application Career Lab</p><h1>Ready before the recruiter calls.</h1><p>Recent applications get a cached, role-specific follow-up drill. The complete Career Lab still unlocks only after an interview is confirmed.</p></div>
          <div className="career-steps"><span>01 Call prep</span><span>02 Match</span><span>03 Practice</span><span>04 Negotiate</span></div>
        </section>
        <section className="application-lab-list">
          {careerApplications.map((application) => {
            const match = calculateApplicationMatch(application);
            const stages = interviewStages(application);
            const interviewConfirmed = hasConfirmedInterview(application);
            return (
              <article className="application-lab-card" key={application.id}>
                <div className="lab-card-score"><strong>{match.score}%</strong><span>{match.confidence} confidence</span></div>
                <div className="lab-card-copy">
                  <p className="eyebrow">{application.company} · {application.status}</p>
                  <h2>{application.role}</h2>
                  <p>{match.track} · {match.matchedCapabilities.slice(0, 3).map((item) => item.label).join(" · ")}</p>
                  <small>{interviewConfirmed ? `${stages.length} interview stages mapped` : "Unexpected recruiter-call prep available"} · {application.salaryMin ? "published compensation stored" : "compensation needs confirmation"}</small>
                </div>
                <div className="lab-card-actions">
                  <button className="primary-button" onClick={() => openApplication(application, "career")}>{interviewConfirmed ? "Open Career Lab" : "Open call prep"} →</button>
                  {interviewConfirmed && <button className="secondary-button" onClick={() => openApplication(application, "interviews")}>Interview path</button>}
                </div>
              </article>
            );
          })}
          {!careerApplications.length && <div className="empty-state"><strong>No recent submitted applications yet.</strong><span>Call prep appears after submission. The complete Career Lab unlocks when an interview is confirmed.</span></div>}
        </section>
      </>
    );
  }

  function renderApplicationWorkspace() {
    if (!applicationDraft) {
      return (
        <div className="empty-state workspace-empty">
          <strong>No application selected.</strong>
          <span>Choose a role from Applications to open its full workspace.</span>
          <button className="primary-button" onClick={() => setView("applications")}>Back to Applications</button>
        </div>
      );
    }

    const application = applicationDraft;
    const isNew = !selectedApplicationId && !application.id;
    const match = calculateApplicationMatch(application);
    const salary = salaryPlan(application);
    const interviewConfirmed = hasConfirmedInterview(application);
    const stages = interviewConfirmed ? interviewStages(application) : [];
    const prep = application.screeningPrep || emptyScreeningPrep;
    const outreachPlan = recruiterOutreachPlan(application, today);
    const targetCompensation = salary.target ? formatMoney(String(salary.target)) : "the top half of the published range";
    const counterLanguage = `I’m excited about the ${application.role} role. Based on the scope${application.location ? `, ${application.location} market` : ""}${salary.minimum ? `, and the published ${formatMoney(String(salary.minimum))}${salary.maximum ? `–${formatMoney(String(salary.maximum)).replace("$", "")}` : "+"} range` : ""}, could we explore a base closer to ${targetCompensation}?`;
    const copyText = async (value: string, message: string) => {
      await navigator.clipboard.writeText(value);
      showToast(message);
    };
    const workspaceTabs: Array<{ key: ApplicationWorkspaceTab; label: string }> = [
      { key: "overview", label: "Overview" },
      { key: "match", label: `Match ${match.score}%` },
      { key: "career", label: interviewConfirmed ? "Career Lab" : "Career Lab · locked" },
      { key: "interviews", label: interviewConfirmed ? `Interviews ${stages.length}` : "Interviews · locked" },
      { key: "edit", label: application.sheetSynced ? "Record" : "Edit" },
    ];
    const gapBridges = match.gaps.map((gap) => gapBridgeDetails(application, gap, match));
    const careerLabGate = (
      <article className="career-lab-gate">
        <span aria-hidden="true">⌁</span>
        <div><p className="eyebrow">Waiting for confirmation</p><h2>The complete Career Lab unlocks after an interview is confirmed.</h2><p>Unexpected-call follow-ups are available now. Full outreach, recruiter narrative, compensation coaching, technical stories, and stage-by-stage preparation appear when this application moves to Interviewing or a confirmed scheduling signal is recorded.</p></div>
        <button className="secondary-button" onClick={() => setApplicationWorkspaceTab("edit")}>Update interview signal</button>
      </article>
    );
    const followUpFingerprint = followUpInputFingerprint(application, prep);
    const followUpDrill = prep.followUpDrill;
    const followUpCacheFresh = Boolean(followUpDrill?.inputFingerprint === followUpFingerprint);
    const strongestCapability = match.matchedCapabilities[0];
    const strongestGap = match.gaps[0];
    const followUpQuestionText = prep.followUpQuestions || [
      `After your ${strongestCapability?.label || match.track} example: what did you personally own, and what belonged to the broader team or tools?`,
      "Walk me through one request or document from input to the user-visible result.",
      "What failed during implementation, how did you detect it, and what changed afterward?",
      "Which tradeoff did you make, and what alternative did you reject?",
      `How did you test or validate the part most relevant to ${application.role}?`,
      strongestGap ? `Your honest gap is: ${strongestGap} How would you close it in the first 90 days?` : `What would be your steepest learning curve in this ${application.role} role?`,
      `Why ${application.company}, and why is this role a better match for your next step?`,
    ].join("\n");
    const followUpAnswerPlan = prep.followUpAnswerPlan || [
      `Ownership: use ${strongestCapability?.evidence || "the strongest verified project or professional example"}; separate your contribution from collaborators and platform capabilities.`,
      "Mechanism: explain the input, service or component boundary, data flow, validation, and output.",
      "Evidence: use only a verified record, commit, route, test, workflow, funding, deployment, or supported-user count that belongs to that example.",
      "Tradeoff: name the failure mode and why the selected design was safer, more reliable, or easier to test.",
      "Boundary: state an honest gap directly; never imply unsupported domain experience, ownership, scale, or production deployment.",
    ].join("\n");
    const followUpCopy = `Likely follow-up questions\n${followUpQuestionText}\n\nAnswer plan\n${followUpAnswerPlan}`;
    const followUpPrepPanel = (
      <article className="workspace-panel career-workspace-followups">
        <div className="career-panel-heading">
          <div><p className="eyebrow">Unexpected recruiter-call prep</p><h2>{followUpDrill?.headline || `Follow-ups for ${application.company}`}</h2></div>
          <span className={followUpCacheFresh ? "signal-confirmed" : "signal-predicted"}>{followUpCacheFresh ? "Live research cached" : followUpDrill ? "Refresh recommended" : "Application-pack draft"}</span>
        </div>
        <p>{followUpDrill?.researchedSummary || `Prepared from the same verified role and candidate evidence used for the ${application.role} application. Live web research runs only when requested or when material inputs change.`}</p>
        {followUpDrill ? (
          <div className="follow-up-group-grid">
            {followUpDrill.questionGroups.map((group, index) => (
              <section className="follow-up-group" key={`${group.trigger}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")} · {group.trigger}</span>
                <ul>{group.questions.map((question) => <li key={question}>{question}</li>)}</ul>
                <dl><div><dt>Answer anchor</dt><dd>{group.answerAnchor}</dd></div><div><dt>Verified proof</dt><dd>{group.verifiedEvidence}</dd></div><div><dt>Truth boundary</dt><dd>{group.truthBoundary}</dd></div></dl>
              </section>
            ))}
          </div>
        ) : (
          <div className="follow-up-draft-grid">
            <section><span>Likely interviewer probes</span><p className="preformatted">{followUpQuestionText}</p></section>
            <section><span>How to answer</span><p className="preformatted">{followUpAnswerPlan}</p></section>
          </div>
        )}
        {followUpDrill?.unsupportedOrUnverified?.length > 0 && <div className="follow-up-boundaries"><strong>Do not imply</strong><p>{followUpDrill.unsupportedOrUnverified.join(" · ")}</p></div>}
        {followUpDrill?.sources?.length > 0 && <div className="follow-up-sources"><span>Current online sources · {formatSyncTime(followUpDrill.generatedAt)}</span>{followUpDrill.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title} ↗</a>)}</div>}
        {followUpError && <p className="follow-up-error">{followUpError}</p>}
        <div className="workspace-actions">
          <button className="secondary-button" onClick={() => void copyText(followUpCopy, "Follow-up drill copied")}>Copy drill</button>
          <button className="primary-button" disabled={Boolean(followUpRunningId)} onClick={() => void generateCareerFollowUps(application)}>{followUpRunningId === application.id ? "Researching current sources…" : followUpDrill ? "Refresh live research" : "Research live follow-ups"}</button>
        </div>
        <small>{followUpDrill?.freshnessNote || "Cached by company, role, posting, requirements, and recruiter signal. Routine mailbox checks do not regenerate it."}</small>
      </article>
    );

    return (
      <section className="application-workspace">
        <button className="workspace-back" onClick={() => { setApplicationDraft(null); setSelectedApplicationId(null); setView("applications"); }}>← All applications</button>
        <header className="workspace-hero">
          <div>
            <p className="eyebrow">{isNew ? "New application" : `${application.company} application workspace`}</p>
            <h1>{isNew ? "Add an application" : application.role}</h1>
            {!isNew && <p>{application.location || "Location not set"} · {match.track} · {application.source || "Source not set"}</p>}
          </div>
          {!isNew && (
            <div className="workspace-hero-stats">
              <div><span>Status</span><strong>{application.workbookStatus || application.status}</strong></div>
              <div><span>Verified match</span><strong>{match.score}%</strong><small>{match.confidence} confidence</small></div>
              <div><span>Next move</span><strong>{mailboxNextCheckLabel(application) || application.nextAction || "Confirm next action"}</strong></div>
            </div>
          )}
        </header>

        {!isNew && (
          <nav className="workspace-tabs" aria-label="Application workspace sections">
            {workspaceTabs.map((tab) => <button key={tab.key} className={applicationWorkspaceTab === tab.key ? "active" : ""} onClick={() => setApplicationWorkspaceTab(tab.key)}>{tab.label}</button>)}
          </nav>
        )}

        {!isNew && applicationWorkspaceTab === "overview" && (
          <div className="workspace-section-grid">
            <article className="workspace-panel workspace-primary-panel">
              <p className="eyebrow">Application state</p><h2>{application.currentRound || application.status}</h2>
              <div className="application-status-track">
                {(["Saved", "Preparing", "Applied", "Interviewing", "Offer"] as ApplicationStatus[]).map((status) => {
                  const currentIndex = ["Saved", "Preparing", "Applied", "Interviewing", "Offer"].indexOf(application.status);
                  const statusIndex = ["Saved", "Preparing", "Applied", "Interviewing", "Offer"].indexOf(status);
                  return <div key={status} className={statusIndex <= currentIndex ? "reached" : ""}><span>{statusIndex < currentIndex ? "✓" : statusIndex + 1}</span><small>{status}</small></div>;
                })}
              </div>
              <div className="next-move-card"><span>Mailbox monitoring</span><strong>{mailboxNextCheckLabel(application) || application.nextAction || "Confirm the next action"}</strong><small>Daily morning Gmail checks are separate from recruiter outreach.</small></div>
              {outreachPlan && <div className="next-move-card"><span>Recruiter outreach</span><strong>{outreachPlan.label}</strong><small>{outreachPlan.ready ? "A suggestion only—not a confirmed recruiter event." : "This is an earliest suggested follow-up, not a recruiter or interview date."}</small></div>}
              <p className="workspace-notes">{application.notes || "No application notes yet."}</p>
            </article>
            <article className="workspace-panel">
              <p className="eyebrow">Role facts</p><h2>At a glance</h2>
              <dl className="fact-list">
                <div><dt>Applied</dt><dd>{application.appliedDate ? formatHumanDate(application.appliedDate) : "Not submitted"}</dd></div>
                <div><dt>Compensation</dt><dd>{salary.minimum ? `${formatMoney(String(salary.minimum))}${salary.maximum ? `–${formatMoney(String(salary.maximum)).replace("$", "")}` : "+"}` : "Not published"}</dd></div>
                <div><dt>Priority</dt><dd>{application.priority}</dd></div>
                <div><dt>Resume</dt><dd>{application.resumePath ? application.resumePath.split("/").pop() : "Not attached"}</dd></div>
              </dl>
              <div className="workspace-actions">{application.link && <a className="primary-button" href={application.link} target="_blank" rel="noreferrer">Official posting ↗</a>}<button className="secondary-button" onClick={() => setApplicationWorkspaceTab("edit")}>Open record</button></div>
            </article>
            <article className="workspace-panel workspace-wide">
              <p className="eyebrow">Latest signal</p><h2>{application.latestEmailSubject || prep.mailboxSignal ? "Mailbox and recruiter context" : "No recruiter signal yet"}</h2>
              <p className="preformatted">{prep.mailboxSignal || application.latestEmailSubject || "Monitor Gmail and attach scheduling, assessment, rejection, or recruiter signals here when they arrive."}</p>
              {prep.lastMailboxCheck && <small>Last mailbox check: {formatHumanDate(prep.lastMailboxCheck)}</small>}
              {usesDailyMailboxChecks(application) && <small>Next mailbox check: tomorrow morning</small>}
            </article>
          </div>
        )}

        {!isNew && applicationWorkspaceTab === "match" && (
          <div className="match-workspace">
            <article className="match-score-panel">
              <div className="match-score-ring" style={{ "--match-score": `${match.score * 3.6}deg` } as React.CSSProperties}><span><strong>{match.score}%</strong><small>{match.confidence} confidence</small></span></div>
              <div><p className="eyebrow">Verified fit model</p><h2>{match.track}</h2><p>{match.rationale}</p><small>Priority is not used in the score. Only stored role evidence, verified candidate capabilities, seniority, domain, and location are used.</small></div>
            </article>
            <section className="dimension-grid">
              {match.dimensions.map((dimension) => <article key={dimension.label}><div><span>{dimension.label}</span><strong>{dimension.score}%</strong></div><div className="dimension-bar"><span style={{ width: `${dimension.score}%` }} /></div></article>)}
            </section>
            <section className="evidence-grid">
              <article className="workspace-panel"><p className="eyebrow">Matched evidence</p><h2>What supports the fit</h2><div className="evidence-list">{match.matchedCapabilities.map((capability) => <div key={capability.label}><strong>{capability.label}</strong><p>{capability.evidence}</p></div>)}</div></article>
              <article className="workspace-panel gap-panel gap-clarity-panel">
                <p className="eyebrow">Missing requirements</p>
                <h2>What is missing—and how to bridge it</h2>
                <p className="gap-definition">A gap means the saved evidence does not directly prove a job requirement. State the boundary plainly, use only adjacent verified evidence, and give a concrete first-month plan.</p>
                <div className="gap-bridge-list">
                  {gapBridges.map((gap, index) => (
                    <article className="gap-bridge-card" key={`${gap.title}-${index}`}>
                      <header><span>Gap {String(index + 1).padStart(2, "0")}</span><strong>{gap.title}</strong><em>{gap.rehearsalReady ? "Not claimed" : "Needs source"}</em></header>
                      <div className="gap-bridge-grid">
                        <section><small>Exact missing requirement</small><p>{gap.boundary}</p></section>
                        <section><small>Transferable evidence</small><p>{gap.transferableEvidence}</p></section>
                        <section><small>First 30-day move</small><p>{gap.rampPlan}</p></section>
                      </div>
                      <section className="gap-ready-answer">
                        <small>{gap.rehearsalReady ? "Ready-to-say gap answer" : "Research needed before rehearsal"}</small>
                        {gap.rehearsalReady ? <><blockquote>{gap.talkTrack}</blockquote><button className="text-button" onClick={() => void copyText(gap.talkTrack, `${gap.title} answer copied`)}>Copy gap answer</button></> : <p>{gap.talkTrack}</p>}
                      </section>
                    </article>
                  ))}
                </div>
                <p className="gap-source-note">Add the complete job description and keep the role-fit record current so these boundaries stay role-specific.</p>
              </article>
            </section>
          </div>
        )}

        {!isNew && applicationWorkspaceTab === "career" && !interviewConfirmed && <div className="career-workspace-stack">{followUpPrepPanel}{careerLabGate}</div>}
        {!isNew && applicationWorkspaceTab === "career" && interviewConfirmed && (
          <div className="career-workspace-grid">
            {followUpPrepPanel}
            <article className="workspace-panel career-workspace-outreach">
              <div className="career-panel-heading"><div><p className="eyebrow">Hiring-manager outreach</p><h2>Find and start the conversation.</h2></div><span className="approval-badge">Review before send</span></div>
              <p>This draft uses the top verified match evidence for this application. Job Hub opens LinkedIn search but does not select a recipient or send anything.</p>
              <blockquote>{outreachMessage(application)}</blockquote>
              <div className="workspace-actions"><button className="secondary-button" onClick={() => void copyText(outreachMessage(application), "Outreach copied · review before sending")}>Copy message</button><a className="primary-button" href={hiringManagerSearch(application)} target="_blank" rel="noreferrer">Find on LinkedIn ↗</a></div>
            </article>
            <article className="workspace-panel">
              <p className="eyebrow">Why this company</p><h2>Specific motivation</h2>
              <p className="preformatted">{prep.whyCompany || `Research ${application.company}’s product, customers, and engineering problems. Connect that research to ${match.matchedCapabilities.slice(0, 2).map((item) => item.label.toLowerCase()).join(" and ")}.`}</p>
            </article>
            <article className="workspace-panel">
              <p className="eyebrow">Recruiter narrative</p><h2>60-second positioning</h2>
              <p className="preformatted">{prep.recruiterPitch || emptyScreeningPrep.recruiterNarrative}</p>
              <button className="text-button" onClick={() => void copyText(prep.recruiterPitch || emptyScreeningPrep.recruiterNarrative, "Recruiter narrative copied")}>Copy narrative</button>
            </article>
            <article className="workspace-panel compensation-panel">
              <p className="eyebrow">Compensation plan</p><h2>{salary.minimum ? `${formatMoney(String(salary.minimum))}${salary.maximum ? `–${formatMoney(String(salary.maximum)).replace("$", "")}` : "+"}` : "Ask for the budgeted range"}</h2>
              {salary.target ? <div className="compensation-target"><span>Evidence-based target</span><strong>{formatMoney(String(salary.target))}</strong><small>65% into the employer’s published range—not an invented market figure.</small></div> : <p>No published range is stored. Ask the recruiter before naming a target.</p>}
              <blockquote>{counterLanguage}</blockquote>
              <button className="text-button" onClick={() => void copyText(counterLanguage, "Negotiation language copied")}>Copy counter language</button>
            </article>
          </div>
        )}

        {!isNew && applicationWorkspaceTab === "interviews" && !interviewConfirmed && careerLabGate}
        {!isNew && applicationWorkspaceTab === "interviews" && interviewConfirmed && (
          <div className="interview-workspace">
            <section className="interview-workspace-heading"><div><p className="eyebrow">Full interview path</p><h2>Every likely stage, in order.</h2><p>Confirmed signals are separated from predictions. Update stages as soon as the recruiter provides the exact process.</p></div><div><strong>{prep.expectedNextInterviewDate ? `${prep.expectedDateConfirmed ? "Confirmed" : "Estimated"}: ${formatHumanDate(prep.expectedNextInterviewDate)}` : "Date not scheduled"}</strong><span>{prep.expectedDateConfirmed ? "Confirmed scheduling signal" : `Planning estimate · ${prep.expectedDateConfidence} confidence`}</span></div></section>
            <section className="interview-stage-list">
              {stages.map((stage, index) => (
                <article className={`interview-stage stage-${stage.state.toLowerCase()}`} key={`${stage.title}-${index}`}>
                  <div className="stage-index"><span>{stage.state === "Completed" ? "✓" : index + 1}</span><i /></div>
                  <div className="stage-body">
                    <div className="stage-title-row"><div><small>{stage.state}</small><h3>{stage.title}</h3></div><span className={stage.confirmed ? "signal-confirmed" : "signal-predicted"}>{stage.confirmed ? "Confirmed / signal-backed" : "Predicted"}</span></div>
                    <p>{stage.detail}</p>
                    <div className="stage-prep"><span>Preparation</span><p>{stage.prep}</p></div>
                  </div>
                </article>
              ))}
            </section>
            <section className="interview-kit-grid">
              <article className="workspace-panel"><p className="eyebrow">Likely questions</p><h2>What to rehearse</h2><p className="preformatted">{prep.likelyQuestions || "Tell me about yourself.\nWhy this company and role?\nDescribe a system you built end to end.\nWalk through a difficult tradeoff, failure mode, and test strategy."}</p></article>
              <article className="workspace-panel"><p className="eyebrow">Technical proof</p><h2>Stories to use</h2><p className="preformatted">{prep.technicalStories || match.matchedCapabilities.map((item, index) => `${index + 1}. ${item.evidence}`).join("\n")}</p></article>
              <article className="workspace-panel"><p className="eyebrow">Questions to ask</p><h2>Evaluate the team too</h2><p className="preformatted">{prep.questionsToAsk || "What would this engineer own in the first 90 days?\nHow does the team evaluate correctness and quality?\nWhat are the normal hours, on-call expectations, hybrid cadence, and growth path?"}</p></article>
              <article className="workspace-panel gap-panel"><p className="eyebrow">Risks and boundaries</p><h2>Stay accurate</h2><p className="preformatted">{prep.risksAndBoundaries || match.gaps.join("\n")}</p></article>
            </section>
          </div>
        )}

        {(isNew || applicationWorkspaceTab === "edit") && (
          <form className="workspace-editor" onSubmit={saveApplication}>
            {application.sheetSynced && <div className="sheet-record-note"><b>Stored in the Job Hub backend.</b><span>{application.nextAction ? `Next action: ${application.nextAction}` : "No next action is set."}{application.latestEmailSubject ? ` · Latest email: ${application.latestEmailSubject}` : ""}</span><span>Edits save directly to the backend; the workbook is only an optional backup.</span></div>}
            <section className="workspace-panel">
              <div className="screening-prep-heading"><div><p className="eyebrow">Application record</p><h2>{isNew ? "Add the role" : "Role and pipeline data"}</h2></div></div>
              <fieldset className="form-grid">
                <label>Company<input required autoFocus value={application.company} onChange={(event) => setApplicationDraft({ ...application, company: event.target.value })} /></label>
                <label>Role<input required value={application.role} onChange={(event) => setApplicationDraft({ ...application, role: event.target.value })} /></label>
                <label>Location<input value={application.location} onChange={(event) => setApplicationDraft({ ...application, location: event.target.value })} /></label>
                <label>Status<select value={application.status} onChange={(event) => setApplicationDraft({ ...application, status: event.target.value as ApplicationStatus })}>{applicationStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                <label>Applied date<input type="date" value={application.appliedDate} onChange={(event) => setApplicationDraft({ ...application, appliedDate: event.target.value })} /></label>
                <label>Earliest recruiter outreach<input type="date" value={application.followUpDate} onChange={(event) => setApplicationDraft({ ...application, followUpDate: event.target.value })} /></label>
                <label>Minimum base<input type="number" placeholder="150000" value={application.salaryMin} onChange={(event) => setApplicationDraft({ ...application, salaryMin: event.target.value })} /></label>
                <label>Maximum base<input type="number" placeholder="210000" value={application.salaryMax} onChange={(event) => setApplicationDraft({ ...application, salaryMax: event.target.value })} /></label>
                <label>Source<input placeholder="Company careers, referral…" value={application.source} onChange={(event) => setApplicationDraft({ ...application, source: event.target.value })} /></label>
                <label>Priority<select value={application.priority} onChange={(event) => setApplicationDraft({ ...application, priority: event.target.value as Application["priority"] })}><option>High</option><option>Medium</option><option>Low</option></select></label>
                <label className="form-wide">Job URL<input type="url" placeholder="https://" value={application.link} onChange={(event) => setApplicationDraft({ ...application, link: event.target.value })} /></label>
                <label className="form-wide">Next action / notes<textarea rows={4} value={application.notes} onChange={(event) => setApplicationDraft({ ...application, notes: event.target.value })} /></label>
              </fieldset>
            </section>
            <section className="screening-prep-editor workspace-panel" aria-labelledby="workspace-screening-prep-title">
              <div className="screening-prep-heading">
                <div><p className="eyebrow">Company-interest system</p><h2 id="workspace-screening-prep-title">Recruiter and interview research</h2><p>These fields power the full Career Lab and stage-by-stage interview view.</p></div>
                <label>Status<select value={prep.status} onChange={(event) => updateScreeningPrep("status", event.target.value as CompanyScreeningPrep["status"])}><option>Not started</option><option>Researching</option><option>Ready to rehearse</option><option>Rehearsed</option></select></label>
              </div>
              <fieldset className="screening-prep-grid">
                <label>Research date<input type="date" value={prep.researchedAt} onChange={(event) => updateScreeningPrep("researchedAt", event.target.value)} /></label>
                <label className="prep-wide">Company snapshot<textarea rows={4} value={prep.companySnapshot} onChange={(event) => updateScreeningPrep("companySnapshot", event.target.value)} placeholder="Products, customers, scale, strategy, and current context" /></label>
                <label className="prep-wide">Why this company<textarea rows={5} value={prep.whyCompany} onChange={(event) => updateScreeningPrep("whyCompany", event.target.value)} placeholder="Specific, product-grounded motivation" /></label>
                <label className="prep-wide">60-second recruiter pitch<textarea rows={5} value={prep.recruiterPitch} onChange={(event) => updateScreeningPrep("recruiterPitch", event.target.value)} /></label>
                <label className="prep-wide">Role-fit map<textarea rows={7} value={prep.roleFit} onChange={(event) => updateScreeningPrep("roleFit", event.target.value)} placeholder={'Verified matches: …\nMissing requirements: …\nTransferable evidence: …\nFirst 30-day ramp plan: …'} /></label>
                <label className="prep-wide">Technical proof stories<textarea rows={7} value={prep.technicalStories} onChange={(event) => updateScreeningPrep("technicalStories", event.target.value)} /></label>
                <label className="prep-wide">Likely questions<textarea rows={7} value={prep.likelyQuestions} onChange={(event) => updateScreeningPrep("likelyQuestions", event.target.value)} /></label>
                <label className="prep-wide">Likely interviewer follow-up questions<textarea rows={9} value={prep.followUpQuestions} onChange={(event) => updateScreeningPrep("followUpQuestions", event.target.value)} placeholder="Prepared from the exact role, job description, and verified evidence" /></label>
                <label className="prep-wide">Follow-up answer anchors and truth boundaries<textarea rows={9} value={prep.followUpAnswerPlan} onChange={(event) => updateScreeningPrep("followUpAnswerPlan", event.target.value)} placeholder="Ownership, mechanism, verified proof, tradeoff, and honest boundary" /></label>
                <label className="prep-wide">Questions to ask<textarea rows={6} value={prep.questionsToAsk} onChange={(event) => updateScreeningPrep("questionsToAsk", event.target.value)} /></label>
                <label className="prep-wide">Expected interview process<textarea rows={4} value={prep.interviewProcess} onChange={(event) => updateScreeningPrep("interviewProcess", event.target.value)} /></label>
                <label className="prep-wide">Predicted next interview<textarea rows={3} value={prep.predictedNextStep} onChange={(event) => updateScreeningPrep("predictedNextStep", event.target.value)} /></label>
                <label>Expected next date<input type="date" value={prep.expectedNextInterviewDate} onChange={(event) => updateScreeningPrep("expectedNextInterviewDate", event.target.value)} /></label>
                <label className="checkbox-label"><input type="checkbox" checked={prep.expectedDateConfirmed} onChange={(event) => updateScreeningPrep("expectedDateConfirmed", event.target.checked)} /> Date confirmed by recruiter</label>
                <label>Prediction confidence<select value={prep.expectedDateConfidence} onChange={(event) => updateScreeningPrep("expectedDateConfidence", event.target.value as CompanyScreeningPrep["expectedDateConfidence"])}><option>Low</option><option>Medium</option><option>High</option></select></label>
                <label className="prep-wide">Prediction basis<textarea rows={4} value={prep.predictionBasis} onChange={(event) => updateScreeningPrep("predictionBasis", event.target.value)} placeholder="Separate confirmed evidence from inference" /></label>
                <label className="prep-wide">Full interview pipeline<textarea rows={9} value={prep.fullPipelinePlan} onChange={(event) => updateScreeningPrep("fullPipelinePlan", event.target.value)} /></label>
                <label className="prep-wide">Stage-by-stage preparation plan<textarea rows={9} value={prep.preparationPlan} onChange={(event) => updateScreeningPrep("preparationPlan", event.target.value)} /></label>
                <label className="prep-wide">Reusable recruiter narrative<textarea rows={6} value={prep.recruiterNarrative} onChange={(event) => updateScreeningPrep("recruiterNarrative", event.target.value)} /></label>
                <label>Last Gmail check<input type="date" value={prep.lastMailboxCheck} onChange={(event) => updateScreeningPrep("lastMailboxCheck", event.target.value)} /></label>
                <label className="prep-wide">Mailbox signal<textarea rows={4} value={prep.mailboxSignal} onChange={(event) => updateScreeningPrep("mailboxSignal", event.target.value)} /></label>
                <label className="prep-wide">Risks and truth boundaries<textarea rows={5} value={prep.risksAndBoundaries} onChange={(event) => updateScreeningPrep("risksAndBoundaries", event.target.value)} /></label>
                <label className="prep-wide">Research sources<textarea rows={5} value={prep.sources} onChange={(event) => updateScreeningPrep("sources", event.target.value)} /></label>
                <label className="prep-wide">Readiness checklist<textarea rows={9} value={prep.checklist} onChange={(event) => updateScreeningPrep("checklist", event.target.value)} /></label>
              </fieldset>
            </section>
            <div className="workspace-editor-actions">
              {application.id && <button type="button" className="danger-link" onClick={() => deleteApplication(application)}>Delete</button>}
              <span />
              <button type="button" className="secondary-button" onClick={() => { if (isNew) { setApplicationDraft(null); setView("applications"); } else { setApplicationDraft(applications.find((item) => item.id === application.id) || application); setApplicationWorkspaceTab("overview"); } }}>Cancel</button>
              <button className="primary-button" type="submit">Save application</button>
            </div>
          </form>
        )}
      </section>
    );
  }

  function renderPrep() {
    const weekProblems = interviewPlan.filter((problem) => problem.week === prepWeek);
    const completedInWeek = weekProblems.filter((problem) => ["Solved with Hint", "Solved Independently"].includes(progress[String(problem.id)]?.status)).length;
    const interviewPipeline = applications
      .filter(hasConfirmedInterview)
      .sort((a, b) => {
        const aDate = a.screeningPrep?.expectedNextInterviewDate || "9999-12-31";
        const bDate = b.screeningPrep?.expectedNextInterviewDate || "9999-12-31";
        return aDate.localeCompare(bDate);
      });
    return (
      <>
        <section className="page-heading prep-heading">
          <div><p className="eyebrow">{interviewPlan.length}-day interview plan</p><h1>Practice with a reason.</h1><p>The full Blind 75 is included alongside SQL, backend-design, graph, and role-specific practice for your target jobs.</p></div>
          <div className="prep-summary"><strong>{solvedCount}/{interviewPlan.length}</strong><span>problems complete</span><small>{formatTimer(totalPrepSeconds)} logged to the second</small></div>
        </section>
        <section className="prep-controls">
          <label>Plan start<input type="date" value={settings.startDate} onChange={(event) => setSettings({ ...settings, startDate: event.target.value })} /></label>
          <label>Primary language<select value={settings.primaryLanguage} onChange={(event) => setSettings({ ...settings, primaryLanguage: event.target.value })}><option>Python 3</option><option>TypeScript</option><option>Java</option><option>C++</option></select></label>
          <div className="blind75-coverage"><strong>{blind75CoverageCount}/{BLIND_75_TOTAL}</strong><span>Blind 75 included</span></div>
          <div className="privacy-note">Notes and progress stay on this device.</div>
        </section>
        <section className="interview-pipeline" aria-labelledby="interview-pipeline-title">
          <div className="pipeline-heading">
            <div><p className="eyebrow">Predicted interview queue</p><h2 id="interview-pipeline-title">Prepare in expected-date order.</h2><p>Email and recruiter signals outrank estimates. Unconfirmed dates are clearly labeled and should be replaced as soon as scheduling arrives.</p></div>
          </div>
          <div className="pipeline-list">
            {interviewPipeline.length ? interviewPipeline.map((application) => {
              const prep = application.screeningPrep || emptyScreeningPrep;
              return (
                <article className="pipeline-card" key={application.id}>
                  <div className="pipeline-date">
                    <span>{prep.expectedNextInterviewDate ? `${prep.expectedDateConfirmed ? "Confirmed" : "Estimated"}: ${formatHumanDate(prep.expectedNextInterviewDate)}` : "Date not scheduled"}</span>
                    <small>{prep.expectedDateConfirmed ? "Confirmed scheduling signal" : prep.expectedNextInterviewDate ? `${prep.expectedDateConfidence} confidence planning estimate` : "No confirmed recruiter or interview date"}</small>
                  </div>
                  <div className="pipeline-copy">
                    <p className="eyebrow">{application.company}</p><h3>{application.role}</h3>
                    <strong>{prep.predictedNextStep || application.nextAction || "Confirm the next stage"}</strong>
                    <p>{prep.mailboxSignal || "No mailbox signal has been recorded yet."}</p>
                    <div className="pipeline-actions"><button className="secondary-button" onClick={() => openApplication(application, "interviews")}>Open full pipeline</button>{application.link && <a className="text-button" href={application.link} target="_blank" rel="noreferrer">Job posting ↗</a>}</div>
                  </div>
                </article>
              );
            }) : <article className="pipeline-empty"><h3>No active interviews yet.</h3><p>When a recruiter or scheduling signal arrives, attach a prediction, confidence level, and stage-by-stage preparation plan to the application.</p></article>}
          </div>
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
    const agentBaseUrlReady = isAllowedAgentBaseUrl(agentBaseUrl);
    const agentPrivateRootReady = isSafePrivateRoot(agentPrivateRoot);
    const agentGuide = buildCodexGuide({ baseUrl: agentBaseUrl, privateRoot: agentPrivateRoot });
    return (
      <>
        <section className="page-heading"><div><p className="eyebrow">Your data</p><h1>Private and synced.</h1><p>Applications, coding progress, journals, settings, and AI scores now live in your private Sites database and follow you across devices.</p></div></section>
        <section className="data-grid">
          <article className="data-card local-journal-card">
            <div className="data-icon">⌂</div>
            <div>
              <div className="data-card-title-row">
                <div><h2>Sites database</h2><p>Your full Job Hub state is saved to the backend automatically. The local Excel journal remains an optional extra backup when you run the app on a Mac.</p></div>
                <span className={`backup-status-badge sync-${localJournalBackup.status}`}>{localJournalBackup.status === "saved" ? "Saved" : localJournalBackup.status === "saving" ? "Saving" : localJournalBackup.status === "error" ? "Needs attention" : "Ready"}</span>
              </div>
              <div className="local-backup-paths">
                <code className="local-workbook-path">{localJournalBackup.xlsxPath}</code>
              </div>
              <p className={`backup-status-message sync-${localJournalBackup.status}`}>{localJournalBackup.message}</p>
              <div className="button-row">
                <button className="primary-button" disabled={localJournalBackup.status === "saving"} onClick={() => void backupAllJournalsLocally()}>{localJournalBackup.status === "saving" ? "Updating workbook…" : "Update workbook now"}</button>
              </div>
              <small className="local-backup-note">Companion recovery files: <code>{localJournalBackup.jsonPath}</code> and <code>{localJournalBackup.csvPath}</code>.</small>
            </div>
          </article>
          <article className="data-card agent-setup-card">
            <div className="data-icon">⌘</div>
            <div>
              <div className="data-card-title-row">
                <div><p className="eyebrow">Agent onboarding</p><h2>Connect another Codex safely.</h2><p>Each operator supplies their own deployed backend, runtime-only Sites token, and private save path. The token is never synced to Job Hub, written to persistent browser storage, included in a download, or committed to Git.</p></div>
                <span className={`agent-connection-badge connection-${agentConnection.status}`}>{agentConnection.status === "verified" ? "Verified" : agentConnection.status === "checking" ? "Checking" : agentConnection.status === "error" ? "Needs attention" : "Not verified"}</span>
              </div>
              <div className="agent-setup-fields">
                <label><span>Job Hub backend URL</span><input type="url" value={agentBaseUrl} onChange={(event) => updateAgentBaseUrl(event.target.value)} placeholder="https://your-job-hub.example.com" spellCheck={false} /><small>{agentBaseUrlReady ? "HTTPS backend accepted." : "Use HTTPS, or localhost for local development."}</small></label>
                <label><span>Private local save path</span><input type="text" value={agentPrivateRoot} onChange={(event) => updateAgentPrivateRoot(event.target.value)} placeholder="private-data/job-hub" spellCheck={false} /><small>{agentPrivateRootReady ? "Dedicated private path accepted." : "Choose private-data/… or a dedicated absolute folder; broad roots are blocked."}</small></label>
                <label><span>Sites runtime token</span><div className="agent-token-input"><input type={agentTokenVisible ? "text" : "password"} value={agentToken} onChange={(event) => updateAgentToken(event.target.value)} placeholder="Paste this deployment's token" autoComplete="off" spellCheck={false} /><button type="button" className="text-button" onClick={() => setAgentTokenVisible((visible) => !visible)}>{agentTokenVisible ? "Hide" : "Show"}</button></div><small>Held only in sessionStorage for this tab and cleared when the tab session ends.</small></label>
              </div>
              <div className={`agent-connection-status connection-${agentConnection.status}`}><span />{agentConnection.message}</div>
              <div className="agent-setup-actions">
                <button className="primary-button" onClick={() => void verifyAgentAccess()} disabled={!agentBaseUrlReady || !agentToken.trim() || agentConnection.status === "checking"}>{agentConnection.status === "checking" ? "Verifying…" : "Verify read-only access"}</button>
                <button className="secondary-button" onClick={() => void copyAgentRuntimeSetup()} disabled={!agentBaseUrlReady || !agentPrivateRootReady}>Copy terminal setup</button>
                <button className="secondary-button" onClick={() => void copyCodexGuide()} disabled={!agentBaseUrlReady || !agentPrivateRootReady}>Copy Codex guide</button>
                <button className="secondary-button" onClick={downloadCodexGuide} disabled={!agentBaseUrlReady || !agentPrivateRootReady}>Download AGENTS.md</button>
                <button className="text-button" onClick={clearAgentToken} disabled={!agentToken}>Clear token</button>
              </div>
              <p className="agent-secret-note"><strong>Safe handoff:</strong> the copied terminal setup prompts for the token in the shell, so the secret is not embedded in the command. The generated AGENTS.md contains only the backend URL, private path, exact-ID workflow, and security rules.</p>
              <details className="agent-guide-preview"><summary>Preview generated Codex instructions</summary><pre>{agentGuide}</pre></details>
            </div>
          </article>
          <article className="data-card featured"><div className="data-icon">↓</div><div><h2>Export a backup</h2><p>Download applications, coding progress, journals, and settings as one JSON file.</p><button className="primary-button" onClick={exportBackup}>Download backup</button></div></article>
          <article className="data-card"><div className="data-icon">↑</div><div><h2>Import data</h2><p>Restore a Job Hub JSON backup, or import an Applications CSV from your spreadsheet.</p><button className="secondary-button" onClick={() => fileInputRef.current?.click()}>Choose JSON or CSV</button></div></article>
          <article className="data-card"><div className="data-icon">↻</div><div><h2>Backend connection</h2><p>{sheetSync.status === "connected" ? `${sheetSync.rowCount} applications are stored in ${sheetSync.workbook}. ${liveSyncConnected ? "Changes are saving automatically." : "The connection is being restored."}` : sheetSync.message}</p><button className="secondary-button" onClick={() => window.location.reload()}>Refresh from backend</button></div></article>
          <article className="data-card"><div className="data-icon">↺</div><div><h2>Restore demo</h2><p>Bring back three clearly labeled sample applications and reset the coding plan.</p><button className="secondary-button" onClick={resetDemo}>Restore demo data</button></div></article>
          <article className="data-card danger-card"><div className="data-icon">×</div><div><h2>Clear synced data</h2><p>Remove all applications and prep journals from the private backend and this browser. This cannot be undone.</p><button className="danger-button" onClick={clearAll}>Clear everything</button></div></article>
        </section>
        <section className="import-guide"><p className="eyebrow">CSV import columns</p><h2>Works with a simple application export.</h2><p>Job Hub recognizes columns such as <code>Company</code>, <code>Role</code>, <code>Location</code>, <code>Status</code>, <code>Application Date</code>, <code>Min Base</code>, <code>Max Base</code>, <code>Source</code>, <code>Job URL</code>, and <code>Notes</code>.</p></section>
      </>
    );
  }

  if (!ready) return <div className="app-loading">Opening Job Hub…</div>;
  const currentIndependenceScore = independenceScore(problemDraft);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span>JH</span><div><strong>Job Hub</strong><small>Local workspace</small></div></div>
        <nav aria-label="Main navigation">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span>01</span>Overview</button>
          <button className={view === "matches" ? "active" : ""} onClick={() => setView("matches")}><span>02</span>Exceptions</button>
          <button className={view === "sourcing" ? "active" : ""} onClick={() => setView("sourcing")}><span>03</span>Sourcing</button>
          <button className={view === "career" ? "active" : ""} onClick={() => setView("career")}><span>04</span>Career lab</button>
          <button className={["applications", "application"].includes(view) ? "active" : ""} onClick={() => setView("applications")}><span>05</span>Applications</button>
          <button className={view === "funnel" ? "active" : ""} onClick={() => setView("funnel")}><span>06</span>Funnel health</button>
          <button className={view === "prep" ? "active" : ""} onClick={() => setView("prep")}><span>07</span>Interview prep</button>
          <button className={view === "data" ? "active" : ""} onClick={() => setView("data")}><span>08</span>Data & backup</button>
        </nav>
        <div className="sidebar-foot"><span className={`local-dot ${sheetSync.status === "error" ? "has-error" : ""}`} />{sheetSync.status === "connected" ? "Backend connected" : "Local fallback"}<button onClick={exportBackup}>Export backup</button></div>
      </aside>
      <main className="main-content">
        <header className="mobile-header"><div className="brand-mark"><span>JH</span><strong>Job Hub</strong></div><select value={view === "application" ? "applications" : view} onChange={(event) => setView(event.target.value as View)} aria-label="Choose page"><option value="overview">Overview</option><option value="matches">Exceptions</option><option value="sourcing">Sourcing</option><option value="career">Career lab</option><option value="applications">Applications</option><option value="funnel">Funnel health</option><option value="prep">Interview prep</option><option value="data">Data & backup</option></select></header>
        {view === "overview" && renderOverview()}
        {view === "matches" && renderMatches()}
        {view === "sourcing" && renderSourcing()}
        {view === "career" && renderCareerLab()}
        {view === "applications" && renderApplications()}
        {view === "application" && renderApplicationWorkspace()}
        {view === "funnel" && renderFunnelHealth()}
        {view === "prep" && renderPrep()}
        {view === "data" && renderData()}
      </main>

      <input ref={fileInputRef} className="hidden-input" type="file" accept=".json,.csv,text/csv,application/json" onChange={importFile} />
      {toast && <div className="toast" role="status">{toast}</div>}
      {journalSync.status !== "idle" && <div className={`journal-sync-indicator sync-${journalSync.status}`} role="status"><span /><div><strong>{journalSync.status === "saving" ? "Saving journals" : journalSync.status === "queued" ? "Journals queued" : journalSync.status === "saved" ? "Journals saved" : "Sync needs attention"}</strong><small>{journalSync.message}</small></div>{journalSync.pending > 0 && <b>{journalSync.pending}</b>}</div>}


      {selectedProblem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProblem(null)}>
          <section className="modal-panel journal-modal" role="dialog" aria-modal="true" aria-labelledby="journal-title">
            <div className="modal-header"><div><p className="eyebrow">Day {selectedProblem.day} · Week {selectedProblem.week}</p><h2 id="journal-title">{selectedProblem.title}</h2><p>{selectedProblem.pattern} · {selectedProblem.targetMinutes} minute target</p></div><button className="close-button" onClick={() => setSelectedProblem(null)} aria-label="Close">×</button></div>
            <div className="journal-callout"><strong>Recognition cue</strong><span>{selectedProblem.cue}</span><a href={selectedProblem.url} target="_blank" rel="noreferrer">Open LeetCode ↗</a></div>
            <div className="journal-status-row">
              <JournalField id="journal-status" label="Status"><select id="journal-status" value={problemDraft.status} onChange={(event) => setProblemDraft({ ...problemDraft, status: event.target.value as PrepStatus, codeReview: null })}><option>Not Started</option><option>Attempted</option><option>Solved with Hint</option><option>Solved Independently</option></select></JournalField>
              <JournalField id="journal-confidence" label="Confidence"><select id="journal-confidence" value={problemDraft.confidence} onChange={(event) => setProblemDraft({ ...problemDraft, confidence: Number(event.target.value), codeReview: null })}><option value="0">Not rated</option><option value="1">1 — Cannot reproduce</option><option value="2">2 — Need notes</option><option value="3">3 — Mostly clear</option><option value="4">4 — Can re-code</option><option value="5">5 — Can explain cold</option></select></JournalField>
              <JournalField id="journal-time-minutes" label="Time logged">
                <div className="duration-input-group">
                  <div className="duration-input">
                    <input id="journal-time-minutes" aria-label="Time logged minutes" aria-describedby="journal-time-preview" type="number" min="0" step="1" inputMode="numeric" value={Math.floor((problemDraft.totalSeconds || problemDraft.minutes * 60) / 60)} onChange={(event) => updateLoggedTime(Number(event.target.value), (problemDraft.totalSeconds || problemDraft.minutes * 60) % 60)} />
                    <span>min</span>
                  </div>
                  <b aria-hidden="true">:</b>
                  <div className="duration-input">
                    <input aria-label="Time logged seconds" aria-describedby="journal-time-preview" type="number" min="0" max="59" step="1" inputMode="numeric" value={(problemDraft.totalSeconds || problemDraft.minutes * 60) % 60} onChange={(event) => updateLoggedTime(Math.floor((problemDraft.totalSeconds || problemDraft.minutes * 60) / 60), Number(event.target.value))} />
                    <span>sec</span>
                  </div>
                  <small id="journal-time-preview">{formatTimer(problemDraft.totalSeconds || problemDraft.minutes * 60)} total</small>
                </div>
              </JournalField>
            </div>
            <div className={`journal-timer ${timerRunning && timerProblemId === selectedProblem.id ? "is-running" : ""}`}>
              <div className="journal-timer-clock"><span>Total practice time</span><strong>{formatTimer((problemDraft.totalSeconds || problemDraft.minutes * 60) + (timerRunning && timerProblemId === selectedProblem.id ? timerSeconds : 0))}</strong></div>
              <p>{timerRunning && timerProblemId === selectedProblem.id ? "Timing this attempt to the second. Stop when you finish to save the exact duration." : "Start here and keep the journal open while you solve. Every elapsed second is saved when you stop."}</p>
              {!timerRunning || timerProblemId !== selectedProblem.id ? (
                <button type="button" className="journal-timer-button" onClick={() => startTimer(selectedProblem)}>▶ Start timer</button>
              ) : (
                <button type="button" className="journal-timer-button is-stop" onClick={stopTimer}>■ Stop & add time</button>
              )}
            </div>
            <div className="journal-grid">
              <JournalField id="brute-force-approach" className="journal-wide" label="My brute-force approach" generateHint={() => generateJournalHint("brute-force-approach", "My brute-force approach", problemDraft.naiveApproach)} penalizeHint onHintShown={() => recordHintUse("brute-force-approach")}><textarea id="brute-force-approach" aria-describedby="brute-force-approach-hint" rows={4} value={problemDraft.naiveApproach} onChange={(event) => setProblemDraft({ ...problemDraft, naiveApproach: event.target.value, codeReview: null })} placeholder="What would the brute-force solution do, step by step?" /></JournalField>
              <JournalField id="brute-force-time" label="Brute-force time complexity" generateHint={() => generateJournalHint("brute-force-time", "Brute-force time complexity", problemDraft.bruteForceTimeComplexity)} penalizeHint onHintShown={() => recordHintUse("brute-force-time")}><textarea id="brute-force-time" aria-describedby="brute-force-time-hint" rows={2} value={problemDraft.bruteForceTimeComplexity} onChange={(event) => setProblemDraft({ ...problemDraft, bruteForceTimeComplexity: event.target.value, codeReview: null })} placeholder="Example: O(n²), because…" /></JournalField>
              <JournalField id="brute-force-space" label="Brute-force space complexity" generateHint={() => generateJournalHint("brute-force-space", "Brute-force space complexity", problemDraft.bruteForceSpaceComplexity)} penalizeHint onHintShown={() => recordHintUse("brute-force-space")}><textarea id="brute-force-space" aria-describedby="brute-force-space-hint" rows={2} value={problemDraft.bruteForceSpaceComplexity} onChange={(event) => setProblemDraft({ ...problemDraft, bruteForceSpaceComplexity: event.target.value, codeReview: null })} placeholder="Example: O(1) auxiliary space, because…" /></JournalField>
              <JournalField id="journal-invariant" className="journal-wide" label="Key invariant / decision rule" generateHint={() => generateJournalHint("journal-invariant", "Key invariant / decision rule", problemDraft.invariant)} penalizeHint onHintShown={() => recordHintUse("journal-invariant")}><textarea id="journal-invariant" aria-describedby="journal-invariant-hint" rows={4} value={problemDraft.invariant} onChange={(event) => setProblemDraft({ ...problemDraft, invariant: event.target.value, codeReview: null })} placeholder="What stays true after every step, and why is each choice safe?" /></JournalField>
              <JournalField id="optimal-steps" className="journal-wide" label="Optimal algorithm steps" generateHint={() => generateJournalHint("optimal-steps", "Optimal algorithm steps", problemDraft.solutionSteps)} penalizeHint onHintShown={() => recordHintUse("optimal-steps")}><textarea id="optimal-steps" aria-describedby="optimal-steps-hint" rows={5} value={problemDraft.solutionSteps} onChange={(event) => setProblemDraft({ ...problemDraft, solutionSteps: event.target.value, codeReview: null })} placeholder="Write the optimized algorithm step by step in plain English." /></JournalField>
              <JournalField id="optimal-time" label="Optimal time complexity" generateHint={() => generateJournalHint("optimal-time", "Optimal time complexity", problemDraft.optimalTimeComplexity)} penalizeHint onHintShown={() => recordHintUse("optimal-time")}><textarea id="optimal-time" aria-describedby="optimal-time-hint" rows={2} value={problemDraft.optimalTimeComplexity} onChange={(event) => setProblemDraft({ ...problemDraft, optimalTimeComplexity: event.target.value, codeReview: null })} placeholder="Example: O(n), because each item…" /></JournalField>
              <JournalField id="optimal-space" label="Optimal space complexity" generateHint={() => generateJournalHint("optimal-space", "Optimal space complexity", problemDraft.optimalSpaceComplexity)} penalizeHint onHintShown={() => recordHintUse("optimal-space")}><textarea id="optimal-space" aria-describedby="optimal-space-hint" rows={2} value={problemDraft.optimalSpaceComplexity} onChange={(event) => setProblemDraft({ ...problemDraft, optimalSpaceComplexity: event.target.value, codeReview: null })} placeholder="State auxiliary space and explain it." /></JournalField>
              <JournalField id="edge-cases" label="Edge cases & tests" generateHint={() => generateJournalHint("edge-cases", "Edge cases & tests", problemDraft.edgeCases)} penalizeHint onHintShown={() => recordHintUse("edge-cases")}><textarea id="edge-cases" aria-describedby="edge-cases-hint" rows={3} value={problemDraft.edgeCases} onChange={(event) => setProblemDraft({ ...problemDraft, edgeCases: event.target.value, codeReview: null })} placeholder="Empty, duplicates, boundaries…" /></JournalField>
              <JournalField id="mistakes" label="Mistakes / bug cause"><textarea id="mistakes" rows={3} value={problemDraft.mistakes} onChange={(event) => setProblemDraft({ ...problemDraft, mistakes: event.target.value, codeReview: null })} placeholder="What went wrong and why?" /></JournalField>
            </div>
            <section className="code-review-lab" aria-labelledby="code-review-heading">
              <div className="code-review-heading">
                <div><p className="eyebrow">AI submission coach</p><h3 id="code-review-heading">Score your full {problemDraft.codeLanguage || settings.primaryLanguage} submission.</h3><p>AI reviews your brute force, optimal algorithm, all four complexity answers, edge cases, mistakes, and code as separate evidence.</p></div>
                <span className="online-badge"><i />Online research</span>
              </div>
              <div className="independence-panel">
                <div><p className="eyebrow">Independent work score</p><strong>Hints and final submission are scored separately.</strong><span>Each unique solution hint costs {HINT_PENALTY} points. Reopening the same hint does not cost more.</span></div>
                <div className="independence-value"><strong>{currentIndependenceScore}</strong><span>/100</span><small>{problemDraft.hintsUsed.length} hint{problemDraft.hintsUsed.length === 1 ? "" : "s"} used</small></div>
              </div>
              <div className="code-review-controls">
                <label className="language-select-field">
                  <span>Solution language</span>
                  <span className="language-select-shell">
                    <b aria-hidden="true">{languageBadge(problemDraft.codeLanguage || settings.primaryLanguage)}</b>
                    <select aria-label="Solution language" value={problemDraft.codeLanguage || settings.primaryLanguage} onChange={(event) => setProblemDraft({ ...problemDraft, codeLanguage: event.target.value, codeReview: null })}><option>Python 3</option><option>TypeScript</option><option>JavaScript</option><option>Java</option><option>C++</option><option>C#</option><option>Go</option><option>Rust</option><option>Swift</option><option>Kotlin</option></select>
                    <i aria-hidden="true" />
                  </span>
                </label>
                <span>Your code and journal answers are sent to OpenAI only when you request a review.</span>
                <button className="review-button" disabled={reviewRunning || !hasReviewableInput(problemDraft)} onClick={() => void evaluateCode()}>{reviewRunning ? "Scoring your work…" : problemDraft.codeReview ? "Score again" : "Score all my work"}</button>
              </div>
              <JournalField id="solution-code" className="code-input-label" label={`Paste your ${problemDraft.codeLanguage || settings.primaryLanguage} solution`}><textarea id="solution-code" className="code-input" rows={14} spellCheck={false} value={problemDraft.code} onChange={(event) => setProblemDraft({ ...problemDraft, code: event.target.value, codeReview: null })} placeholder={`Paste your ${problemDraft.codeLanguage || settings.primaryLanguage} solution here…`} /></JournalField>
              {reviewRunning && <div className="review-loading" role="status"><span /><div><strong>Checking your code and reasoning…</strong><small>This usually takes under a minute.</small></div></div>}
              {reviewError && <div className="review-error" role="alert"><strong>Review could not run</strong><span>{reviewError}</span><small>Your journal stays saved in this browser. If the connection message repeats, confirm Job Hub is still running locally and refresh.</small></div>}
              {problemDraft.codeReview && (
                <div className="review-result">
                  {problemDraft.codeReview.hints && problemDraft.codeReview.hints.length > 0 && (
                    <div className="hint-section hint-section-priority">
                      <div className="review-section-title"><p className="eyebrow">Progressive hints first</p><h4>Try these before reading your grade</h4></div>
                      <p className="hint-section-intro">Open one hint at a time, make another attempt, then continue to the grading details below.</p>
                      <div className="hint-ladder">{problemDraft.codeReview.hints.map((hint, index) => <details key={`${hint.level}-${index}`} onToggle={(event) => event.currentTarget.open && recordHintUse(`ai-review-hint-${index}`)}><summary><span>{index + 1}</span><strong>{hint.level}</strong><small>Reveal · −{HINT_PENALTY} independence</small></summary><p>{hint.text}</p></details>)}</div>
                    </div>
                  )}
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
                    <p className="eyebrow">Communication feedback</p>
                    <div><strong>Strong point</strong><span>{problemDraft.codeReview.interviewFeedback.strongPoint}</span></div>
                    <div><strong>Improve</strong><span>{problemDraft.codeReview.interviewFeedback.improve}</span></div>
                    <div><strong>Clear answer outline</strong><span>{problemDraft.codeReview.interviewFeedback.explanationOutline}</span></div>
                  </div>
                  {problemDraft.codeReview.explanationReview && (
                    <div className="explanation-review-card">
                      <div><p className="eyebrow">Your written reasoning</p><h4>Communication review</h4><p>{problemDraft.codeReview.explanationReview.assessment}</p></div>
                      <section><strong>Accurate points</strong>{problemDraft.codeReview.explanationReview.accuratePoints.length > 0 ? <ul>{problemDraft.codeReview.explanationReview.accuratePoints.map((point) => <li key={point}>{point}</li>)}</ul> : <p>No clearly supported points were provided yet.</p>}</section>
                      <section><strong>Gaps to close</strong>{problemDraft.codeReview.explanationReview.gaps.length > 0 ? <ul>{problemDraft.codeReview.explanationReview.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p>No major communication gaps found.</p>}</section>
                      <section className="structure-suggestion"><strong>How to structure your next attempt</strong><p>{problemDraft.codeReview.explanationReview.structureSuggestion}</p></section>
                    </div>
                  )}
                  {problemDraft.codeReview.sources.length > 0 && <div className="review-sources"><span>References checked</span>{problemDraft.codeReview.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title} ↗</a>)}</div>}
                  <p className="review-disclaimer">AI feedback can be wrong and does not execute your code. Confirm with LeetCode tests before marking the problem solved.</p>
                </div>
              )}
            </section>
            <div className="modal-actions journal-save-actions"><span className="journal-autosave-note">Autosaves when you leave a field. Saves queue in the background. Open another question immediately.</span><button className="secondary-button" onClick={() => setSelectedProblem(null)}>Close</button><button className="secondary-button" onClick={saveAndOpenNextProblem}>Save &amp; next</button><button className="primary-button" onClick={saveProblemJournal}>Save journal</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
