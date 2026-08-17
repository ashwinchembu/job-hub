#!/usr/bin/env python3
"""Render a job-specific, one-page resume from a structured JSON specification."""

import argparse
import hashlib
import json
import re
import subprocess
import shutil
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
MIN_BULLET_LINE_FILL = 0.90
EMPHASIS_SIZE_DELTA = 0.55
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
    """Return whitespace-delimited words while preserving inline style boundaries.

    A word can contain several styled fragments, such as ``("Node.js", bold)``
    followed immediately by ``("/Express", regular)``. Keeping those fragments
    in one word prevents the renderer from inventing spaces around punctuation
    when bold markup starts or ends.
    """
    words = []
    current = []
    for part, bold in split_marked(marked):
        for token in re.split(r"(\s+)", part):
            if not token:
                continue
            if token.isspace():
                if current:
                    words.append(current)
                    current = []
            elif current and current[-1][1] == bold:
                current[-1] = (current[-1][0] + token, bold)
            else:
                current.append((token, bold))
    if current:
        words.append(current)
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


def balanced_two_lines(marked, max_w, size):
    """Split a bullet into two maximally full lines without stretching spaces."""
    words = token_words(marked)
    candidates = []
    for split_at in range(1, len(words)):
        first = []
        second = []
        for target, groups in ((first, words[:split_at]), (second, words[split_at:])):
            for index, group in enumerate(groups):
                if index:
                    target.append((" ", False))
                target.extend(group)
        first = coalesce_fragments(first)
        second = coalesce_fragments(second)
        ratios = (line_width(first, size) / max_w, line_width(second, size) / max_w)
        if max(ratios) <= 1.0:
            candidates.append((min(ratios), -abs(ratios[0] - ratios[1]), first, second, ratios))
    require(candidates, f"Bullet cannot be split into two lines at the configured width: {marked}")
    _, _, first, second, ratios = max(candidates, key=lambda candidate: (candidate[0], candidate[1]))
    return [first, second], ratios


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


def line_width(line, size):
    return sum(
        width(text, EMPHASIS_FONT if bold else BODY_FONT, size + EMPHASIS_SIZE_DELTA if bold else size)
        for text, bold in line
    )


def line_word_count(line):
    return len(token_words("".join(f"**{text}**" if bold else text for text, bold in line)))


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


def latex_bullet(marked, emphasis_terms):
    emphasized = emphasize_keywords(marked, emphasis_terms)
    selected = None
    for size in (8.35, 8.5, 8.65, 8.8, 8.95, 9.1, 9.25, 9.4, 9.55, 9.7):
        try:
            lines, ratios = balanced_two_lines(emphasized, RIGHT - LEFT - 10, size)
        except ValueError:
            continue
        if all(ratio >= MIN_BULLET_LINE_FILL for ratio in ratios):
            selected = (size, lines, ratios)
            break
    require(selected is not None, f"Bullet cannot meet the two-line fill gate at readable sizes: {marked}")
    size, lines, ratios = selected
    require(
        all(ratio >= MIN_BULLET_LINE_FILL for ratio in ratios),
        f"Both bullet lines must fill at least {MIN_BULLET_LINE_FILL:.0%} of the row; "
        f"got {ratios[0]:.0%}/{ratios[1]:.0%}: {marked}",
    )
    return (
        r"\noindent\fontsize{" + f"{size:.2f}" + r"}{9.05}\selectfont\hangindent=1.1em\hangafter=1\textbullet\hspace{0.45em}"
        + fragments_to_tex(lines[0])
        + r"\\*" + "\n"
        + r"\hspace*{1.1em}" + fragments_to_tex(lines[1]) + r"\par" + "\n"
    )


def render_latex(spec, output):
    require(TECTONIC.is_file(), f"Missing LaTeX engine: {TECTONIC}")
    output.parent.mkdir(parents=True, exist_ok=True)
    emphasis_terms = spec["metadata"]["emphasis_terms"]
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
                body.append(latex_bullet(bullet, emphasis_terms))

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


def validate_spec(spec):
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
    def __init__(self, output, keywords, emphasis_terms, fill_scale=1.0):
        output.parent.mkdir(parents=True, exist_ok=True)
        self.output = output
        self.c = canvas.Canvas(str(output), pagesize=letter)
        self.y = TOP
        self.fill_scale = fill_scale
        self.keywords = keywords
        self.emphasis_terms = emphasis_terms

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

    def bullet(self, marked, size=8.75, leading=9.75):
        indent = 10
        max_w = RIGHT - LEFT - indent
        emphasized = emphasize_keywords(marked, self.emphasis_terms)
        lines, line_ratios = balanced_two_lines(emphasized, max_w, size)
        require(
            all(ratio >= MIN_BULLET_LINE_FILL for ratio in line_ratios),
            f"Both bullet lines must fill at least {MIN_BULLET_LINE_FILL:.0%} of the row; "
            f"got {line_ratios[0]:.0%}/{line_ratios[1]:.0%}. Add verified problem, mechanism, implementation, or impact evidence: {marked}",
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


def verify_pdf(spec, output):
    reader = PdfReader(str(output))
    require(len(reader.pages) == 1, "Dynamic resume must be exactly one page")
    extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
    # XeTeX can expose harmless spacing around a few inline bold boundaries.
    # Normalize only exact, visually identical ATS tokens after extraction.
    for malformed, clean in {
        "UA T": "UAT",
        "V alidated": "Validated",
        "V erified": "Verified",
        "MCP ,": "MCP,",
    }.items():
        extracted = extracted.replace(malformed, clean)
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
    validate_spec(spec)
    require(
        spec["metadata"]["fact_sheet_sha256"] == sha256_file(args.facts),
        "Fact sheet changed since this resume spec was reviewed. Reread it, update the selection rationale, and refresh metadata.fact_sheet_sha256 before rebuilding.",
    )
    require(
        spec["metadata"]["tailoring_standard_sha256"] == sha256_file(args.standard),
        "Tailoring standard changed since this resume spec was reviewed. Reread it and refresh metadata.tailoring_standard_sha256 before rebuilding.",
    )
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
