/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import seedApplications from "../app/seed-applications.json";
import { createAiHint } from "../build/ai-hint";
import { codeReviewErrorMessage, createCodeReview } from "../build/local-code-review";
import { careerFollowUpErrorMessage, createCareerFollowUps } from "../build/career-lab-followups";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type JobHubState = {
  version: number;
  applications: Array<Record<string, unknown>>;
  progress: Record<string, unknown>;
  settings: Record<string, unknown>;
};

type ApplicationActionInput = {
  action?: "PREPARED" | "APPROVED" | "APPROVAL_REJECTED" | "SUBMITTED" | "BLOCKED" | "MAILBOX_CHECKED" | "STATUS_CHANGED" | "UPSERT";
  operation?: "PREPARED" | "APPROVED" | "APPROVAL_REJECTED" | "SUBMITTED" | "BLOCKED" | "MAILBOX_CHECKED" | "STATUS_CHANGED" | "UPSERT";
  approvalId?: string;
  idempotencyKey?: string;
  packageId?: string;
  applicationId?: string;
  company?: string;
  role?: string;
  recordedAt?: string;
  submittedAt?: string;
  directUrl?: string;
  confirmation?: string;
  immutableArtifactPath?: string;
  stableIdempotencyKey?: string;
  artifactPdfSha256?: string;
  uploadedPdfSha256?: string;
  replacesPackageId?: string;
  replacementReason?: string;
  reason?: string;
  retryInstruction?: string;
  mailboxSignal?: string;
  latestEmail?: string;
  latestEmailSubject?: string;
  confirmedStatus?: string;
  expectedNextInterviewDate?: string;
  expectedDateConfirmed?: boolean;
  application?: Record<string, unknown>;
  approvalPackage?: Record<string, unknown>;
};

type DiscoveryLeadStatus = "Discovered" | "Verified" | "Qualified" | "Rejected" | "Duplicate" | "Applied" | "Blocked";

type DiscoveryEventInput = {
  operation?: "SOURCE_SCAN_RECORDED" | "LEAD_UPSERT" | "LEAD_STATUS_CHANGED" | "DISCOVERY_RUN_RECORDED";
  eventId?: string;
  idempotencyKey?: string;
  source?: string;
  recordedAt?: string;
  scan?: {
    queries?: string[];
    resultsFound?: number;
    qualifiedCount?: number;
    duplicateCount?: number;
    rejectedCount?: number;
    status?: "completed" | "partial" | "blocked";
    note?: string;
  };
  run?: {
    runId?: string;
    sourcesAttempted?: number;
    leadsFound?: number;
    leadsQualified?: number;
    applicationsSubmitted?: number;
    note?: string;
  };
  lead?: {
    id?: string;
    company?: string;
    role?: string;
    location?: string;
    status?: DiscoveryLeadStatus;
    sourceUrl?: string;
    officialUrl?: string;
    salaryMin?: string;
    salaryMax?: string;
    workModel?: string;
    experienceLevel?: string;
    publishedAt?: string;
    matchScore?: number;
    reason?: string;
    matchedApplicationId?: string;
    discoveredSources?: string[];
  };
};

const discoverySourceRegistry = [
  { key: "linkedin", name: "LinkedIn", lane: "Broad market", cadence: "Every run", verification: "Official employer posting required" },
  { key: "indeed", name: "Indeed", lane: "Broad market", cadence: "Every run", verification: "Official employer posting required" },
  { key: "wellfound", name: "Wellfound", lane: "Startup market", cadence: "Every run", verification: "Official employer posting required" },
  { key: "yc", name: "Y Combinator", lane: "Startup market", cadence: "Every run", verification: "Company or YC posting required" },
  { key: "built-in-sf", name: "Built In SF", lane: "Bay Area market", cadence: "Every run", verification: "Official employer posting required" },
  { key: "simplify", name: "Simplify", lane: "Early-career market", cadence: "Every run", verification: "Official employer posting required" },
  { key: "hiring-cafe", name: "HiringCafe", lane: "Broad market", cadence: "Rotating", verification: "Official employer posting required" },
  { key: "hacker-news", name: "Hacker News", lane: "Founder-direct", cadence: "Daily", verification: "Employer-authored post and official company evidence required" },
  { key: "ashby", name: "Ashby", lane: "Official ATS", cadence: "Every run", verification: "Direct posting" },
  { key: "greenhouse", name: "Greenhouse", lane: "Official ATS", cadence: "Every run", verification: "Direct posting" },
  { key: "lever", name: "Lever", lane: "Official ATS", cadence: "Every run", verification: "Direct posting" },
  { key: "workday", name: "Workday", lane: "Official ATS", cadence: "Rotating", verification: "Direct posting" },
  { key: "smartrecruiters", name: "SmartRecruiters", lane: "Official ATS", cadence: "Rotating", verification: "Direct posting" },
  { key: "company-careers", name: "Company careers", lane: "Target companies", cadence: "Every run", verification: "Direct posting" },
  { key: "recruiter-posts", name: "Recruiter posts", lane: "Network signal", cadence: "Daily", verification: "Official role or recruiter confirmation required" },
] as const;

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const validApplicationStatuses = new Set(["Saved", "Preparing", "Applied", "Interviewing", "Offer", "Rejected", "Closed"]);
const validApprovalTiers = new Set(["A", "B", "C"]);
const validApprovalStatuses = new Set(["Validated", "Pending", "Approved", "Rejected", "Submitted", "Blocked"]);
const routineValidationFields = [
  "qualificationChecksPassed",
  "factualChecksPassed",
  "atsChecksPassed",
  "renderingChecksPassed",
  "duplicateChecksPassed",
  "applicationAnswerChecksPassed",
  "immutableArtifactChecksPassed",
  "livePostingRechecked",
] as const;
const validDiscoveryOperations = new Set(["SOURCE_SCAN_RECORDED", "LEAD_UPSERT", "LEAD_STATUS_CHANGED", "DISCOVERY_RUN_RECORDED"]);
const validDiscoveryLeadStatuses = new Set<DiscoveryLeadStatus>(["Discovered", "Verified", "Qualified", "Rejected", "Duplicate", "Applied", "Blocked"]);

function defaultJobHubState(): JobHubState {
  return {
    version: 3,
    applications: seedApplications,
    progress: {},
    settings: { startDate: new Date().toISOString().slice(0, 10), primaryLanguage: "Python 3", weeklyGoal: 7 },
  };
}

function normalizedApplicationKey(company: unknown, role: unknown) {
  return `${String(company || "").trim()}::${String(role || "").trim()}`.toLowerCase();
}

function isStrictDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function pacificDateFromTimestamp(value: unknown) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("recordedAt must be an ISO timestamp with an explicit timezone.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("recordedAt is invalid.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function safePacificDateFromTimestamp(value: unknown) {
  try { return pacificDateFromTimestamp(value); } catch { return ""; }
}

function appendEvidenceNote(existing: unknown, evidence: string) {
  const notes = typeof existing === "string" ? existing.trim() : "";
  if (!evidence || notes.includes(evidence)) return notes;
  return `${notes}${notes ? " " : ""}${evidence}`;
}

function applicationIndexFor(applications: Array<Record<string, unknown>>, input: ApplicationActionInput) {
  if (input.applicationId) {
    const byId = applications.findIndex((item) => item.id === input.applicationId);
    if (byId >= 0) return byId;
  }
  const key = normalizedApplicationKey(input.company, input.role);
  return applications.findIndex((item) => normalizedApplicationKey(item.company, item.role) === key);
}

function approvalPackageFor(application: Record<string, unknown>) {
  return application.approval && typeof application.approval === "object"
    ? application.approval as Record<string, unknown>
    : null;
}

function shouldPreserveWorkflowStateForPreparation(application: Record<string, unknown>, approval: Record<string, unknown> | null) {
  const status = String(application.status || "");
  const workbookStatus = String(application.workbookStatus || "");
  const approvalStatus = String(approval?.status || "");
  return ["Applied", "Interviewing", "Offer", "Rejected", "Closed"].includes(status)
    || ["Blocked", "Submitted", "Approved", "Skipped"].includes(workbookStatus)
    || ["Blocked", "Submitted", "Approved", "Rejected"].includes(approvalStatus)
    || Boolean(application.appliedDate);
}

function validatePreparationPackage(input: ApplicationActionInput) {
  const approval = input.approvalPackage;
  const packageId = String(input.packageId || approval?.id || "").trim();
  const tier = String(approval?.tier || "").trim();
  if (!approval || !packageId || !validApprovalTiers.has(tier)) {
    throw new Error("PREPARED requires a stable packageId and Tier A, B, or C approval package.");
  }
  if (!Array.isArray(approval.requirements) || !Array.isArray(approval.gaps) || !Array.isArray(approval.answers)) {
    throw new Error("The approval card requires requirements, gaps, and application answers arrays.");
  }
  const officialJobUrl = String(approval.officialJobUrl || input.directUrl || "").trim();
  try {
    const url = new URL(officialJobUrl);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    throw new Error("The approval card requires a valid officialJobUrl.");
  }
  if (tier !== "C") {
    const hash = String(approval.resumeSha256 || "").trim();
    const uploadedHash = String(approval.uploadedPdfSha256 || "").trim();
    const immutableArtifactPath = String(approval.immutableArtifactPath || "").trim();
    const stableKey = String(approval.stableIdempotencyKey || "").trim();
    const preview = String(approval.resumePreview || "").trim();
    const previewUrl = String(approval.resumePreviewUrl || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("Tier A and B packages require the exact resume SHA-256.");
    if (uploadedHash !== hash) throw new Error("The selected upload hash must match the immutable resume SHA-256.");
    if (!immutableArtifactPath) throw new Error("Tier A and B packages require an immutable application artifact path.");
    if (!/^jobapp-[a-f0-9]{64}$/i.test(stableKey)) throw new Error("Tier A and B packages require a stable company/role/official-job-ID idempotency key.");
    if (!preview && !previewUrl) throw new Error("Tier A and B packages require a resume preview or preview URL.");
  }
  const validation = approval.validation && typeof approval.validation === "object"
    ? approval.validation as Record<string, unknown>
    : {};
  const exceptionReasons = Array.isArray(approval.exceptionReasons)
    ? approval.exceptionReasons.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (tier !== "C" && !routineValidationFields.every((field) => validation[field] === true)) {
    throw new Error("Tier A and B packages require every routine qualification, factual, ATS, rendering, duplicate, answer, immutable-artifact, and live-posting validation to pass.");
  }
  if (tier === "C" && exceptionReasons.length === 0) {
    throw new Error("Tier C requires at least one genuine exception reason.");
  }
  return { ...approval, id: packageId, tier, officialJobUrl, validation, exceptionReasons };
}

function applyApplicationAction(state: JobHubState, input: ApplicationActionInput, actionId: string) {
  const action = input.action || input.operation;
  const applications = state.applications.map((item) => ({ ...item }));

  if (action === "UPSERT") {
    const incoming = input.application;
    if (!incoming || typeof incoming !== "object") throw new Error("application is required for UPSERT.");
    const company = typeof incoming.company === "string" ? incoming.company.trim() : "";
    const role = typeof incoming.role === "string" ? incoming.role.trim() : "";
    const status = typeof incoming.status === "string" ? incoming.status : "Saved";
    if (!company || !role || !validApplicationStatuses.has(status)) throw new Error("UPSERT requires a company, role, and valid status.");
    const recordedDate = pacificDateFromTimestamp(input.recordedAt);
    if (["Applied", "Interviewing", "Offer"].includes(status)) {
      if (!isStrictDate(incoming.appliedDate) || incoming.appliedDate > recordedDate) {
        throw new Error("Submitted applications require a truthful appliedDate no later than recordedAt.");
      }
    }
    const index = applicationIndexFor(applications, {
      applicationId: typeof incoming.id === "string" ? incoming.id : undefined,
      company,
      role,
    });
    const previous = index >= 0 ? applications[index] : {};
    const ids = new Set(Array.isArray(previous.backendActionIds) ? previous.backendActionIds.filter((id): id is string => typeof id === "string") : []);
    ids.add(actionId);
    const { approval: _ignoredApproval, ...safeIncoming } = incoming;
    const next = {
      ...previous,
      ...safeIncoming,
      id: typeof incoming.id === "string" && incoming.id.trim() ? incoming.id : previous.id || `backend-${normalizedApplicationKey(company, role).replace(/[^a-z0-9]+/g, "-")}`,
      company,
      role,
      status,
      nextAction: ["Applied", "Interviewing", "Offer"].includes(status) ? "Daily morning Gmail status check" : incoming.nextAction || previous.nextAction || "",
      backendActionIds: [...ids],
      sheetSynced: true,
    };
    if (index >= 0) applications[index] = next;
    else applications.unshift(next);
    return { ...state, version: 3, applications };
  }

  if (action === "PREPARED") {
    const approval = validatePreparationPackage(input);
    const routineAuthorized = approval.tier !== "C" && Array.isArray(approval.exceptionReasons) && approval.exceptionReasons.length === 0;
    const incoming = input.application && typeof input.application === "object" ? input.application : {};
    const company = String(input.company || incoming.company || "").trim();
    const role = String(input.role || incoming.role || "").trim();
    if (!company || !role) throw new Error("PREPARED requires company and role.");
    let index = applicationIndexFor(applications, { applicationId: input.applicationId || String(incoming.id || ""), company, role });
    const previous = index >= 0 ? applications[index] : {};
    const recordedDate = pacificDateFromTimestamp(input.recordedAt);
    const previousApproval = approvalPackageFor(previous);
    const replacesPackageId = String(input.replacesPackageId || "").trim();
    const replacementReason = String(input.replacementReason || "").trim();
    const replaceBlockedPackage = Boolean(replacesPackageId)
      && index >= 0
      && String(previous.status || "") === "Preparing"
      && String(previous.workbookStatus || "") === "Blocked"
      && String(previousApproval?.status || "") === "Blocked"
      && replacesPackageId === String(previousApproval?.id || "")
      && approval.id !== replacesPackageId
      && approval.tier !== "C"
      && approval.exceptionReasons.length === 0
      && Boolean(replacementReason)
      && String(approval.officialJobId || "") === String(previousApproval?.officialJobId || "")
      && approval.officialJobUrl === String(previousApproval?.officialJobUrl || "")
      && String(approval.stableIdempotencyKey || "") === String(previousApproval?.stableIdempotencyKey || "")
      && !previous.appliedDate;
    if (replacesPackageId && !replaceBlockedPackage) {
      throw new Error("A blocked package replacement must name the current exact blocked package and preserve the official job and stable idempotency key.");
    }
    const preserveWorkflowState = index >= 0 && !replaceBlockedPackage && shouldPreserveWorkflowStateForPreparation(previous, previousApproval);
    const preparedToday = applications.filter((item) => {
      const itemApproval = approvalPackageFor(item);
      return itemApproval && safePacificDateFromTimestamp(itemApproval.preparedAt) === recordedDate && itemApproval.id !== approval.id;
    }).length;
    if (preparedToday >= 20 && previousApproval?.id !== approval.id) {
      throw new Error("The weekday preparation cap of 20 packages has already been reached.");
    }
    const ids = new Set(Array.isArray(previous.backendActionIds) ? previous.backendActionIds.filter((id): id is string => typeof id === "string") : []);
    ids.add(actionId);
    const previousScreeningPrep = previous.screeningPrep && typeof previous.screeningPrep === "object"
      ? previous.screeningPrep as Record<string, unknown>
      : {};
    const incomingScreeningPrep = incoming.screeningPrep && typeof incoming.screeningPrep === "object"
      ? incoming.screeningPrep as Record<string, unknown>
      : {};
    const next = {
      ...previous,
      ...incoming,
      id: String(incoming.id || previous.id || `backend-${normalizedApplicationKey(company, role).replace(/[^a-z0-9]+/g, "-")}`),
      company,
      role,
      status: preserveWorkflowState ? previous.status : "Preparing",
      workbookStatus: preserveWorkflowState ? previous.workbookStatus : routineAuthorized ? "Validated for direct submission" : "Exception review required",
      link: String(previous.link || approval.officialJobUrl || input.directUrl || incoming.link || ""),
      nextAction: preserveWorkflowState ? previous.nextAction : routineAuthorized ? "Submit after final live recheck" : "Resolve the exception in Job Hub",
      notes: replaceBlockedPackage
        ? appendEvidenceNote(previous.notes, String(incoming.notes || replacementReason))
        : preserveWorkflowState ? appendEvidenceNote(previous.notes, String(incoming.notes || "")) : incoming.notes || previous.notes || "",
      screeningPrep: { ...incomingScreeningPrep, ...previousScreeningPrep },
      approval: preserveWorkflowState && previousApproval
        ? previousApproval
        : {
            ...previousApproval,
            ...approval,
            status: routineAuthorized ? "Validated" : "Pending",
            preparedAt: input.recordedAt,
            approvedAt: "",
            reviewedAt: "",
          },
      backendActionIds: [...ids],
      sheetSynced: true,
    };
    if (index >= 0) applications[index] = next;
    else {
      applications.unshift(next);
      index = 0;
    }
    return { ...state, version: 3, applications };
  }

  const index = applicationIndexFor(applications, input);
  if (index < 0) throw new Error("No matching backend application was found; UPSERT it first.");
  const current = applications[index];
  const ids = new Set(Array.isArray(current.backendActionIds) ? current.backendActionIds.filter((id): id is string => typeof id === "string") : []);
  if (ids.has(actionId)) return state;
  ids.add(actionId);

  if (action === "APPROVED" || action === "APPROVAL_REJECTED") {
    const approval = approvalPackageFor(current);
    const packageId = String(input.packageId || "").trim();
    if (!approval || !packageId || approval.id !== packageId) throw new Error("The approval decision does not match the current exact package.");
    if (!validApprovalStatuses.has(String(approval.status || "")) || !["Pending", "Blocked"].includes(String(approval.status))) {
      throw new Error("Only a pending or blocked approval package can be reviewed.");
    }
    if (action === "APPROVED") {
      if (approval.tier === "C") throw new Error("Tier C is review-only and must be rebuilt as Tier A or B before approval.");
      applications[index] = {
        ...current,
        status: "Preparing",
        workbookStatus: "Approved",
        nextAction: "Submit this exact approved package",
        approval: { ...approval, status: "Approved", approvedAt: input.recordedAt, reviewedAt: input.recordedAt },
        backendActionIds: [...ids],
        sheetSynced: true,
      };
    } else {
      applications[index] = {
        ...current,
        status: "Closed",
        workbookStatus: "Skipped",
        nextAction: "Rejected during application review",
        approval: { ...approval, status: "Rejected", reviewedAt: input.recordedAt },
        backendActionIds: [...ids],
        sheetSynced: true,
      };
    }
  } else if (action === "SUBMITTED") {
    const approval = approvalPackageFor(current);
    const packageId = String(input.packageId || "").trim();
    const exactAuthorizedPackage = approval
      && ["Validated", "Approved"].includes(String(approval.status))
      && packageId
      && approval.id === packageId;
    if (!current.appliedDate && !exactAuthorizedPackage) {
      throw new Error("SUBMITTED requires the current exact package to be routine-validated or exception-approved first.");
    }
    if (!current.appliedDate && exactAuthorizedPackage) {
      const artifactHash = String(input.artifactPdfSha256 || "").trim();
      const uploadedHash = String(input.uploadedPdfSha256 || "").trim();
      const artifactPath = String(input.immutableArtifactPath || "").trim();
      const stableKey = String(input.stableIdempotencyKey || "").trim();
      if (!input.confirmation) throw new Error("SUBMITTED requires authoritative confirmation text.");
      if (!artifactPath || artifactPath !== approval.immutableArtifactPath) throw new Error("SUBMITTED immutable artifact path does not match the validated package.");
      if (artifactHash !== approval.resumeSha256 || uploadedHash !== artifactHash || uploadedHash !== approval.uploadedPdfSha256) {
        throw new Error("SUBMITTED uploaded PDF hash must match the exact immutable validated package.");
      }
      if (stableKey !== approval.stableIdempotencyKey) throw new Error("SUBMITTED idempotency key does not match the validated package.");
    }
    const appliedDate = pacificDateFromTimestamp(input.recordedAt);
    if (input.submittedAt !== undefined && (!isStrictDate(input.submittedAt) || input.submittedAt !== appliedDate)) {
      throw new Error("submittedAt must match the America/Los_Angeles calendar date of recordedAt.");
    }
    const advanced = ["Interviewing", "Offer", "Rejected", "Closed"].includes(String(current.status));
    const evidence = `Submission confirmed ${appliedDate} from authoritative application action ${actionId}.`;
    applications[index] = {
      ...current,
      status: advanced ? current.status : "Applied",
      workbookStatus: advanced ? current.workbookStatus : "Submitted",
      appliedDate,
      link: input.directUrl || current.link || "",
      nextAction: "Daily morning Gmail status check",
      currentRound: advanced ? current.currentRound : "Application submitted",
      notes: appendEvidenceNote(current.notes, evidence),
      approval: approval ? { ...approval, status: "Submitted", submittedAt: input.recordedAt } : current.approval,
      backendActionIds: [...ids],
      sheetSynced: true,
    };
  } else if (action === "BLOCKED") {
    const advanced = ["Applied", "Interviewing", "Offer", "Rejected", "Closed"].includes(String(current.status));
    const reason = input.reason || "Application outcome requires verification before another submission attempt.";
    applications[index] = {
      ...current,
      status: advanced ? current.status : "Preparing",
      workbookStatus: advanced ? current.workbookStatus : "Blocked",
      nextAction: advanced ? current.nextAction : input.retryInstruction || "Verify the uncertain submission outcome before retrying",
      notes: appendEvidenceNote(current.notes, `Blocked ${pacificDateFromTimestamp(input.recordedAt)}: ${reason}`),
      approval: approvalPackageFor(current)
        ? { ...approvalPackageFor(current), status: "Blocked", blockedAt: input.recordedAt }
        : current.approval,
      backendActionIds: [...ids],
      sheetSynced: true,
    };
  } else if (action === "MAILBOX_CHECKED") {
    const checkedDate = pacificDateFromTimestamp(input.recordedAt);
    const screeningPrep = current.screeningPrep && typeof current.screeningPrep === "object" ? current.screeningPrep as Record<string, unknown> : {};
    const confirmedStatus = typeof input.confirmedStatus === "string" && validApplicationStatuses.has(input.confirmedStatus)
      ? input.confirmedStatus
      : current.status;
    applications[index] = {
      ...current,
      status: confirmedStatus,
      nextAction: ["Rejected", "Closed"].includes(String(confirmedStatus)) ? "No action" : "Daily morning Gmail status check",
      latestEmail: input.latestEmail || current.latestEmail || "",
      latestEmailSubject: input.latestEmailSubject || current.latestEmailSubject || "",
      screeningPrep: {
        ...screeningPrep,
        lastMailboxCheck: checkedDate,
        mailboxSignal: input.mailboxSignal || screeningPrep.mailboxSignal || "No matching recruiter or application-status email found.",
        expectedNextInterviewDate: input.expectedNextInterviewDate || screeningPrep.expectedNextInterviewDate || "",
        expectedDateConfirmed: input.expectedDateConfirmed === true,
      },
      backendActionIds: [...ids],
      sheetSynced: true,
    };
  } else if (action === "STATUS_CHANGED") {
    if (!input.confirmedStatus || !validApplicationStatuses.has(input.confirmedStatus)) throw new Error("confirmedStatus is invalid.");
    applications[index] = {
      ...current,
      status: input.confirmedStatus,
      nextAction: ["Rejected", "Closed"].includes(input.confirmedStatus) ? "No action" : "Daily morning Gmail status check",
      latestEmail: input.latestEmail || current.latestEmail || "",
      latestEmailSubject: input.latestEmailSubject || current.latestEmailSubject || "",
      notes: appendEvidenceNote(current.notes, input.confirmation || ""),
      backendActionIds: [...ids],
      sheetSynced: true,
    };
  } else {
    throw new Error("Unsupported application action.");
  }

  return { ...state, version: 3, applications };
}

function nonnegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizedDiscoveryText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizedDiscoveryUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|trk|tracking|ref|source)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

function discoveryLeadDedupeKey(lead: NonNullable<DiscoveryEventInput["lead"]>) {
  const officialUrl = normalizedDiscoveryUrl(lead.officialUrl);
  if (officialUrl) return `official:${officialUrl}`;
  return `role:${normalizedDiscoveryText(lead.company)}::${normalizedDiscoveryText(lead.role)}::${normalizedDiscoveryText(lead.location)}`;
}

function discoveryStatus(existing: unknown, incoming: DiscoveryLeadStatus) {
  if (existing === "Applied") return "Applied";
  if (["Qualified", "Verified"].includes(String(existing)) && ["Discovered", "Duplicate", "Rejected"].includes(incoming)) return existing as DiscoveryLeadStatus;
  return incoming;
}

async function readDiscoveryDashboard(db: D1Database) {
  const [eventResult, leadResult] = await Promise.all([
    db.prepare(`SELECT payload FROM job_hub_discovery_events
      ORDER BY recorded_at DESC LIMIT 300`).all<{ payload: string }>(),
    db.prepare(`SELECT payload FROM job_hub_discovery_leads
      ORDER BY updated_at DESC LIMIT 150`).all<{ payload: string }>(),
  ]);
  const events: DiscoveryEventInput[] = eventResult.results.flatMap((row: { payload: string }) => {
    try { return [JSON.parse(row.payload) as DiscoveryEventInput]; } catch { return []; }
  });
  const leads: Array<Record<string, unknown>> = leadResult.results.flatMap((row: { payload: string }) => {
    try { return [JSON.parse(row.payload) as Record<string, unknown>]; } catch { return []; }
  });
  const latestScans = new Map<string, DiscoveryEventInput>();
  for (const event of events) {
    if (event.operation === "SOURCE_SCAN_RECORDED" && event.source && !latestScans.has(event.source)) latestScans.set(event.source, event);
  }
  const sources = discoverySourceRegistry.map((source) => {
    const latest = latestScans.get(source.name);
    return {
      ...source,
      lastScan: latest?.recordedAt || "",
      scanStatus: latest?.scan?.status || "not-started",
      resultsFound: nonnegativeInteger(latest?.scan?.resultsFound),
      qualifiedCount: nonnegativeInteger(latest?.scan?.qualifiedCount),
      duplicateCount: nonnegativeInteger(latest?.scan?.duplicateCount),
      rejectedCount: nonnegativeInteger(latest?.scan?.rejectedCount),
      note: latest?.scan?.note || "",
    };
  });
  return {
    sources,
    scans: events.filter((event) => event.operation === "SOURCE_SCAN_RECORDED").slice(0, 100),
    runs: events.filter((event) => event.operation === "DISCOVERY_RUN_RECORDED").slice(0, 30),
    leads,
    updatedAt: events[0]?.recordedAt || leads[0]?.updatedAt || "",
  };
}

async function applyDiscoveryEvent(db: D1Database, input: DiscoveryEventInput) {
  const operation = input.operation || "";
  const eventId = (input.eventId || input.idempotencyKey || "").trim();
  const source = String(input.source || "").trim();
  if (!eventId || !validDiscoveryOperations.has(operation) || !source || !input.recordedAt) {
    throw new Error("A stable eventId/idempotencyKey, supported operation, source, and recordedAt are required.");
  }
  pacificDateFromTimestamp(input.recordedAt);
  const existingEvent = await db.prepare("SELECT id FROM job_hub_discovery_events WHERE id = ?")
    .bind(eventId)
    .first<{ id: string }>();
  if (existingEvent) return { duplicate: true, eventId };

  const now = new Date().toISOString();
  if (operation === "SOURCE_SCAN_RECORDED") {
    if (!input.scan || !Array.isArray(input.scan.queries)) throw new Error("SOURCE_SCAN_RECORDED requires scan queries and counts.");
  } else if (operation === "DISCOVERY_RUN_RECORDED") {
    if (!input.run) throw new Error("DISCOVERY_RUN_RECORDED requires a run summary.");
  } else {
    const lead = input.lead;
    const company = String(lead?.company || "").trim();
    const role = String(lead?.role || "").trim();
    const status = lead?.status || "Discovered";
    if (!lead || !lead.id || !company || !role || !validDiscoveryLeadStatuses.has(status)) {
      throw new Error("Lead events require a stable lead id, company, role, and supported status.");
    }
    const dedupeKey = discoveryLeadDedupeKey(lead);
    const existingLead = await db.prepare("SELECT id, payload FROM job_hub_discovery_leads WHERE id = ? OR dedupe_key = ? LIMIT 1")
      .bind(lead.id, dedupeKey)
      .first<{ id: string; payload: string }>();
    let previous: Record<string, unknown> = {};
    try { previous = existingLead ? JSON.parse(existingLead.payload) as Record<string, unknown> : {}; } catch { previous = {}; }
    const discoveredSources = [...new Set([
      ...(Array.isArray(previous.discoveredSources) ? previous.discoveredSources.filter((item): item is string => typeof item === "string") : []),
      ...(Array.isArray(lead.discoveredSources) ? lead.discoveredSources : []),
      source,
    ])];
    const sourceUrls = [...new Set([
      ...(Array.isArray(previous.sourceUrls) ? previous.sourceUrls.filter((item): item is string => typeof item === "string") : []),
      normalizedDiscoveryUrl(lead.sourceUrl),
    ].filter(Boolean))];
    const mergedLead = {
      ...previous,
      ...lead,
      id: existingLead?.id || lead.id,
      company,
      role,
      location: String(lead.location || previous.location || ""),
      status: discoveryStatus(previous.status, status),
      source,
      sourceUrl: normalizedDiscoveryUrl(lead.sourceUrl) || String(previous.sourceUrl || ""),
      officialUrl: normalizedDiscoveryUrl(lead.officialUrl) || String(previous.officialUrl || ""),
      discoveredSources,
      sourceUrls,
      discoveredAt: String(previous.discoveredAt || input.recordedAt),
      updatedAt: input.recordedAt,
    };
    const leadStatement = existingLead
      ? db.prepare(`UPDATE job_hub_discovery_leads SET dedupe_key = ?, source = ?, company = ?, role = ?, location = ?, status = ?, source_url = ?, official_url = ?, payload = ?, updated_at = ? WHERE id = ?`)
        .bind(dedupeKey, source, company, role, mergedLead.location, mergedLead.status, mergedLead.sourceUrl, mergedLead.officialUrl, JSON.stringify(mergedLead), input.recordedAt, existingLead.id)
      : db.prepare(`INSERT INTO job_hub_discovery_leads
        (id, dedupe_key, source, company, role, location, status, source_url, official_url, payload, discovered_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(lead.id, dedupeKey, source, company, role, mergedLead.location, mergedLead.status, mergedLead.sourceUrl, mergedLead.officialUrl, JSON.stringify(mergedLead), input.recordedAt, input.recordedAt);
    await db.batch([
      leadStatement,
      db.prepare(`INSERT INTO job_hub_discovery_events (id, operation, source, payload, recorded_at, applied_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(eventId, operation, source, JSON.stringify(input), input.recordedAt, now),
    ]);
    return { duplicate: false, eventId, leadId: mergedLead.id, dedupeKey };
  }

  await db.prepare(`INSERT INTO job_hub_discovery_events (id, operation, source, payload, recorded_at, applied_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(eventId, operation, source, JSON.stringify(input), input.recordedAt, now)
    .run();
  return { duplicate: false, eventId };
}

async function ensureJobHubTables(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS job_hub_state (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS job_hub_application_actions (
      id TEXT PRIMARY KEY NOT NULL,
      operation TEXT NOT NULL,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      payload TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS job_hub_discovery_events (
      id TEXT PRIMARY KEY NOT NULL,
      operation TEXT NOT NULL,
      source TEXT NOT NULL,
      payload TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS job_hub_discovery_leads (
      id TEXT PRIMARY KEY NOT NULL,
      dedupe_key TEXT NOT NULL,
      source TEXT NOT NULL,
      company TEXT NOT NULL,
      role TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL,
      source_url TEXT NOT NULL,
      official_url TEXT NOT NULL,
      payload TEXT NOT NULL,
      discovered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_job_hub_discovery_events_source_recorded ON job_hub_discovery_events(source, recorded_at)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_job_hub_discovery_leads_dedupe ON job_hub_discovery_leads(dedupe_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_job_hub_discovery_leads_status_updated ON job_hub_discovery_leads(status, updated_at)"),
  ]);
}

async function readJobHubState(db: D1Database) {
  const row = await db.prepare("SELECT payload, updated_at FROM job_hub_state WHERE id = ?")
    .bind("primary")
    .first<{ payload: string; updated_at: string }>();
  if (row) return { state: JSON.parse(row.payload) as JobHubState, updatedAt: row.updated_at };
  const state = defaultJobHubState();
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO job_hub_state (id, payload, updated_at) VALUES (?, ?, ?)")
    .bind("primary", JSON.stringify(state), now)
    .run();
  return { state, updatedAt: now };
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/hint" || url.pathname === "/api/code-review" || url.pathname === "/api/career-lab-followups") {
      const headers = jsonHeaders;
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
      }
      if (!env.OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: "AI features are not configured yet." }), { status: 503, headers });
      }
      try {
        const input = await request.json();
        if (url.pathname === "/api/hint") {
          return new Response(JSON.stringify(await createAiHint(input, env.OPENAI_API_KEY, env.OPENAI_MODEL)), { headers });
        }
        if (url.pathname === "/api/career-lab-followups") {
          return new Response(JSON.stringify({ drill: await createCareerFollowUps(input, env.OPENAI_API_KEY, env.OPENAI_MODEL) }), { headers });
        }
        return new Response(JSON.stringify({ review: await createCodeReview(input, env.OPENAI_API_KEY, env.OPENAI_MODEL) }), { headers });
      } catch (error) {
        const message = url.pathname === "/api/code-review"
          ? codeReviewErrorMessage(error)
          : url.pathname === "/api/career-lab-followups"
            ? careerFollowUpErrorMessage(error)
            : error instanceof Error ? error.message : "The AI hint could not be generated.";
        return new Response(JSON.stringify({ error: message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/state") {
      const headers = jsonHeaders;
      await ensureJobHubTables(env.DB);

      if (request.method === "GET") {
        const { state, updatedAt } = await readJobHubState(env.DB);
        return new Response(JSON.stringify({ ...state, updatedAt }), { headers });
      }

      if (request.method === "PUT") {
        const payload = await request.json() as Record<string, unknown>;
        if (!Array.isArray(payload.applications) || !payload.progress || !payload.settings) {
          return new Response(JSON.stringify({ error: "Invalid Job Hub state." }), { status: 400, headers });
        }
        const current = await readJobHubState(env.DB);
        if (typeof payload.baseUpdatedAt !== "string" || payload.baseUpdatedAt !== current.updatedAt) {
          return new Response(JSON.stringify({ error: "Backend state changed; reload before saving.", ...current.state, updatedAt: current.updatedAt }), { status: 409, headers });
        }
        const state = {
          version: 3,
          applications: payload.applications,
          progress: payload.progress,
          settings: payload.settings,
        };
        const now = new Date().toISOString();
        const result = await env.DB.prepare("UPDATE job_hub_state SET payload = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
          .bind(JSON.stringify(state), now, "primary", current.updatedAt)
          .run();
        if ((result.meta.changes || 0) !== 1) {
          const latest = await readJobHubState(env.DB);
          return new Response(JSON.stringify({ error: "Backend state changed; reload before saving.", ...latest.state, updatedAt: latest.updatedAt }), { status: 409, headers });
        }
        return new Response(JSON.stringify({ ok: true, updatedAt: now }), { headers });
      }

      return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
    }

    if (url.pathname === "/api/application-actions") {
      const headers = jsonHeaders;
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
      }
      await ensureJobHubTables(env.DB);
      try {
        const input = await request.json() as ApplicationActionInput;
        const action = input.action || input.operation;
        const actionId = (input.approvalId || input.idempotencyKey || "").trim();
        if (!actionId || !action || !input.recordedAt) {
          return new Response(JSON.stringify({ error: "A stable approvalId/idempotencyKey, action, and recordedAt are required." }), { status: 400, headers });
        }
        pacificDateFromTimestamp(input.recordedAt);
        const existing = await env.DB.prepare("SELECT id FROM job_hub_application_actions WHERE id = ?")
          .bind(actionId)
          .first<{ id: string }>();
        if (existing) return new Response(JSON.stringify({ ok: true, duplicate: true, actionId }), { headers });

        const current = await readJobHubState(env.DB);
        const nextState = applyApplicationAction(current.state, input, actionId);
        const now = new Date().toISOString();
        const update = await env.DB.prepare("UPDATE job_hub_state SET payload = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
          .bind(JSON.stringify(nextState), now, "primary", current.updatedAt)
          .run();
        if ((update.meta.changes || 0) !== 1) {
          return new Response(JSON.stringify({ error: "Backend state changed; retry this same idempotent action." }), { status: 409, headers });
        }
        await env.DB.prepare(`INSERT OR IGNORE INTO job_hub_application_actions
          (id, operation, company, role, payload, recorded_at, applied_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            actionId,
            action,
            String(input.company || input.application?.company || ""),
            String(input.role || input.application?.role || ""),
            JSON.stringify(input),
            input.recordedAt,
            now,
          )
          .run();
        return new Response(JSON.stringify({ ok: true, duplicate: false, actionId, updatedAt: now }), { headers });
      } catch (error) {
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "The backend action could not be applied." }), { status: 400, headers });
      }
    }

    if (url.pathname === "/api/discovery") {
      const headers = jsonHeaders;
      await ensureJobHubTables(env.DB);
      if (request.method === "GET") {
        return new Response(JSON.stringify(await readDiscoveryDashboard(env.DB)), { headers });
      }
      if (request.method === "POST") {
        try {
          const input = await request.json() as DiscoveryEventInput;
          const result = await applyDiscoveryEvent(env.DB, input);
          return new Response(JSON.stringify({ ok: true, ...result }), { headers });
        } catch (error) {
          return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "The discovery event could not be applied." }), { status: 400, headers });
        }
      }
      return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
