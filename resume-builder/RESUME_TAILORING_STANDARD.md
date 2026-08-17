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

## Accuracy and attribution

- Never invent technologies, ownership, production scale, deployment status, customer identity, domain experience, metrics, or outcomes.
- Attribute team, employer, client, forked, and collaborator work accurately.
- Preserve exact chronology from the private fact sheet.
- Use only the portfolio, LinkedIn, GitHub, phone, email, education, certification, and publication values supplied in the private specification.

## Rendering and ATS

- Default to one readable page unless the candidate explicitly requests otherwise.
- Use ATS-readable body text and standard section headings.
- Render the PDF and visually inspect every page.
- Extract ATS text and verify all required contact evidence, dates, skills, and sections.
- Reject clipped text, overlapping elements, unreadably small text, empty pages, and unsupported claims.

## Private artifacts

- Save generated PDFs, rendered page images, ATS extracts, application answers, and complete job descriptions only under an ignored private directory.
- For a submitted application, retain the exact immutable PDF and its SHA-256 beside the specification, selection notes, job description, answers, and confirmation evidence.
- Never commit candidate facts, submitted resumes, application history, recruiter communications, mailbox data, access tokens, or production database exports.
