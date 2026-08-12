# Dynamic Resume Specifications

Each job gets its own JSON specification and generated artifacts.

Recommended layout:

```text
resume_specs/
  company_role/
    job_description.txt
    resume_spec.json
    selection_notes.md
    Candidate_Name_Company_Role.pdf
    Candidate_Name_Company_Role.ats.txt
    render/page-1.png
```

Workflow:

1. Save the complete job description.
2. Read `../CANDIDATE_MASTER_FACT_SHEET.md` and `../RESUME_TAILORING_STANDARD.md`.
3. Read the full current fact sheet and tailoring standard, then create `resume_spec.json` using `resume_spec.template.json`. Record the review timestamp plus the SHA-256 of both source files in metadata; the builder refuses to render a spec whose fingerprints no longer match the current sources. Set `metadata.required_website` to the candidate's portfolio and include it in ATS-readable contact or Links text.
4. Record why each experience/project was selected in `selection_notes.md`.
5. Run `python ../build_dynamic_resume.py --spec <spec> --output <pdf>` using the bundled Python runtime.
6. Classify every retained experience and project by relevance and assign three to five bullets flexibly. The complete resume must contain at least one five-bullet entry and one four-bullet entry; distributions such as 5/5/3 or 5/5/4 are valid. Every bullet must include an explicit verified quantity; if the fact sheet has no defensible number, select different evidence or ask Ashwin rather than inventing one.
7. Add `metadata.emphasis_terms` with complete, high-value phrases and selected meaningful metrics. Do not include low-value numbers or fragments of multi-word terms. Inspect the generated ATS text and render the PDF to PNG; emphasis preserves identical plain text for extraction. Every bullet must form exactly two balanced lines, with each line filling at least 90% of the usable row.
8. Revise until the PDF is one page, visually clean, and specific to the job.

The renderer enforces required fields, the configured candidate website, flexible three-to-five bullet counts with at least one five and one four, per-bullet impact quantification, two-line 90%-minimum row fill, one-page output, and basic ATS extraction checks.
