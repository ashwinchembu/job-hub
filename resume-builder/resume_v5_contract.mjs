const CURRENT_TAILORING_VERSION = 5;
const MIN_BULLET_FONT_SIZE = 9;
const MAX_BULLET_FONT_SIZE = 10;

const REQUIRED_SECTIONS = ["contact", "profile", "skills", "experience", "projects", "education", "links"];
const ENTRY_STRENGTHS = new Set(["strong", "moderate", "supporting", "mediocre", "insignificant"]);
const QUANTITY_CATEGORIES = new Set([
  "records", "commits", "routes", "tests", "validated_workflows", "funding",
  "deployment_artifacts", "supported_users", "time", "size", "percentage", "other",
]);
const QUANTITY_PATTERN = /(?:\bfive[ -]figures\b|\b\d[\d,.]*(?:[KkMmBb])?(?:\+|%)?(?=$|[^A-Za-z0-9_])|\$\s*\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b)/i;
const LOW_VALUE_QUANTITY_PATTERNS = [/\b2 input types\b/i, /\b3 delivery surfaces\b/i];
const GENERIC_TAILORING_PHRASES = [
  "the grounded workflow keeps model-backed product behavior explainable and testable",
  "the implementation connects applied ai services with a reliable customer interface",
  "the evidence supports observability, proactive failure detection, and safe iteration",
  "the result demonstrates end-to-end delivery across retrieval, apis, and react workflows",
  "the implementation makes technical decisions reviewable across product and engineering",
  "the product evidence maps to performant ai experiences with explicit trust boundaries",
  "the documented checks preserve quality while moving quickly in an ambiguous domain",
  "model behavior stayed testable",
];
const INTERNAL_PROVENANCE_PATTERNS = [
  /\bsource\s*:/i,
  /\bevidence\s*:/i,
  /\bquantity[_ ]source\s*:/i,
];
const APPLICANT_NARRATION_PATTERNS = [
  /\bthis\s+(?:(?:verified|documented|reviewed|auditable)\s+)?(?:(?:work|implementation|result|evidence|project|system|delivery|experience)\s+)?(?:supports?|demonstrates?|shows?|proves?|validates?)\b/i,
  /\bthe\s+(?:verified\s+)?(?:evidence|result|work)\s+(?:supports?|demonstrates?|shows?|proves?|validates?)\b/i,
  /\bthe\s+result\s+demonstrates?\b/i,
  /\bwithout\s+claiming\b/i,
  /\bnot\s+claiming\b/i,
  /\bwhile\s+claiming\s+only\b/i,
  /\b(?:is|are|was|were)\s+not\s+claimed\b/i,
  /\bwithout\s+overstating\b/i,
  /\b(?:verified\s+)?scope\s+stayed\b/i,
  /\b(?:evaluation|healthcare)\s+evidence\s+stayed\b/i,
  /\b(?:ownership|claim)\s+boundar(?:y|ies)\b/i,
  /\b(?:(?:workflow|product|implementation|healthcare|evaluation)\s+)?evidence\s+(?:stayed|remained)\s+(?:auditable|reviewable|traceable|bounded)\b/i,
  /\bthrough\s+(?:reviewed\s+data\s+flow|verified\s+ownership\s+boundaries|source-backed\s+tests|auditable\s+delivery\s+records|measurable\s+validation\s+output|scoped\s+product\s+evidence)\b/i,
  /(?:^|[.!?]\s+)supports?\s+(?:reliable|auditable|observable|maintainable|tested|developer|customer|operational|cross-functional|cross-stack|data-rich|phased|performance|database|api|agent|full-stack|billing|product|system)/i,
  /\b(?:the\s+)?(?:(?:release|review|workflow|deployment|funding|scoped|verified)\s+)?(?:evidence|boundary|chronology|claim|ownership|usage)\s+(?:remains?|remained|stays?|stayed)\s+(?:reproducible|traceable|auditable|reviewable|explicit|attributable|attributed|limited|tied)\b/i,
  /\bthe\s+inspected\s+artifact\s+remains\s+the\s+release\s+evidence\b/i,
  /\bthe\s+(?:implementation|evidence|result|work|project|system)\s+(?:connects?|preserves?|maps?|links?)\b/i,
];

function requireContract(condition, message) {
  if (!condition) throw new Error(`Resume V5 contract: ${message}`);
}

function nonEmptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
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

function containsExactWebsite(values, requiredWebsite) {
  const required = canonicalHttpUrl(requiredWebsite);
  if (!required) return false;
  return values.some((value) => (String(value).match(/https?:\/\/[^\s|,;)\]}]+/gi) || [])
    .some((candidate) => canonicalHttpUrl(candidate) === required));
}

function normalizedUniqueStrings(values) {
  return new Set(values.map((value) => String(value).normalize("NFKC").trim().toLowerCase())).size === values.length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quantityAppearsInBullet(quantity, bullet) {
  const escaped = escapeRegExp(String(quantity).normalize("NFKC").trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, "i").test(String(bullet).normalize("NFKC"));
}

export function normalizeResumeBullet(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

export function resumeBodyBullets(spec) {
  return ["experience", "projects"].flatMap((section) =>
    Array.isArray(spec?.[section]) ? spec[section].flatMap((entry) => Array.isArray(entry?.bullets) ? entry.bullets : []) : []
  );
}

export function resumeApplicantFacingText(spec) {
  const contact = spec.contact && typeof spec.contact === "object" && !Array.isArray(spec.contact) ? spec.contact : {};
  const education = spec.education && typeof spec.education === "object" && !Array.isArray(spec.education) ? spec.education : {};
  return [
    ...Object.values(contact),
    spec.profile,
    ...(Array.isArray(spec.skills) ? spec.skills.map((row) => `${row?.label || ""} ${row?.items || ""}`) : []),
    ...["experience", "projects"].flatMap((section) =>
      Array.isArray(spec[section]) ? spec[section].flatMap((entry) => [
        entry?.title, entry?.date, entry?.summary, entry?.tech,
        ...(Array.isArray(entry?.bullets) ? entry.bullets : []),
      ]) : []
    ),
    ...Object.values(education),
    ...(Array.isArray(spec.certifications) ? spec.certifications : []),
    spec.publication,
    ...(Array.isArray(spec.links) ? spec.links : []),
  ].filter((value) => value !== undefined && value !== null && String(value).trim()).join("\n");
}

export function validateV5ResumeSpec(spec, { expectedCompany, expectedRole } = {}) {
  requireContract(spec && typeof spec === "object" && !Array.isArray(spec), "resume_spec.json must contain an object.");
  for (const section of REQUIRED_SECTIONS) requireContract(Object.prototype.hasOwnProperty.call(spec, section), `missing required section ${section}.`);

  const metadata = spec.metadata;
  requireContract(metadata && typeof metadata === "object" && !Array.isArray(metadata), "metadata must be an object.");
  requireContract(nonEmptyString(metadata.company), "metadata.company is required.");
  requireContract(nonEmptyString(metadata.role), "metadata.role is required.");
  requireContract(nonEmptyString(metadata.slug) && /^[a-z0-9][a-z0-9_-]*$/.test(metadata.slug), "metadata.slug must be present and filesystem safe.");
  requireContract(nonEmptyString(metadata.job_description_source), "metadata.job_description_source is required.");
  requireContract(nonEmptyString(metadata.selection_rationale), "metadata.selection_rationale is required.");
  requireContract(nonEmptyString(metadata.facts_reviewed_at)
    && /(?:Z|[+-]\d{2}:\d{2})$/.test(metadata.facts_reviewed_at)
    && !Number.isNaN(Date.parse(metadata.facts_reviewed_at)), "metadata.facts_reviewed_at must be a timezone-aware ISO timestamp.");
  requireContract(/^[a-f0-9]{64}$/i.test(String(metadata.fact_sheet_sha256 || "")), "metadata.fact_sheet_sha256 must be a SHA-256.");
  requireContract(/^[a-f0-9]{64}$/i.test(String(metadata.tailoring_standard_sha256 || "")), "metadata.tailoring_standard_sha256 must be a SHA-256.");
  requireContract(nonEmptyString(metadata.required_website), "metadata.required_website is required.");
  let requiredWebsite;
  try {
    requiredWebsite = new URL(metadata.required_website);
  } catch {
    requireContract(false, "metadata.required_website must be an absolute http(s) URL.");
  }
  requireContract(/^https?:$/.test(requiredWebsite.protocol), "metadata.required_website must be an absolute http(s) URL.");
  requireContract(Array.isArray(metadata.matched_keywords) && metadata.matched_keywords.length >= 3 && metadata.matched_keywords.every(nonEmptyString) && normalizedUniqueStrings(metadata.matched_keywords), "metadata.matched_keywords needs at least three distinct strings.");
  requireContract(Array.isArray(metadata.emphasis_terms) && metadata.emphasis_terms.length >= 3 && metadata.emphasis_terms.every(nonEmptyString) && normalizedUniqueStrings(metadata.emphasis_terms), "metadata.emphasis_terms needs at least three distinct strings.");
  requireContract(Number.isInteger(metadata.tailoring_version) && metadata.tailoring_version === CURRENT_TAILORING_VERSION, `metadata.tailoring_version must equal ${CURRENT_TAILORING_VERSION}.`);
  requireContract(typeof metadata.uniform_bullet_font_size === "number" && Number.isFinite(metadata.uniform_bullet_font_size)
    && metadata.uniform_bullet_font_size >= MIN_BULLET_FONT_SIZE && metadata.uniform_bullet_font_size <= MAX_BULLET_FONT_SIZE,
  `metadata.uniform_bullet_font_size must be between ${MIN_BULLET_FONT_SIZE.toFixed(2)} and ${MAX_BULLET_FONT_SIZE.toFixed(2)} points.`);
  if (expectedCompany !== undefined) requireContract(metadata.company === expectedCompany, "metadata.company does not match the immutable artifact identity.");
  if (expectedRole !== undefined) requireContract(metadata.role === expectedRole, "metadata.role does not match the immutable artifact identity.");

  requireContract(nonEmptyString(metadata.body_tailoring_summary), "metadata.body_tailoring_summary is required.");
  requireContract(!String(metadata.body_tailoring_summary).toLowerCase().startsWith("reordered and selected verified experience and project evidence"), "metadata.body_tailoring_summary must describe material evidence choices, not only reordering.");
  requireContract(Array.isArray(metadata.omitted_requirements) && metadata.omitted_requirements.length > 0 && metadata.omitted_requirements.every(nonEmptyString), "metadata.omitted_requirements must be a non-empty string list.");

  const analysis = metadata.job_analysis;
  requireContract(analysis && typeof analysis === "object" && !Array.isArray(analysis), "metadata.job_analysis is required.");
  for (const field of ["responsibilities", "repeated_keywords", "hard_requirements", "preferred_requirements"]) {
    requireContract(Array.isArray(analysis[field]) && analysis[field].every(nonEmptyString), `metadata.job_analysis.${field} must be a string list.`);
  }
  requireContract(analysis.responsibilities.length > 0, "metadata.job_analysis.responsibilities cannot be empty.");
  requireContract(analysis.repeated_keywords.length >= 3 && normalizedUniqueStrings(analysis.repeated_keywords), "metadata.job_analysis.repeated_keywords needs at least three distinct values.");
  requireContract(nonEmptyString(analysis.domain), "metadata.job_analysis.domain is required.");
  requireContract(nonEmptyString(analysis.seniority), "metadata.job_analysis.seniority is required.");

  const entryException = metadata.entry_count_exception;
  if (entryException !== undefined && entryException !== null) {
    requireContract(entryException && typeof entryException === "object" && !Array.isArray(entryException)
      && entryException.approved_by_user === true && nonEmptyString(entryException.reason),
    "a non-default entry count requires a user-approved metadata.entry_count_exception with a reason.");
  }
  for (const section of ["experience", "projects"]) {
    requireContract(Array.isArray(spec[section]) && spec[section].length >= 3 && spec[section].length <= 4, `${section} must contain three to four entries.`);
    if (!entryException) requireContract(spec[section].length === 3, `${section} must contain exactly three entries by default.`);
  }

  const contact = spec.contact;
  requireContract(contact && typeof contact === "object" && !Array.isArray(contact), "contact must be an object.");
  for (const field of ["name", "phone", "email", "location"]) requireContract(nonEmptyString(contact[field]), `contact.${field} is required.`);
  requireContract(nonEmptyString(spec.profile), "profile is required.");
  requireContract(Array.isArray(spec.skills) && spec.skills.length >= 1 && spec.skills.length <= 5, "skills must contain one to five rows.");
  for (const row of spec.skills) requireContract(nonEmptyString(row?.label) && nonEmptyString(row?.items), "every skill row requires label and items.");

  const facingText = resumeApplicantFacingText(spec);
  for (const pattern of INTERNAL_PROVENANCE_PATTERNS) requireContract(!pattern.test(facingText), "applicant-facing text contains an internal provenance label.");
  for (const pattern of APPLICANT_NARRATION_PATTERNS) requireContract(!pattern.test(facingText), "applicant-facing text contains audit-style narration.");

  const bulletCounts = [];
  const bodyParts = [];
  const prioritiesBySection = new Map();
  for (const section of ["experience", "projects"]) {
    const priorities = [];
    for (const entry of spec[section]) {
      requireContract(nonEmptyString(entry?.title), `every ${section} entry requires a title.`);
      requireContract(nonEmptyString(entry?.date), `every ${section} entry requires a date.`);
      requireContract(ENTRY_STRENGTHS.has(String(entry?.strength || "").trim().toLowerCase()), `${entry?.title || section} requires a supported strength classification.`);
      requireContract(Array.isArray(entry?.target_matches) && entry.target_matches.length >= 2 && entry.target_matches.length <= 5 && entry.target_matches.every(nonEmptyString), `${entry?.title || section} requires two to five target_matches.`);
      requireContract(nonEmptyString(entry?.selection_reason), `${entry?.title || section} requires selection_reason.`);
      requireContract(Number.isInteger(entry?.entry_priority) && entry.entry_priority >= 1, `${entry?.title || section} requires a positive integer entry_priority.`);
      priorities.push(entry.entry_priority);
      requireContract(Array.isArray(entry?.bullets) && entry.bullets.length >= 3 && entry.bullets.length <= 5, `${entry?.title || section} requires three to five bullets.`);
      bulletCounts.push(entry.bullets.length);
      bodyParts.push(entry.title, entry.summary || "", entry.tech || "", ...entry.bullets);
      for (const bullet of entry.bullets) {
        requireContract(nonEmptyString(bullet) && bullet.trim().length >= 35 && bullet.trim().length <= 320, `bullet length is unsuitable in ${entry.title}.`);
        requireContract(!/^(?:I|My|We|Our)\b/i.test(bullet.trim()), `bullet in ${entry.title} uses a first-person pronoun.`);
        requireContract(QUANTITY_PATTERN.test(bullet), `every bullet requires explicit quantification; missing in ${entry.title}.`);
      }
    }
    requireContract(new Set(priorities).size === priorities.length, `${section} entry_priority values must be unique.`);
    prioritiesBySection.set(section, priorities);
  }
  requireContract(bulletCounts.includes(5), "at least one retained entry must contain five bullets.");
  requireContract(bulletCounts.includes(4), "at least one retained entry must contain four bullets.");

  const bullets = resumeBodyBullets(spec);
  const normalizedBullets = bullets.map(normalizeResumeBullet);
  requireContract(new Set(normalizedBullets).size === normalizedBullets.length, "rendered body bullets must be unique.");
  for (const bullet of normalizedBullets) {
    requireContract(!GENERIC_TAILORING_PHRASES.some((phrase) => bullet.includes(phrase)), "body contains generic tailoring filler.");
  }
  const sentences = bullets.flatMap((bullet) => String(bullet).split(/(?<=[.!?])\s+/)).map(normalizeResumeBullet).filter((sentence) => sentence.split(" ").length >= 8);
  requireContract(!sentences.some((sentence, index) => sentences.indexOf(sentence) !== index), "body reuses the same long sentence.");

  const bodyText = bodyParts.join(" ").toLowerCase();
  const bodyMatches = metadata.matched_keywords.filter((keyword) => bodyText.includes(String(keyword).toLowerCase()));
  const minimumBodyMatches = Math.max(3, Math.ceil(metadata.matched_keywords.length / 2));
  requireContract(bodyMatches.length >= minimumBodyMatches, `body tailoring includes ${bodyMatches.length}/${metadata.matched_keywords.length} matched keywords; ${minimumBodyMatches} are required.`);

  const roleSpecific = metadata.role_specific_bullets;
  requireContract(Array.isArray(roleSpecific) && roleSpecific.length >= 7 && roleSpecific.every(nonEmptyString), "metadata.role_specific_bullets requires at least seven bullets.");
  const normalizedBodySet = new Set(normalizedBullets);
  const normalizedRoleSpecific = roleSpecific.map(normalizeResumeBullet);
  requireContract(new Set(normalizedRoleSpecific).size === normalizedRoleSpecific.length, "metadata.role_specific_bullets must identify distinct rendered bullets.");
  requireContract(normalizedRoleSpecific.every((bullet) => normalizedBodySet.has(bullet)), "every role_specific_bullet must exactly match a rendered body bullet.");

  const ranking = metadata.evidence_ranking;
  requireContract(Array.isArray(ranking) && ranking.length >= 6, "metadata.evidence_ranking requires at least six records.");
  const ranks = [];
  const selectedEntries = { experience: [], project: [] };
  for (const record of ranking) {
    requireContract(record && typeof record === "object" && !Array.isArray(record), "every evidence_ranking record must be an object.");
    for (const field of ["entry", "type", "rank", "role_work_match", "selected"]) requireContract(Object.prototype.hasOwnProperty.call(record, field), `evidence_ranking is missing ${field}.`);
    requireContract(nonEmptyString(record.entry), "evidence_ranking.entry must be a non-empty string.");
    requireContract(nonEmptyString(record.role_work_match), "evidence_ranking.role_work_match must be a non-empty string.");
    requireContract(record.type === "experience" || record.type === "project", "evidence_ranking.type must be experience or project.");
    requireContract(Number.isInteger(record.rank) && record.rank >= 1, "evidence_ranking.rank must be a positive integer.");
    requireContract(typeof record.selected === "boolean", "evidence_ranking.selected must be a boolean.");
    ranks.push(record.rank);
    if (record.selected === true) selectedEntries[record.type].push(normalizeResumeBullet(record.entry));
  }
  requireContract(new Set(ranks).size === ranks.length, "evidence_ranking ranks must be unique.");
  for (const [rankingType, section] of [["experience", "experience"], ["project", "projects"]]) {
    const expectedEntries = spec[section].map((entry) => normalizeResumeBullet(entry.title));
    const actualEntries = selectedEntries[rankingType];
    requireContract(new Set(actualEntries).size === actualEntries.length, `evidence_ranking selected ${rankingType} entries must be unique.`);
    requireContract(actualEntries.length === expectedEntries.length
      && expectedEntries.every((entry) => actualEntries.includes(entry)), `evidence_ranking selected ${rankingType} entries must exactly match retained ${section}.`);
  }

  const audits = metadata.bullet_evidence_audit;
  requireContract(Array.isArray(audits) && audits.length === bullets.length, "metadata.bullet_evidence_audit requires exactly one record per rendered bullet.");
  const audited = [];
  for (const audit of audits) {
    requireContract(audit && typeof audit === "object" && !Array.isArray(audit), "every bullet_evidence_audit record must be an object.");
    for (const field of ["bullet", "target_responsibility", "selected_fact_sheet_evidence", "selection_reason", "problem", "mechanism", "implementation", "outcome", "quantity", "quantity_source", "quantity_category"]) {
      requireContract(nonEmptyString(audit[field]), `bullet_evidence_audit ${field} must be a non-empty string.`);
    }
    requireContract(QUANTITY_CATEGORIES.has(audit.quantity_category), `unsupported quantity_category ${audit.quantity_category}.`);
    if (audit.quantity_category === "other") requireContract(nonEmptyString(audit.quantity_category_explanation), "quantity_category other requires quantity_category_explanation.");
    const normalized = normalizeResumeBullet(audit.bullet);
    requireContract(normalizedBodySet.has(normalized), "an audited bullet is not present in the rendered body.");
    requireContract(QUANTITY_PATTERN.test(String(audit.quantity).trim()), "an audited quantity must itself contain an explicit numeric or number-word quantity.");
    requireContract(quantityAppearsInBullet(audit.quantity, audit.bullet), "an audited quantity does not appear as the same bounded quantity in its bullet.");
    requireContract(!LOW_VALUE_QUANTITY_PATTERNS.some((pattern) => pattern.test(String(audit.bullet))), "a bullet uses a prohibited constructed low-value quantity.");
    audited.push(normalized);
  }
  requireContract(new Set(audited).size === audited.length && audited.length === normalizedBodySet.size && audited.every((bullet) => normalizedBodySet.has(bullet)), "every rendered bullet must have exactly one evidence-audit record.");

  requireContract(spec.education && typeof spec.education === "object" && !Array.isArray(spec.education), "education must be an object.");
  requireContract(nonEmptyString(spec.education.school), "education.school is required.");
  requireContract(nonEmptyString(spec.education.degree), "education.degree is required.");
  requireContract(Array.isArray(spec.links) && spec.links.length > 0 && spec.links.every(nonEmptyString), "links must contain at least one public link.");
  requireContract(containsExactWebsite([...Object.values(contact), ...spec.links], metadata.required_website), "the exact required website URL must appear in contact or links.");

  return {
    tailoringVersion: metadata.tailoring_version,
    uniformBulletFontSize: metadata.uniform_bullet_font_size,
    bulletCount: bullets.length,
    bulletCounts,
  };
}

export {
  APPLICANT_NARRATION_PATTERNS,
  CURRENT_TAILORING_VERSION,
  INTERNAL_PROVENANCE_PATTERNS,
  QUANTITY_PATTERN,
};
