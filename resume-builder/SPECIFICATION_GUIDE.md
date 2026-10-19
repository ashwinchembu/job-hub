# Job-Specific Resume Specification Guide

Create one specification for one company and one role. Start from `resume_spec.template.json`, then populate it exclusively from the complete job description and a private verified candidate fact sheet.

1. Store private specifications under `private-data/resume-specs/<company>_<role>/resume_spec.json`.
2. Set `metadata.tailoring_version` to `5`; record the official job URL, job ID, target track, requirements, repeated keywords, and important unsupported requirements.
3. Populate `metadata.job_analysis` and rank at least six evidence candidates by the work the role actually performs.
4. Use exactly three experience entries and three project entries by default.
5. Use three to five substantive bullets per entry, with at least one five-bullet entry and one four-bullet entry across the resume.
6. Require one meaningful verified quantity in every bullet; select different evidence instead of inventing or padding a number.
7. Add exactly one complete `bullet_evidence_audit` record for every rendered bullet, including its target responsibility, private evidence reference, selection reason, mechanism, implementation, outcome, exact quantity, source, and supported quantity category.
8. Set one `metadata.uniform_bullet_font_size` for all Experience and Projects bullets. Bold may change weight but never point size. Let bullets wrap naturally to one or two lines and rewrite anything longer rather than resizing one bullet.
9. Write each bullet as one direct, cohesive accomplishment. Keep `This supports...`, claim disclaimers, provenance defenses, internal labels, and other audit narration in private notes rather than applicant-facing text.
10. Compare sibling specifications. An identical body fails; reuse greater than 80% requires a written justification establishing materially identical requirements.
11. Build, extract ATS text, render, and visually inspect the result before use. The CLI accepts exactly version 5; version 3 and 4 inputs are audit-only.

The template contains placeholders only. Do not commit the populated specification, generated resume, rendered pages, or candidate fact sheet.
