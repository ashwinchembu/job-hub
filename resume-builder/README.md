# Candidate-Neutral Resume Builder

The builder consumes a private, job-specific JSON specification and produces an ATS-oriented PDF. No real candidate data or submitted resume is included in this repository. The current command-line path accepts exactly tailoring version 5: it inherits the v3 body-selection and v4 evidence-audit gates, uses one configured point size for every Experience and Projects bullet, applies bold as weight only, allows natural one- or two-line wrapping, and rejects applicant-facing audit narration or provenance labels. Historical v3/v4 specifications remain validation-compatible for audit but cannot be rebuilt by the CLI.

## Setup

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install reportlab pypdf
```

Copy `resume_spec.template.json` into an ignored directory and replace every placeholder with verified candidate evidence:

```bash
mkdir -p private-data/resume-specs/example_role
cp resume-builder/resume_spec.template.json private-data/resume-specs/example_role/resume_spec.json
python3 resume-builder/build_dynamic_resume.py \
  --spec private-data/resume-specs/example_role/resume_spec.json \
  --output private-data/resume-specs/example_role/resume.pdf
```

Read `RESUME_TAILORING_STANDARD.md` and `SPECIFICATION_GUIDE.md` before generating a resume. Keep all populated specifications, PDFs, ATS extracts, page images, job descriptions, and application evidence under `private-data/`; that directory is ignored by Git.
