# Resume Tailoring Standard

This public standard is candidate-neutral. Keep the real candidate fact sheet, contact information, employment history, application packages, and generated resumes outside Git in `private-data/` or another ignored directory.

## Source of truth

1. Read the complete job description.
2. Read the candidate's private fact sheet in full.
3. Treat verified facts as the only permissible source for claims, metrics, dates, technologies, ownership, outcomes, work authorization, and contact information.
4. Record unsupported requirements explicitly. Never imply that the candidate satisfies them.

## Job-specific selection

- Extract responsibilities, repeated keywords, hard requirements, preferred requirements, domain, and seniority.
- Rank evidence by the role's actual work rather than keyword count alone.
- Use exactly three relevant experience entries and three relevant project entries by default.
- Keep three to five substantive bullets per retained entry, with at least one five-bullet entry and one four-bullet entry across the resume. The remaining distribution is flexible.
- Give every bullet a meaningful, verified quantity. Prefer records, users, commits, routes, tests, artifacts, time, funding, or measured outcomes. Never manufacture low-value counts to satisfy the rule.
- Record why every retained entry and bullet was selected.
- Tailor the profile, skills, entry ordering, project ordering, and body evidence. Reordering an identical complete bullet set is not sufficient tailoring.

## Versioned validation

- Version 3 introduced body-level tailoring: material body changes, role-specific rendered bullets, unsupported-requirement disclosure, target matches, selection reasons, and section-local priorities.
- Version 4 added complete job analysis, ranked evidence, exactly one structured evidence audit per rendered bullet, meaningful quantity categories, duplicate-sentence rejection, and cross-job body comparison. An identical body fails, and reuse greater than 80% requires a written materially-identical-requirements justification.
- Version 5 inherits every v3 and v4 gate and requires an explicit shared bullet point size from 9.00 through 10.00 plus direct applicant prose. The current command-line build path accepts exactly version 5; historical v3/v4 specifications remain readable for audit only.

## Accuracy and attribution

- Never invent technologies, ownership, production scale, deployment status, customer identity, domain experience, metrics, or outcomes.
- Attribute team, employer, client, forked, and collaborator work accurately.
- Preserve exact chronology from the private fact sheet.
- Use only the portfolio, LinkedIn, GitHub, phone, email, education, certification, and publication values supplied in the private specification.

## Rendering and ATS

- Default to one readable page unless the candidate explicitly requests otherwise.
- Use ATS-readable body text and standard section headings.
- Use one configured point size for every Experience and Projects bullet. Bold changes weight only, never size, and no individual bullet may be shrunk or enlarged to fit.
- Let bullets wrap naturally to one or two lines. If a bullet exceeds two lines, shorten the accomplishment instead of reducing its font size or adding forced line-fill language.
- Write every bullet as a direct, cohesive achievement. Keep provenance and claim boundaries in private notes; never append audit narration such as `This supports...`, `This demonstrates...`, `without claiming...`, or ownership-boundary language, and never expose internal labels such as `source:`, `evidence:`, or `quantity_source:`.
- Render the PDF and visually inspect every page.
- Extract ATS text and verify all required contact evidence, dates, skills, and sections.
- Reject clipped text, overlapping elements, unreadably small text, empty pages, and unsupported claims.

## Private artifacts

- Save generated PDFs, rendered page images, ATS extracts, application answers, and complete job descriptions only under an ignored private directory.
- For a submitted application, retain the exact immutable PDF and its SHA-256 beside the specification, selection notes, job description, answers, and confirmation evidence.
- Never commit candidate facts, submitted resumes, application history, recruiter communications, mailbox data, access tokens, or production database exports.
