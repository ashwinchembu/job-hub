# Candidate-Neutral Resume Builder

The builder consumes a private, job-specific JSON specification and produces an ATS-oriented PDF. No real candidate data or submitted resume is included in this repository.

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
