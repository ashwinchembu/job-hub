#!/usr/bin/env python3
"""Render a job-specific, one-page resume from a structured JSON specification."""

import argparse
import hashlib
import json
import re
import subprocess
import shutil
import unicodedata
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_W, PAGE_H = letter
LEFT = 34.5
RIGHT = PAGE_W - 34.5
TOP = PAGE_H - 14
BOTTOM = 12
TARGET_BOTTOM = 24
MAX_FILL_SCALE = 1.40
DEFAULT_BULLET_FONT_SIZE = 9.10
MIN_BULLET_FONT_SIZE = 9.00
MAX_BULLET_FONT_SIZE = 10.00
MAX_BULLET_LINES = 2
CURRENT_TAILORING_VERSION = 5
# The default pypdf spacing heuristic is too narrow for embedded Times New
# Roman and can invent spaces inside words (or drop real spaces) around bold
# runs. This width preserves the intended word boundaries more reliably; the
# exact source-bullet round-trip below remains the authoritative check.
ATS_EXTRACTION_SPACE_WIDTH = 240.0
EMPHASIS_SIZE_DELTA = 0.0
FONT_DIR = Path("/System/Library/Fonts/Supplemental")
BODY_FONT = "Resume-Times-New-Roman"
BODY_BOLD = "Resume-Times-New-Roman-Bold"
BODY_ITALIC = "Resume-Times-New-Roman-Italic"
BODY_BOLD_ITALIC = "Resume-Times-New-Roman-Bold-Italic"
EMPHASIS_FONT = BODY_BOLD
ENTRY_GAP = 2.2
BLUE = colors.HexColor("#2F6FD6")
EMPHASIS_COLOR = colors.HexColor("#111111")
BLACK = colors.HexColor("#111111")
GRAY = colors.HexColor("#333333")
REQUIRED_SECTIONS = ("contact", "profile", "skills", "experience", "projects", "education", "links")
ENTRY_STRENGTHS = {"strong", "moderate", "supporting", "mediocre", "insignificant"}
QUANTITY_CATEGORIES = {
    "records", "commits", "routes", "tests", "validated_workflows", "funding",
    "deployment_artifacts", "supported_users", "time", "size", "percentage", "other",
}
LOW_VALUE_QUANTITY_PATTERNS = (
    re.compile(r"\b2 input types\b", re.IGNORECASE),
    re.compile(r"\b3 delivery surfaces\b", re.IGNORECASE),
)
GENERIC_TAILORING_PHRASES = (
    "the grounded workflow keeps model-backed product behavior explainable and testable",
    "the implementation connects applied ai services with a reliable customer interface",
    "the evidence supports observability, proactive failure detection, and safe iteration",
    "the result demonstrates end-to-end delivery across retrieval, apis, and react workflows",
    "the implementation makes technical decisions reviewable across product and engineering",
    "the product evidence maps to performant ai experiences with explicit trust boundaries",
    "the documented checks preserve quality while moving quickly in an ambiguous domain",
    "model behavior stayed testable",
)
INTERNAL_PROVENANCE_PATTERNS = (
    re.compile(r"\bsource\s*:", re.IGNORECASE),
    re.compile(r"\bevidence\s*:", re.IGNORECASE),
    re.compile(r"\bquantity[_ ]source\s*:", re.IGNORECASE),
)
APPLICANT_NARRATION_PATTERNS = (
    re.compile(
        r"\bthis\s+(?:(?:verified|documented|reviewed|auditable)\s+)?"
        r"(?:(?:work|implementation|result|evidence|project|system|delivery|experience)\s+)?"
        r"(?:supports?|demonstrates?|shows?|proves?|validates?)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bthe\s+(?:verified\s+)?(?:evidence|result|work)\s+"
        r"(?:supports?|demonstrates?|shows?|proves?|validates?)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bthe\s+result\s+demonstrates?\b", re.IGNORECASE),
    re.compile(r"\bwithout\s+claiming\b", re.IGNORECASE),
    re.compile(r"\bnot\s+claiming\b", re.IGNORECASE),
    re.compile(r"\bwhile\s+claiming\s+only\b", re.IGNORECASE),
    re.compile(r"\b(?:is|are|was|were)\s+not\s+claimed\b", re.IGNORECASE),
    re.compile(r"\bwithout\s+overstating\b", re.IGNORECASE),
    re.compile(r"\b(?:verified\s+)?scope\s+stayed\b", re.IGNORECASE),
    re.compile(r"\b(?:evaluation|healthcare)\s+evidence\s+stayed\b", re.IGNORECASE),
    re.compile(r"\b(?:ownership|claim)\s+boundar(?:y|ies)\b", re.IGNORECASE),
    re.compile(
        r"\b(?:(?:workflow|product|implementation|healthcare|evaluation)\s+)?"
        r"evidence\s+(?:stayed|remained)\s+(?:auditable|reviewable|traceable|bounded)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bthrough\s+(?:reviewed\s+data\s+flow|verified\s+ownership\s+boundaries|"
        r"source-backed\s+tests|auditable\s+delivery\s+records|measurable\s+validation\s+output|"
        r"scoped\s+product\s+evidence)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:^|[.!?]\s+)supports?\s+(?:reliable|auditable|observable|maintainable|tested|"
        r"developer|customer|operational|cross-functional|cross-stack|data-rich|phased|"
        r"performance|database|api|agent|full-stack|billing|product|system)",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:the\s+)?(?:(?:release|review|workflow|deployment|funding|scoped|verified)\s+)?"
        r"(?:evidence|boundary|chronology|claim|ownership|usage)\s+"
        r"(?:remains?|remained|stays?|stayed)\s+"
        r"(?:reproducible|traceable|auditable|reviewable|explicit|attributable|attributed|limited|tied)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bthe\s+inspected\s+artifact\s+remains\s+the\s+release\s+evidence\b", re.IGNORECASE),
    re.compile(
        r"\bthe\s+(?:implementation|evidence|result|work|project|system)\s+"
        r"(?:connects?|preserves?|maps?|links?)\b",
        re.IGNORECASE,
    ),
)
TECTONIC = Path(__file__).with_name("tools") / "tectonic-0.17.0" / "tectonic"
if not TECTONIC.is_file():
    tectonic_on_path = shutil.which("tectonic")
    if tectonic_on_path:
        TECTONIC = Path(tectonic_on_path)
QUANTIFIED_IMPACT_RE = re.compile(
    r"(?:\bfive[ -]figures\b|\b\d[\d,.]*(?:[KkMmBb])?(?:\+|%)?(?=$|[^A-Za-z0-9_])|\$\s*\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b)",
    re.IGNORECASE,
)

FONT_FILES = {
    BODY_FONT: FONT_DIR / "Times New Roman.ttf",
    BODY_BOLD: FONT_DIR / "Times New Roman Bold.ttf",
    BODY_ITALIC: FONT_DIR / "Times New Roman Italic.ttf",
    BODY_BOLD_ITALIC: FONT_DIR / "Times New Roman Bold Italic.ttf",
}
if all(path.is_file() for path in FONT_FILES.values()):
    for font_name, path in FONT_FILES.items():
        pdfmetrics.registerFont(TTFont(font_name, str(path)))
else:
    BODY_FONT = "Times-Roman"
    BODY_BOLD = "Times-Bold"
    BODY_ITALIC = "Times-Italic"
    BODY_BOLD_ITALIC = "Times-BoldItalic"
    EMPHASIS_FONT = BODY_BOLD


def sha256_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def width(text, font, size):
    return stringWidth(text, font, size)


def split_marked(text):
    parts = str(text).split("**")
    tokens = []
    bold = False
    for part in parts:
        if part:
            tokens.append((part, bold))
        bold = not bold
    return tokens


def token_words(marked):
    """Return whitespace-delimited words with ATS-safe style boundaries.

    A word can contain several styled fragments, such as ``("Node.js", bold)``
    followed immediately by ``("/Express", regular)``. Font switches inside a
    whitespace-delimited token can make PDF extractors invent spaces around
    slashes, hyphens, or adjacent product names. When any part of a token is
    emphasized, render the complete token in the bold face so the visible text
    and ATS text retain the same character sequence.
    """

    def complete_word(fragments):
        merged = coalesce_fragments(fragments)
        if any(bold for _, bold in merged) and not all(bold for _, bold in merged):
            return [("".join(text for text, _ in merged), True)]
        return merged

    words = []
    current = []
    for part, bold in split_marked(marked):
        for token in re.split(r"(\s+)", part):
            if not token:
                continue
            if token.isspace():
                if current:
                    words.append(complete_word(current))
                    current = []
            elif current and current[-1][1] == bold:
                current[-1] = (current[-1][0] + token, bold)
            else:
                current.append((token, bold))
    if current:
        words.append(complete_word(current))
    return words


def wrap_words(marked, max_w, size):
    word_groups = token_words(marked)
    word_widths = [
        sum(
            width(text, EMPHASIS_FONT if bold else BODY_FONT, size + EMPHASIS_SIZE_DELTA if bold else size)
            for text, bold in word_fragments
        )
        for word_fragments in word_groups
    ]
    space_w = width(" ", BODY_FONT, size)
    line_words, current, current_w = [], [], 0
    for word_fragments, word_w in zip(word_groups, word_widths):
        gap_w = space_w if current else 0
        if current and current_w + gap_w + word_w > max_w:
            line_words.append(current)
            current, current_w = list(word_fragments), word_w
        else:
            if current:
                current.append((" ", False))
                current_w += gap_w
            current.extend(word_fragments)
            current_w += word_w
    if current:
        line_words.append(current)
    return [coalesce_fragments(line) for line in line_words]


def coalesce_fragments(fragments):
    """Merge adjacent fragments that use the same font style.

    Fewer PDF text operations preserve natural ATS extraction while still
    allowing restrained inline emphasis at actual style boundaries.
    """
    merged = []
    for text, bold in fragments:
        if merged and merged[-1][1] == bold:
            merged[-1] = (merged[-1][0] + text, bold)
        else:
            merged.append((text, bold))
    return merged


def configured_bullet_font_size(spec):
    size = float(spec.get("metadata", {}).get("uniform_bullet_font_size", DEFAULT_BULLET_FONT_SIZE))
    require(
        MIN_BULLET_FONT_SIZE <= size <= MAX_BULLET_FONT_SIZE,
        f"uniform_bullet_font_size must be between {MIN_BULLET_FONT_SIZE:.2f} and {MAX_BULLET_FONT_SIZE:.2f} points",
    )
    return size


def validate_current_tailoring_contract(spec):
    """Require the exact schema supported by the current resume build path.

    Older specifications remain readable by the inherited validation helpers for
    historical audit, but they must not be rebuilt or substituted into a mutable
    application package as if they satisfied the current contract.
    """
    metadata = spec.get("metadata", {})
    version = int(metadata.get("tailoring_version", 2))
    require(
        version == CURRENT_TAILORING_VERSION,
        f"Current resume builds require metadata.tailoring_version = {CURRENT_TAILORING_VERSION}; "
        f"version {version} is historical or unsupported and remains audit-only.",
    )
    require(
        "uniform_bullet_font_size" in metadata,
        "v5 specs require an explicit metadata.uniform_bullet_font_size shared by every Experience and Projects bullet",
    )
    configured_bullet_font_size(spec)


def reject_applicant_narration(text, context):
    for pattern in APPLICANT_NARRATION_PATTERNS:
        match = pattern.search(str(text))
        if match is not None:
            require(
                False,
                f"{context} contains audit-style narration ({match.group(0)!r}). "
                "Write the accomplishment directly and keep provenance or claim boundaries in private audit metadata.",
            )


def emphasize_keywords(marked, keywords, limit=4):
    """Bold a small number of verified job terms without changing ATS text."""
    remaining = limit
    result = []
    ordered = sorted({str(keyword) for keyword in keywords if str(keyword).strip()}, key=len, reverse=True)
    for part, already_bold in split_marked(marked):
        if already_bold or not remaining or not ordered:
            result.append(f"**{part}**" if already_bold else part)
            continue
        pattern = r"(?<![A-Za-z0-9])(" + "|".join(re.escape(keyword) for keyword in ordered) + r")([,:;.]?)(?![A-Za-z0-9])"
        def replace(match):
            nonlocal remaining
            if remaining <= 0:
                return match.group(0)
            remaining -= 1
            return f"**{match.group(0)}**"
        result.append(re.sub(pattern, replace, part, flags=re.IGNORECASE))
    return "".join(result)


def emphasize_metrics(marked):
    """Bold every explicit quantity while preserving existing marked spans."""
    result = []
    for part, already_bold in split_marked(marked):
        if already_bold:
            result.append(f"**{part}**")
        else:
            result.append(QUANTIFIED_IMPACT_RE.sub(lambda match: f"**{match.group(0)}**", part))
    return "".join(result)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def has_quantified_impact(bullet):
    """Return whether a bullet contains an explicit, auditable quantity."""
    return bool(QUANTIFIED_IMPACT_RE.search(str(bullet)))


def normalized_bullet(value):
    return re.sub(r"\s+", " ", str(value).strip()).lower()


def all_body_bullets(spec):
    return [
        str(bullet)
        for section in ("experience", "projects")
        for entry in spec[section]
        for bullet in entry["bullets"]
    ]


def validate_v4_selection_audit(spec):
    """Require a complete, job-specific selection audit for v4+ specifications."""
    metadata = spec["metadata"]
    if int(metadata.get("tailoring_version", 2)) < 4:
        return

    entry_exception = metadata.get("entry_count_exception")
    if entry_exception:
        require(
            isinstance(entry_exception, dict)
            and entry_exception.get("approved_by_user") is True
            and entry_exception.get("reason"),
            "A non-default entry count requires a user-approved entry_count_exception with a reason",
        )
    else:
        require(len(spec["experience"]) == 3, "v4 resumes require exactly three experience entries by default")
        require(len(spec["projects"]) == 3, "v4 resumes require exactly three project entries by default")

    analysis = metadata.get("job_analysis")
    require(isinstance(analysis, dict), "v4 specs require metadata.job_analysis")
    for field in ("responsibilities", "repeated_keywords", "hard_requirements", "preferred_requirements"):
        require(isinstance(analysis.get(field), list), f"job_analysis.{field} must be a list")
    require(analysis["responsibilities"], "job_analysis.responsibilities cannot be empty")
    require(len(analysis["repeated_keywords"]) >= 3, "job_analysis needs at least three repeated keywords")
    require(analysis.get("domain"), "job_analysis.domain is required")
    require(analysis.get("seniority"), "job_analysis.seniority is required")

    ranking = metadata.get("evidence_ranking")
    require(isinstance(ranking, list) and len(ranking) >= 6, "v4 specs require at least six evidence_ranking records")
    ranks = []
    selected_types = {"experience": 0, "project": 0}
    for record in ranking:
        require(isinstance(record, dict), "Each evidence_ranking record must be an object")
        for field in ("entry", "type", "rank", "role_work_match", "selected"):
            require(field in record and record[field] != "", f"evidence_ranking is missing {field}")
        require(record["type"] in selected_types, "evidence_ranking.type must be experience or project")
        require(isinstance(record["rank"], int) and record["rank"] >= 1, "evidence_ranking.rank must be a positive integer")
        ranks.append(record["rank"])
        if record["selected"] is True:
            selected_types[record["type"]] += 1
    require(len(ranks) == len(set(ranks)), "evidence_ranking ranks must be unique")
    require(
        selected_types == {"experience": len(spec["experience"]), "project": len(spec["projects"])},
        "evidence_ranking selected counts must match the retained experiences and projects",
    )
    selected_entries = {
        kind: sorted(
            normalized_bullet(record["entry"])
            for record in ranking
            if record["type"] == kind and record["selected"] is True
        )
        for kind in selected_types
    }
    retained_entries = {
        "experience": sorted(normalized_bullet(entry["title"]) for entry in spec["experience"]),
        "project": sorted(normalized_bullet(entry["title"]) for entry in spec["projects"]),
    }
    require(
        selected_entries == retained_entries,
        "evidence_ranking selected entries must exactly match the retained experiences and projects",
    )

    body_bullets = all_body_bullets(spec)
    normalized_body = [normalized_bullet(bullet) for bullet in body_bullets]
    require(len(normalized_body) == len(set(normalized_body)), "Rendered body bullets must be unique")
    for bullet in normalized_body:
        require(
            not any(phrase in bullet for phrase in GENERIC_TAILORING_PHRASES),
            "Replace generic tailoring filler with a verified mechanism or outcome: " + bullet,
        )
    body_sentences = [
        normalized_bullet(sentence)
        for bullet in body_bullets
        for sentence in re.split(r"(?<=[.!?])\s+", str(bullet))
        if len(sentence.split()) >= 8
    ]
    repeated_sentences = sorted({sentence for sentence in body_sentences if body_sentences.count(sentence) > 1})
    require(
        not repeated_sentences,
        "Resume bullets reuse the same long sentence; replace boilerplate with job-specific evidence: "
        + "; ".join(repeated_sentences),
    )
    audits = metadata.get("bullet_evidence_audit")
    require(isinstance(audits, list) and len(audits) == len(body_bullets), "v4 requires one bullet_evidence_audit record for every rendered bullet")
    audited = []
    for audit in audits:
        require(isinstance(audit, dict), "Each bullet_evidence_audit record must be an object")
        for field in (
            "bullet", "target_responsibility", "selected_fact_sheet_evidence", "selection_reason",
            "problem", "mechanism", "implementation", "outcome", "quantity", "quantity_source",
            "quantity_category",
        ):
            require(audit.get(field), f"v4 bullet_evidence_audit is missing {field}")
        require(audit["quantity_category"] in QUANTITY_CATEGORIES, f"Unsupported quantity_category: {audit['quantity_category']}")
        if audit["quantity_category"] == "other":
            require(audit.get("quantity_category_explanation"), "quantity_category=other needs quantity_category_explanation")
        normalized = normalized_bullet(audit["bullet"])
        require(normalized in normalized_body, "Audited bullet is not present in the rendered body")
        require(str(audit["quantity"]).lower() in str(audit["bullet"]).lower(), "Audited quantity must appear in its bullet")
        require(
            not any(pattern.search(str(audit["bullet"])) for pattern in LOW_VALUE_QUANTITY_PATTERNS),
            "Replace constructed counts such as '2 input types' or '3 delivery surfaces' with stronger verified evidence",
        )
        audited.append(normalized)
    require(
        set(audited) == set(normalized_body) and len(audited) == len(set(audited)),
        "Every rendered bullet must have exactly one evidence-audit record",
    )

    summary = str(metadata.get("body_tailoring_summary", ""))
    require(
        not summary.lower().startswith("reordered and selected verified experience and project evidence"),
        "body_tailoring_summary must describe material evidence choices, not only reordering",
    )


def validate_cross_job_tailoring(spec, spec_path):
    """Reject reordered copies of a prior role body and flag unusually high reuse."""
    if int(spec.get("metadata", {}).get("tailoring_version", 2)) < 4:
        return
    current = set(map(normalized_bullet, all_body_bullets(spec)))
    specs_root = spec_path.parent.parent
    if not specs_root.is_dir():
        return
    justifications = {
        str(item.get("comparison_slug")): item
        for item in spec.get("metadata", {}).get("reuse_justifications", [])
        if isinstance(item, dict)
    }
    for candidate in specs_root.glob("*/resume_spec.json"):
        if candidate.resolve() == spec_path.resolve():
            continue
        try:
            prior = json.loads(candidate.read_text(encoding="utf-8"))
            prior_body = set(map(normalized_bullet, all_body_bullets(prior)))
        except (OSError, ValueError, KeyError, TypeError):
            continue
        if not prior_body:
            continue
        prior_meta = prior.get("metadata", {})
        same_target = (
            normalized_bullet(prior_meta.get("company")) == normalized_bullet(spec["metadata"].get("company"))
            and normalized_bullet(prior_meta.get("role")) == normalized_bullet(spec["metadata"].get("role"))
        )
        overlap = len(current & prior_body) / min(len(current), len(prior_body))
        if current == prior_body and not same_target:
            raise ValueError(f"Resume body is identical to {candidate}; reordering the same bullet set is not job-specific tailoring")
        if overlap > 0.80 and not same_target:
            prior_slug = str(prior_meta.get("slug", candidate.parent.name))
            justification = justifications.get(prior_slug, {})
            require(
                justification.get("materially_identical_requirements") is True and justification.get("reason"),
                f"Resume reuses {overlap:.0%} of {prior_slug}; record a materially-identical-requirements justification or select stronger role-specific evidence",
            )


def required_website(spec):
    explicit = str(spec.get("metadata", {}).get("required_website", "")).strip()
    if explicit:
        return explicit
    searchable = " ".join(
        [str(value) for value in spec.get("contact", {}).values()]
        + [str(link) for link in spec.get("links", [])]
    )
    match = re.search(r"https?://(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[^\s|]*)?", searchable)
    return match.group(0) if match else ""


def tex_escape(text):
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in str(text))


def fragments_to_tex(fragments):
    rendered = []
    for text, bold in fragments:
        escaped = tex_escape(text)
        rendered.append(r"{\bfseries " + escaped + "}" if bold else escaped)
    return "".join(rendered)


def marked_to_tex(marked):
    return fragments_to_tex(split_marked(marked))


def latex_bullet(marked, emphasis_terms, uniform_size=DEFAULT_BULLET_FONT_SIZE):
    emphasized = emphasize_keywords(marked, emphasis_terms)
    size = float(uniform_size)
    lines = wrap_words(emphasized, RIGHT - LEFT - 10, size)
    require(
        1 <= len(lines) <= MAX_BULLET_LINES,
        f"Bullet wraps to {len(lines)} lines at the uniform {size:.2f}-point size. "
        f"Shorten the accomplishment instead of shrinking only this bullet: {marked}",
    )
    leading = size + 0.75
    rendered_lines = [fragments_to_tex(lines[0])]
    rendered_lines.extend(r"\\*" + "\n" + r"\hspace*{1.1em}" + fragments_to_tex(line) for line in lines[1:])
    return (
        r"\noindent\fontsize{" + f"{size:.2f}" + "}{" + f"{leading:.2f}" +
        r"}\selectfont\hangindent=1.1em\hangafter=1\textbullet\hspace{0.45em}"
        + "".join(rendered_lines) + r"\par" + "\n"
    )


def render_latex(spec, output):
    require(TECTONIC.is_file(), f"Missing LaTeX engine: {TECTONIC}")
    output.parent.mkdir(parents=True, exist_ok=True)
    emphasis_terms = spec["metadata"]["emphasis_terms"]
    uniform_bullet_size = configured_bullet_font_size(spec)
    contact = spec["contact"]
    body = []
    body.append(r"\begin{center}")
    body.append(r"{\fontsize{18}{19}\selectfont\bfseries\color{headingblue} " + tex_escape(contact["name"]) + r"}\\[-1pt]")
    body.append(r"{\fontsize{8.8}{9.5}\selectfont " + tex_escape(" | ".join([contact["phone"], contact["email"], contact["location"]])) + r"}")
    body.append(r"\end{center}\vspace{-5pt}")

    def section(title):
        body.append(r"\sectionline{" + tex_escape(title.upper()) + r"}")

    section("Profile")
    body.append(tex_escape(spec["profile"]) + r"\par")
    section("Technical Skills")
    for row in spec["skills"]:
        skill_items = tex_escape(row["items"]).replace("UAT", r"{\fontspec{Arial}UAT}")
        body.append(r"\textbf{" + tex_escape(row["label"] + ":") + "} " + skill_items + r"\par")

    for section_name, entries in (("Experience", spec["experience"]), ("Projects", spec["projects"])):
        section(section_name)
        ordered_entries = sorted(entries, key=lambda entry: entry.get("entry_priority", 999))
        for entry in ordered_entries:
            body.append(r"\roleline{" + tex_escape(entry["title"]) + "}{" + tex_escape(entry["date"]) + "}")
            summary = entry.get("summary", "")
            tech = entry.get("tech", "")
            if summary or tech:
                body.append(r"\metaflow{" + tex_escape(summary) + "}{" + tex_escape(tech) + "}")
            for bullet in entry["bullets"]:
                body.append(latex_bullet(bullet, emphasis_terms, uniform_bullet_size))

    education = spec["education"]
    section("Education")
    education_text = f"{education['school']} | {education['degree']}"
    if education.get("gpa"):
        education_text += f" | GPA: {education['gpa']}"
    body.append(r"\roleline{" + tex_escape(education_text) + "}{" + tex_escape(education.get("date", "")) + "}")
    if education.get("coursework"):
        body.append(tex_escape("Relevant Foundation: " + education["coursework"]) + r"\par")
    if spec.get("publication"):
        section("Publication")
        body.append(marked_to_tex(spec["publication"]) + r"\par")
    section("Links")
    body.append(tex_escape(" | ".join(spec["links"])) + r"\par")

    tex = r"""\documentclass[10pt,letterpaper]{article}
\usepackage[left=0.48in,right=0.48in,top=0.30in,bottom=0.30in]{geometry}
\usepackage{fontspec}
\usepackage{xcolor}
\usepackage[hidelinks]{hyperref}
\pagestyle{empty}
\setmainfont[Ligatures=NoCommon]{Times New Roman}
\definecolor{headingblue}{HTML}{2F6FD6}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\hyphenpenalty=10000
\exhyphenpenalty=10000
\emergencystretch=1em
\newcommand{\sectionline}[1]{\vspace{2.4pt}{\fontsize{10.4}{10.9}\selectfont\bfseries\strut #1}\par\vspace{0.8pt}\hrule height 0.7pt\vspace{2.0pt}}
\newcommand{\roleline}[2]{\vspace{2.2pt}\noindent{\fontsize{9.1}{9.5}\selectfont\bfseries #1}\hfill{\fontsize{8.3}{9}\selectfont\bfseries #2}\par}
\newcommand{\metaflow}[2]{\noindent{\fontsize{7.7}{8.4}\selectfont\bfseries\itshape #1}\hfill{\fontsize{7.5}{8.2}\selectfont\itshape #2}\par}
\begin{document}
\fontsize{8.15}{9.2}\selectfont
""" + "\n".join(body) + "\n" + r"\end{document}" + "\n"
    tex_path = output.with_suffix(".tex")
    tex_path.write_text(tex, encoding="utf-8")
    result = subprocess.run(
        [str(TECTONIC), "--keep-logs", "--outdir", str(output.parent), str(tex_path)],
        text=True,
        capture_output=True,
    )
    require(result.returncode == 0, f"LaTeX build failed:\n{result.stdout}\n{result.stderr}")
    require(output.is_file(), f"LaTeX did not create expected PDF: {output}")


def validate_spec(spec, *, require_current_version=False):
    for section in REQUIRED_SECTIONS:
        require(section in spec, f"Missing required specification section: {section}")

    metadata = spec.get("metadata", {})
    require(metadata.get("company"), "metadata.company is required")
    require(metadata.get("role"), "metadata.role is required")
    require(metadata.get("slug"), "metadata.slug is required")
    require(re.fullmatch(r"[a-z0-9][a-z0-9_-]*", metadata["slug"]), "metadata.slug must be filesystem safe")
    require(metadata.get("job_description_source"), "metadata.job_description_source is required")
    require(metadata.get("selection_rationale"), "metadata.selection_rationale is required")
    require(len(metadata.get("matched_keywords", [])) >= 3, "Include at least three matched job keywords")
    require(len(metadata.get("emphasis_terms", [])) >= 3, "Include at least three complete emphasis phrases")
    require(metadata.get("facts_reviewed_at"), "metadata.facts_reviewed_at is required; reread the fact sheet before every build")
    require(metadata.get("fact_sheet_sha256"), "metadata.fact_sheet_sha256 is required; refresh the spec after fact-sheet changes")
    require(metadata.get("tailoring_standard_sha256"), "metadata.tailoring_standard_sha256 is required; refresh the spec after standard changes")

    tailoring_version = int(metadata.get("tailoring_version", 2))
    if tailoring_version >= CURRENT_TAILORING_VERSION:
        require(
            "uniform_bullet_font_size" in metadata,
            "v5 specs require an explicit metadata.uniform_bullet_font_size shared by every Experience and Projects bullet",
        )
    if require_current_version:
        validate_current_tailoring_contract(spec)
    if tailoring_version >= 3:
        require(metadata.get("body_tailoring_summary"), "v3 specs require metadata.body_tailoring_summary")
        require(
            isinstance(metadata.get("omitted_requirements"), list) and metadata["omitted_requirements"],
            "v3 specs require a non-empty metadata.omitted_requirements list",
        )
        role_specific_bullets = metadata.get("role_specific_bullets", [])
        require(isinstance(role_specific_bullets, list) and len(role_specific_bullets) >= 7,
                "v3 specs require materially role-specific bullets")
        require(
            isinstance(metadata.get("bullet_evidence_audit"), list)
            and len(metadata["bullet_evidence_audit"]) >= 7,
            "v3 specs require at least seven bullet_evidence_audit records",
        )

    contact = spec["contact"]
    for field in ("name", "phone", "email", "location"):
        require(contact.get(field), f"contact.{field} is required")

    applicant_facing_parts = [
        *contact.values(),
        spec.get("profile", ""),
        *(f"{row.get('label', '')} {row.get('items', '')}" for row in spec.get("skills", [])),
        *(
            value
            for section in ("experience", "projects")
            for entry in spec.get(section, [])
            for value in (
                entry.get("title", ""), entry.get("date", ""), entry.get("summary", ""),
                entry.get("tech", ""), *entry.get("bullets", []),
            )
        ),
        *spec.get("education", {}).values(),
        *spec.get("certifications", []),
        spec.get("publication", ""),
        *spec.get("links", []),
    ]
    applicant_facing_text = "\n".join(str(value) for value in applicant_facing_parts if value)
    for pattern in INTERNAL_PROVENANCE_PATTERNS:
        require(
            not pattern.search(applicant_facing_text),
            "Applicant-facing resume text contains an internal provenance label. Keep source and evidence references only in selection notes and bullet_evidence_audit metadata.",
        )
    reject_applicant_narration(applicant_facing_text, "Applicant-facing resume text")
    configured_bullet_font_size(spec)

    require(1 <= len(spec["skills"]) <= 5, "Use one to five targeted skill rows")
    for row in spec["skills"]:
        require(row.get("label") and row.get("items"), "Every skill row needs label and items")

    bullet_counts = []
    body_text_parts = []
    for section in ("experience", "projects"):
        require(3 <= len(spec[section]) <= 4, f"Use three to four {section} entries")
        section_priorities = []
        for entry in spec[section]:
            require(entry.get("title"), f"Every {section} entry needs a title")
            require(entry.get("date"), f"Every {section} entry needs a date")
            strength = str(entry.get("strength", "")).lower().strip()
            require(
                strength in ENTRY_STRENGTHS,
                f"'{entry.get('title')}' needs strength: strong, moderate, or supporting",
            )
            if tailoring_version >= 3:
                target_matches = entry.get("target_matches", [])
                require(
                    isinstance(target_matches, list) and 2 <= len(target_matches) <= 5,
                    f"v3 entry '{entry.get('title')}' needs two to five target_matches",
                )
                require(entry.get("selection_reason"), f"v3 entry '{entry.get('title')}' needs selection_reason")
                priority = entry.get("entry_priority")
                require(isinstance(priority, int) and priority >= 1, f"v3 entry '{entry.get('title')}' needs a positive entry_priority")
                section_priorities.append(priority)
                entry_bullet_text = " ".join(entry.get("bullets", [])).lower()
            bullets = entry.get("bullets", [])
            require(
                3 <= len(bullets) <= 5,
                f"'{entry.get('title')}' needs three to five substantive bullets",
            )
            bullet_counts.append(len(bullets))
            body_text_parts.extend([entry.get("title", ""), entry.get("summary", ""), entry.get("tech", ""), *bullets])
            for bullet in bullets:
                require(35 <= len(bullet) <= 320, f"Bullet length is unsuitable in '{entry.get('title')}'")
                require(not re.match(r"^(I|My|We|Our)\b", bullet, re.I), "Resume bullets must not use first-person pronouns")
                require(
                    has_quantified_impact(bullet),
                    f"Every bullet needs explicit, verified impact quantification; missing in '{entry.get('title')}': {bullet}",
                )

        if tailoring_version >= 3:
            require(
                len(section_priorities) == len(set(section_priorities)),
                f"v3 entry_priority values must be unique within {section}",
            )
    require(5 in bullet_counts, "At least one retained entry must contain five bullets")
    require(4 in bullet_counts, "At least one retained entry must contain four bullets")
    if tailoring_version >= 3:
        body_text = " ".join(body_text_parts).lower()
        body_matches = [keyword for keyword in metadata["matched_keywords"] if str(keyword).lower() in body_text]
        minimum_body_matches = max(3, (len(metadata["matched_keywords"]) + 1) // 2)
        require(
            len(body_matches) >= minimum_body_matches,
            f"v3 body tailoring is too shallow: {len(body_matches)}/{len(metadata['matched_keywords'])} matched keywords appear in experience/projects; need {minimum_body_matches}",
        )
        normalized_body_bullets = {
            re.sub(r"\s+", " ", str(bullet).strip()).lower()
            for section in ("experience", "projects")
            for entry in spec[section]
            for bullet in entry["bullets"]
        }
        normalized_role_bullets = {
            re.sub(r"\s+", " ", str(bullet).strip()).lower()
            for bullet in metadata["role_specific_bullets"]
        }
        require(
            normalized_role_bullets <= normalized_body_bullets,
            "Every v3 role_specific_bullet must exactly match a rendered body bullet",
        )
        for audit in metadata["bullet_evidence_audit"]:
            require(isinstance(audit, dict), "Each bullet_evidence_audit record must be an object")
            for field in ("bullet", "problem", "mechanism", "implementation", "outcome"):
                require(audit.get(field), f"bullet_evidence_audit is missing {field}")
            normalized_audit_bullet = re.sub(r"\s+", " ", str(audit["bullet"]).strip()).lower()
            require(normalized_audit_bullet in normalized_body_bullets, "Audited bullet is not present in the rendered body")

    validate_v4_selection_audit(spec)

    require(spec["education"].get("school"), "education.school is required")
    require(spec["education"].get("degree"), "education.degree is required")
    require(spec["links"], "At least one public link is required")
    website = required_website(spec)
    require(website, "metadata.required_website or a portfolio URL in contact/links is required")
    normalized_links = " ".join(str(link).lower() for link in spec["links"])
    normalized_contact = " ".join(str(value).lower() for value in contact.values())
    require(
        website.lower().removeprefix("https://").removeprefix("http://")
        in f"{normalized_contact} {normalized_links}",
        f"Resume contact or links must include the required website: {website}",
    )


class DynamicResume:
    def __init__(self, output, keywords, emphasis_terms, fill_scale=1.0, bullet_font_size=DEFAULT_BULLET_FONT_SIZE):
        output.parent.mkdir(parents=True, exist_ok=True)
        self.output = output
        self.c = canvas.Canvas(str(output), pagesize=letter)
        self.y = TOP
        self.fill_scale = fill_scale
        self.keywords = keywords
        self.emphasis_terms = emphasis_terms
        self.bullet_font_size = float(bullet_font_size)

    def move(self, points):
        self.y -= points * self.fill_scale

    def draw(self, x, y, text, font=BODY_FONT, size=8, color=BLACK):
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawString(x, y, str(text))

    def centered(self, y, text, font=BODY_FONT, size=8, color=BLACK):
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawCentredString(PAGE_W / 2, y, str(text))

    def right(self, y, text, font=BODY_FONT, size=8, color=BLACK):
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawRightString(RIGHT, y, str(text))

    def marked_line(self, x, y, marked, size=8, color=BLACK):
        self.marked_segments(x, y, split_marked(marked), size, color)

    def marked_segments(self, x, y, segments, size=8, color=BLACK):
        text_object = self.c.beginText(x, y)
        for text, bold in coalesce_fragments(segments):
            text_object.setFillColor(EMPHASIS_COLOR if bold else color)
            text_object.setFont(
                EMPHASIS_FONT if bold else BODY_FONT,
                size + EMPHASIS_SIZE_DELTA if bold else size,
            )
            text_object.textOut(text)
        self.c.drawText(text_object)

    def paragraph(self, marked, size=8.35, leading=9.1):
        for line in wrap_words(marked, RIGHT - LEFT, size):
            self.marked_segments(LEFT, self.y, line, size)
            self.move(leading)

    def header(self, contact):
        self.centered(self.y, contact["name"], BODY_BOLD, 17.6, BLUE)
        details = " | ".join([contact["phone"], contact["email"], contact["location"]])
        self.centered(self.y - 14, details, BODY_FONT, 8.8)
        self.move(28.5)

    def section(self, title, compact=False):
        if compact:
            self.move(2)
        self.draw(LEFT, self.y, title.upper(), BODY_BOLD, 10.5)
        self.c.setStrokeColor(BLACK)
        self.c.setLineWidth(1.1)
        self.c.line(LEFT, self.y - 3, RIGHT, self.y - 3)
        self.move(12.4)

    def role(self, entry, add_top_gap=False):
        if add_top_gap:
            self.move(ENTRY_GAP)
        self.draw(LEFT, self.y, entry["title"], BODY_BOLD, 9.3)
        self.right(self.y, entry["date"], BODY_BOLD, 8.45)
        self.move(9.8)
        summary = entry.get("summary", "")
        tech = entry.get("tech", "")
        if summary and tech:
            summary_width = width(summary, BODY_BOLD_ITALIC, 7.9)
            tech_width = width(tech, BODY_ITALIC, 7.75)
            if summary_width + tech_width + 14 <= RIGHT - LEFT:
                self.draw(LEFT, self.y, summary, BODY_BOLD_ITALIC, 7.9, GRAY)
                self.right(self.y, tech, BODY_ITALIC, 7.75, GRAY)
                self.move(8.8)
            else:
                self.draw(LEFT, self.y, summary, BODY_BOLD_ITALIC, 7.9, GRAY)
                self.move(8.4)
                self.right(self.y, tech, BODY_ITALIC, 7.75, GRAY)
                self.move(8.6)
        elif summary:
            self.draw(LEFT, self.y, summary, BODY_BOLD_ITALIC, 7.9, GRAY)
            self.move(8.8)
        elif tech:
            self.right(self.y, tech, BODY_ITALIC, 7.75, GRAY)
            self.move(8.8)
        for bullet in entry["bullets"]:
            self.bullet(bullet)

    def bullet(self, marked):
        indent = 10
        max_w = RIGHT - LEFT - indent
        size = self.bullet_font_size
        leading = size + 0.75
        emphasized = emphasize_keywords(marked, self.emphasis_terms)
        lines = wrap_words(emphasized, max_w, size)
        require(
            1 <= len(lines) <= MAX_BULLET_LINES,
            f"Bullet wraps to {len(lines)} lines at the uniform {size:.2f}-point size. "
            f"Shorten the accomplishment instead of shrinking only this bullet: {marked}",
        )
        self.c.setFillColor(BLACK)
        self.c.circle(LEFT + 3.2, self.y + 2.1, 1.05, stroke=0, fill=1)
        for line_index, line in enumerate(lines):
            self.marked_segments(
                LEFT + indent,
                self.y - line_index * leading * self.fill_scale,
                line,
                size,
            )
        self.move(len(lines) * leading + 1.15)

    def skills(self, rows):
        for row in rows:
            label = f"{row['label']}:"
            self.draw(LEFT, self.y, label, BODY_BOLD, 8.45)
            self.marked_line(LEFT + width(label + " ", BODY_BOLD, 8.45), self.y, row["items"], 8.45)
            self.move(9.4)
        self.move(1)

    def finish(self):
        if self.y < BOTTOM:
            raise RuntimeError(
                f"Dynamic resume overflowed one page by {BOTTOM - self.y:.1f} points. "
                "Remove lower-value sections or shorten bullets; do not bypass the required five- and four-bullet entries."
            )
        self.c.showPage()
        self.c.save()


def render(spec, output, fill_scale=1.0):
    resume = DynamicResume(
        output,
        spec["metadata"]["matched_keywords"],
        spec["metadata"]["emphasis_terms"],
        fill_scale,
        configured_bullet_font_size(spec),
    )
    resume.header(spec["contact"])
    resume.section("Profile")
    resume.paragraph(spec["profile"])
    resume.move(1)
    resume.section("Technical Skills")
    resume.skills(spec["skills"])
    resume.section("Experience")
    for index, entry in enumerate(spec["experience"]):
        resume.role(entry, add_top_gap=index > 0)
    resume.section("Projects")
    for index, entry in enumerate(spec["projects"]):
        resume.role(entry, add_top_gap=index > 0)

    education = spec["education"]
    resume.section("Education")
    education_line = f"{education['school']} | {education['degree']}"
    if education.get("gpa"):
        education_line += f" | GPA: {education['gpa']}"
    resume.marked_line(LEFT, resume.y, education_line, 7.8)
    resume.right(resume.y, education.get("date", ""), BODY_FONT, 7.8)
    resume.move(9.1)
    if education.get("coursework"):
        resume.marked_line(LEFT, resume.y, f"Relevant Foundation: {education['coursework']}", 7.45)
        resume.move(9.8)

    if spec.get("certifications"):
        resume.section("Certifications", compact=True)
        resume.paragraph(" | ".join(spec["certifications"]), size=7.45, leading=8.2)
    if spec.get("publication"):
        resume.section("Publication", compact=True)
        resume.paragraph(spec["publication"], size=7.35, leading=8.1)
    resume.section("Links", compact=True)
    resume.paragraph(" | ".join(spec["links"]), size=7.35, leading=8.1)
    final_y = resume.y
    resume.finish()
    return final_y


def plain_marked_text(value):
    """Return applicant-facing text without internal ``**`` emphasis markers."""
    return "".join(text for text, _ in split_marked(value))


def rendered_body_bullets(spec):
    """Return source bullets in the same order used by the LaTeX renderer."""
    return [
        plain_marked_text(bullet)
        for section in ("experience", "projects")
        for entry in sorted(spec[section], key=lambda item: item.get("entry_priority", 999))
        for bullet in entry["bullets"]
    ]


def _non_whitespace_signature_with_positions(value):
    signature = []
    positions = []
    for index, character in enumerate(str(value)):
        if not character.isspace():
            signature.append(character)
            positions.append(index)
    return "".join(signature), positions


def repair_and_validate_ats_bullets(spec, extracted):
    """Correct extractor-only spacing while proving every source bullet survived.

    XeTeX's embedded Times New Roman can lead text extractors to insert or omit
    whitespace around kerning and font boundaries. Those changes are safe to
    repair only when the complete non-whitespace character sequence still
    matches the corresponding source bullet. A missing, reordered, duplicated,
    or otherwise changed bullet fails closed instead of being reconstructed
    from the specification without proof from the PDF.
    """
    extracted = unicodedata.normalize("NFKC", str(extracted))
    for malformed, clean in {
        "UA T": "UAT",
        "V alidated": "Validated",
        "V erified": "Verified",
        "MCP ,": "MCP,",
    }.items():
        extracted = extracted.replace(malformed, clean)

    expected_bullets = rendered_body_bullets(spec)
    segments = extracted.split("•")
    actual_count = len(segments) - 1
    require(
        actual_count == len(expected_bullets),
        f"ATS extraction contains {actual_count} bullet markers; expected {len(expected_bullets)} source bullets",
    )

    repaired = [segments[0]]
    for index, (segment, expected) in enumerate(zip(segments[1:], expected_bullets), start=1):
        actual_signature, positions = _non_whitespace_signature_with_positions(segment)
        expected_signature, _ = _non_whitespace_signature_with_positions(expected)
        require(expected_signature, f"Source bullet {index} is empty after removing emphasis markers")
        require(
            actual_signature.startswith(expected_signature),
            f"ATS extraction failed exact source-bullet round-trip at bullet {index}: {expected}",
        )
        start = positions[0]
        end = positions[len(expected_signature) - 1] + 1
        trailing = segment[end:]
        require(
            not trailing or re.match(r"[^\S\r\n]*(?:\r?\n|$)", trailing),
            f"ATS extraction contains extra content in source bullet {index}: {expected}",
        )
        repaired.append("•" + segment[:start] + expected + segment[end:])

    repaired_text = "".join(repaired)
    repaired_segments = repaired_text.split("•")[1:]
    for index, (segment, expected) in enumerate(zip(repaired_segments, expected_bullets), start=1):
        expected_normalized = re.sub(r"\s+", " ", expected).strip()
        require(
            re.sub(r"\s+", " ", segment).lstrip().startswith(expected_normalized),
            f"ATS repair did not preserve exact source content for bullet {index}: {expected}",
        )
    return repaired_text


def verify_pdf(spec, output):
    reader = PdfReader(str(output))
    require(len(reader.pages) == 1, "Dynamic resume must be exactly one page")
    extracted = "\n".join(
        page.extract_text(space_width=ATS_EXTRACTION_SPACE_WIDTH) or ""
        for page in reader.pages
    )
    extracted = repair_and_validate_ats_bullets(spec, extracted)
    for required in (
        spec["contact"]["name"],
        "EXPERIENCE",
        "PROJECTS",
        "EDUCATION",
        required_website(spec),
    ):
        require(required.lower() in extracted.lower(), f"ATS extraction is missing required text: {required}")
    matched = [keyword for keyword in spec["metadata"]["matched_keywords"] if keyword.lower() in extracted.lower()]
    require(len(matched) >= 3, "Fewer than three mapped job keywords appear in ATS-extracted text")
    for pattern in INTERNAL_PROVENANCE_PATTERNS:
        require(
            not pattern.search(extracted),
            "ATS extraction contains an internal provenance label; do not deliver or upload this PDF.",
        )
    reject_applicant_narration(extracted, "ATS extraction")
    return extracted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", required=True, type=Path, help="Job-specific resume JSON specification")
    parser.add_argument("--output", type=Path, help="Output PDF path; defaults beside the spec")
    parser.add_argument("--facts", type=Path, default=Path(__file__).with_name("CANDIDATE_MASTER_FACT_SHEET.md"))
    parser.add_argument("--standard", type=Path, default=Path(__file__).with_name("RESUME_TAILORING_STANDARD.md"))
    args = parser.parse_args()

    require(args.facts.is_file(), f"Missing master fact sheet: {args.facts}")
    require(args.standard.is_file(), f"Missing tailoring standard: {args.standard}")
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    validate_spec(spec, require_current_version=True)
    require(
        spec["metadata"]["fact_sheet_sha256"] == sha256_file(args.facts),
        "Fact sheet changed since this resume spec was reviewed. Reread it, update the selection rationale, and refresh metadata.fact_sheet_sha256 before rebuilding.",
    )
    require(
        spec["metadata"]["tailoring_standard_sha256"] == sha256_file(args.standard),
        "Tailoring standard changed since this resume spec was reviewed. Reread it and refresh metadata.tailoring_standard_sha256 before rebuilding.",
    )
    validate_cross_job_tailoring(spec, args.spec)
    output = args.output or args.spec.with_suffix(".pdf")
    render_latex(spec, output)
    extracted = verify_pdf(spec, output)
    extraction_path = output.with_suffix(".ats.txt")
    extraction_path.write_text(extracted, encoding="utf-8")
    print(json.dumps({
        "pdf": str(output),
        "ats_text": str(extraction_path),
        "company": spec["metadata"]["company"],
        "role": spec["metadata"]["role"],
        "matched_keywords": spec["metadata"]["matched_keywords"],
        "facts": str(args.facts),
        "standard": str(args.standard),
    }, indent=2))


if __name__ == "__main__":
    main()
