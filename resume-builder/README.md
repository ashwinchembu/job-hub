# Dynamic LaTeX Resume Builder

This package builds dense, one-page, ATS-readable LaTeX resumes from a job-specific JSON specification.

## What the v3 gate enforces

- three to four experience entries and three to four project entries;
- three to five bullets per entry, including at least one five-bullet and one four-bullet entry;
- exactly two information-dense lines per bullet with at least 90% line fill;
- a verified quantity in every bullet;
- body-level job keywords, role-specific bullets, evidence audits, explicit omissions, selection reasons, and priorities;
- phrase-level black bold emphasis that preserves readable ATS extraction;
- one-page Letter output, portfolio inclusion, and PDF text verification.

The private candidate evidence file is intentionally excluded. Supply your own evidence source and update each specification's review hashes before building.

## Build

Requirements:

- Python with `pypdf` and `reportlab`;
- Tectonic 0.17 or another compatible `tectonic` executable;
- Times New Roman installed, or edit the LaTeX font setting.

```bash
python build_dynamic_resume.py \
  --spec tests/onecrew/resume_spec.json \
  --facts /path/to/your/fact-sheet.md \
  --standard RESUME_TAILORING_STANDARD.md \
  --output output/Chembu_Ashwin.pdf
```

The three included samples independently scored at least 95/100 against the documented standard:

- OneCrew: 96/100
- Lightfield: 95/100
- Cadence: 96/100

The sample specifications contain public resume evidence only. They do not include private employer datasets, application records, credentials, or the private candidate master fact sheet.
