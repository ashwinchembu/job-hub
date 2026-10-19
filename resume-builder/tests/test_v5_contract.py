import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


BUILDER_PATH = Path(__file__).resolve().parents[1] / "build_dynamic_resume.py"
MODULE_SPEC = importlib.util.spec_from_file_location("portable_resume_builder", BUILDER_PATH)
builder = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(builder)


def anonymous_v5_spec():
    """Return a candidate-neutral fixture that exercises the complete v5 schema."""
    experience_bullets = [
        f"Built Python API workflow {index} to process {100 + index} verified records with deterministic validation and a documented recovery check."
        for index in range(1, 13)
    ]
    project_bullets = [
        f"Implemented TypeScript API module {index} across {200 + index} verified events with automated tests and an observable failure path."
        for index in range(1, 10)
    ]
    body_bullets = experience_bullets + project_bullets
    entries = {
        "experience": [
            {
                "title": "Platform Engineer | Example One",
                "strength": "strong",
                "target_matches": ["API delivery", "workflow reliability"],
                "selection_reason": "Strongest verified backend delivery evidence.",
                "entry_priority": 1,
                "date": "Remote | 2024-2026",
                "summary": "Backend workflow delivery",
                "tech": "Python | APIs | SQL",
                "bullets": experience_bullets[0:5],
            },
            {
                "title": "Software Engineer | Example Two",
                "strength": "moderate",
                "target_matches": ["data processing", "automated testing"],
                "selection_reason": "Adds distinct data and test evidence.",
                "entry_priority": 2,
                "date": "Remote | 2023-2024",
                "summary": "Data service implementation",
                "tech": "Python | APIs | Testing",
                "bullets": experience_bullets[5:9],
            },
            {
                "title": "Engineering Intern | Example Three",
                "strength": "supporting",
                "target_matches": ["service integration", "quality controls"],
                "selection_reason": "Supplies a separate integration context.",
                "entry_priority": 3,
                "date": "Remote | 2022-2023",
                "summary": "Service integration",
                "tech": "Python | APIs",
                "bullets": experience_bullets[9:12],
            },
        ],
        "projects": [
            {
                "title": "Event Workflow",
                "strength": "strong",
                "target_matches": ["TypeScript", "event processing"],
                "selection_reason": "Strongest verified event-system evidence.",
                "entry_priority": 1,
                "date": "2026",
                "summary": "Typed event processing",
                "tech": "TypeScript | APIs | Tests",
                "bullets": project_bullets[0:3],
            },
            {
                "title": "Integration Monitor",
                "strength": "moderate",
                "target_matches": ["observability", "failure handling"],
                "selection_reason": "Adds a distinct operational mechanism.",
                "entry_priority": 2,
                "date": "2025",
                "summary": "Integration observability",
                "tech": "TypeScript | APIs",
                "bullets": project_bullets[3:6],
            },
            {
                "title": "Validation Toolkit",
                "strength": "supporting",
                "target_matches": ["validation", "developer tooling"],
                "selection_reason": "Adds separate validation and tooling evidence.",
                "entry_priority": 3,
                "date": "2024",
                "summary": "Developer validation tools",
                "tech": "TypeScript | Tests",
                "bullets": project_bullets[6:9],
            },
        ],
    }
    audits = []
    for bullet in body_bullets:
        quantity = next(token for token in bullet.split() if token.isdigit())
        audits.append({
            "bullet": bullet,
            "target_responsibility": "Build reliable API workflows",
            "selected_fact_sheet_evidence": "Anonymous verified evidence record",
            "selection_reason": "Directly matches implementation and reliability work",
            "problem": "A workflow needed deterministic processing",
            "mechanism": "A typed API and validation layer",
            "implementation": "Implemented processing, tests, and recovery handling",
            "outcome": "Produced a verified workflow artifact",
            "quantity": quantity,
            "quantity_source": "Anonymous fixture evidence",
            "quantity_category": "records",
        })
    return {
        "metadata": {
            "company": "Example Company",
            "role": "Software Engineer",
            "slug": "example_company_software_engineer",
            "job_description_source": "https://jobs.example.test/software-engineer",
            "selection_rationale": "Selected distinct API, workflow, testing, and observability evidence for the role.",
            "matched_keywords": ["Python", "TypeScript", "API"],
            "emphasis_terms": ["Python", "TypeScript", "verified records"],
            "facts_reviewed_at": "2026-01-01T00:00:00Z",
            "fact_sheet_sha256": "fixture-fact-hash",
            "tailoring_standard_sha256": "fixture-standard-hash",
            "required_website": "https://portfolio.example.test",
            "tailoring_version": 5,
            "uniform_bullet_font_size": 9.1,
            "body_tailoring_summary": "Selected complementary API, event, testing, and recovery mechanisms for this role.",
            "omitted_requirements": ["No unsupported requirements were identified in the reviewed fixture."],
            "job_analysis": {
                "responsibilities": ["Build reliable API workflows"],
                "repeated_keywords": ["Python", "TypeScript", "API"],
                "hard_requirements": ["Software implementation"],
                "preferred_requirements": ["Operational reliability"],
                "domain": "developer tooling",
                "seniority": "early career",
            },
            "evidence_ranking": [
                {"entry": entry["title"], "type": kind, "rank": rank, "role_work_match": entry["selection_reason"], "selected": True}
                for rank, (kind, entry) in enumerate(
                    [("experience", item) for item in entries["experience"]]
                    + [("project", item) for item in entries["projects"]],
                    start=1,
                )
            ],
            "role_specific_bullets": body_bullets[:7],
            "bullet_evidence_audit": audits,
            "reuse_justifications": [],
        },
        "contact": {
            "name": "Candidate Name",
            "phone": "000-000-0000",
            "email": "candidate@example.com",
            "location": "Remote | https://portfolio.example.test",
        },
        "profile": "Software engineer building reliable Python and TypeScript API workflows.",
        "skills": [
            {"label": "Languages", "items": "Python, TypeScript"},
            {"label": "Backend", "items": "APIs, SQL"},
            {"label": "Testing", "items": "Automated validation"},
        ],
        **entries,
        "education": {"school": "Example University", "degree": "B.S. Computer Science", "date": "2024"},
        "certifications": [],
        "publication": "",
        "links": ["Portfolio: https://portfolio.example.test"],
    }


def ats_round_trip_fixture():
    """Exercise known extractor spacing failures in actual render order."""
    return {
        "experience": [
            {
                "entry_priority": 2,
                "bullets": [
                    "Used Salesforce/**Veeva** across 1 workflow.",
                    "Connected **Python NLP**, across 2 services.",
                ],
            },
            {
                "entry_priority": 1,
                "bullets": [
                    "Processed **master-data** across 3 pipelines.",
                    "Implemented React/**JavaScript** across 4 modules.",
                ],
            },
        ],
        "projects": [
            {
                "entry_priority": 2,
                "bullets": [
                    "Built **React 19**/**TypeScript** across 5 workspaces.",
                    "Stored files in **AWS** S3 across 6 buckets.",
                ],
            },
            {
                "entry_priority": 1,
                "bullets": [
                    "Ran **AWS** Nova; traced 7 sessions.",
                    "Connected **AWS** streaming across 8 clients.",
                ],
            },
        ],
    }


class VersionFiveContractTests(unittest.TestCase):
    def test_anonymous_v5_fixture_passes_current_contract(self):
        spec = anonymous_v5_spec()
        builder.validate_spec(spec, require_current_version=True)
        self.assertEqual(builder.configured_bullet_font_size(spec), 9.1)
        self.assertEqual(builder.EMPHASIS_SIZE_DELTA, 0.0)

    def test_v3_remains_audit_compatible_but_not_buildable(self):
        spec = anonymous_v5_spec()
        spec["metadata"]["tailoring_version"] = 3
        del spec["metadata"]["uniform_bullet_font_size"]
        builder.validate_spec(spec)
        with self.assertRaisesRegex(ValueError, "remains audit-only"):
            builder.validate_spec(spec, require_current_version=True)

        future = anonymous_v5_spec()
        future["metadata"]["tailoring_version"] = 6
        with self.assertRaisesRegex(ValueError, "remains audit-only"):
            builder.validate_spec(future, require_current_version=True)

    def test_v5_requires_explicit_uniform_size_and_complete_audits(self):
        missing_size = anonymous_v5_spec()
        del missing_size["metadata"]["uniform_bullet_font_size"]
        with self.assertRaisesRegex(ValueError, "explicit metadata.uniform_bullet_font_size"):
            builder.validate_spec(missing_size)

        incomplete_audit = anonymous_v5_spec()
        incomplete_audit["metadata"]["bullet_evidence_audit"].pop()
        with self.assertRaisesRegex(ValueError, "one bullet_evidence_audit record for every rendered bullet"):
            builder.validate_spec(incomplete_audit)

    def test_selected_evidence_ranking_entries_match_the_retained_body(self):
        mismatched = anonymous_v5_spec()
        mismatched["metadata"]["evidence_ranking"][3]["entry"] = "Omitted Project"
        with self.assertRaisesRegex(
            ValueError,
            "selected entries must exactly match the retained experiences and projects",
        ):
            builder.validate_spec(mismatched)

    def test_applicant_narration_and_provenance_labels_fail(self):
        narrated = anonymous_v5_spec()
        narrated["experience"][0]["bullets"][0] += " This supports the target role."
        with self.assertRaisesRegex(ValueError, "audit-style narration"):
            builder.validate_spec(narrated)

        provenance = anonymous_v5_spec()
        provenance["profile"] = "Evidence: private audit record."
        with self.assertRaisesRegex(ValueError, "internal provenance label"):
            builder.validate_spec(provenance)

    def test_extended_applicant_narration_patterns_fail(self):
        phrases = (
            "Supports reliable internal tooling.",
            "The release evidence remained reproducible.",
            "The review evidence remained traceable.",
            "The workflow evidence remained auditable.",
            "The chronology remains tied to verified dates.",
            "The funding claim remains limited to verified evidence.",
            "The deployment boundary remained explicit.",
            "Scoped ownership remained attributable.",
            "The usage remains attributed to the team library.",
            "The inspected artifact remains the release evidence.",
            "The implementation connects APIs to product data.",
        )
        for phrase in phrases:
            with self.subTest(phrase=phrase):
                with self.assertRaisesRegex(ValueError, "audit-style narration"):
                    builder.reject_applicant_narration(phrase, "test")

    def test_cross_job_identical_body_fails_and_justified_reuse_passes(self):
        prior = anonymous_v5_spec()
        current = copy.deepcopy(prior)
        current["metadata"].update({
            "company": "Second Company",
            "role": "Platform Engineer",
            "slug": "second_company_platform_engineer",
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            specs_root = Path(temp_dir) / "specs"
            prior_path = specs_root / "prior" / "resume_spec.json"
            prior_path.parent.mkdir(parents=True)
            prior_path.write_text(json.dumps(prior), encoding="utf-8")
            current_path = specs_root / "current" / "resume_spec.json"
            with self.assertRaisesRegex(ValueError, "Resume body is identical"):
                builder.validate_cross_job_tailoring(current, current_path)

            current["projects"][2]["bullets"][-1] = (
                "Implemented TypeScript API module 10 across 310 verified events with automated tests and an observable failure path."
            )
            with self.assertRaisesRegex(ValueError, "Resume reuses 95%"):
                builder.validate_cross_job_tailoring(current, current_path)
            current["metadata"]["reuse_justifications"] = [{
                "comparison_slug": prior["metadata"]["slug"],
                "materially_identical_requirements": True,
                "reason": "Both fixture roles use the same explicitly reviewed API and reliability requirements.",
            }]
            builder.validate_cross_job_tailoring(current, current_path)

    def test_inline_emphasis_never_splits_a_whitespace_delimited_token(self):
        words = builder.token_words(
            "Salesforce/**Veeva** React/**JavaScript** **React 19**/**TypeScript** **AWS** S3"
        )
        self.assertTrue(all(len(word) == 1 for word in words))
        self.assertEqual(words[0], [("Salesforce/Veeva", True)])
        self.assertEqual(words[1], [("React/JavaScript", True)])
        self.assertEqual(words[3], [("19/TypeScript", True)])

    def test_ats_repair_round_trips_known_spacing_artifacts_in_render_order(self):
        spec = ats_round_trip_fixture()
        expected = builder.rendered_body_bullets(spec)
        extracted = "\n".join([
            "EXPERIENCE",
            "• Processed master- data across 3 pipelines.",
            "• Implemented React/ JavaScript across 4 modules.",
            "• Used Salesforce/V eeva across 1 workflow.",
            "• Connected Python NLP , across 2 services.",
            "PROJECTS",
            "• Ran A WSNova; traced 7 sessions.",
            "• Connected A WSstreaming across 8 clients.",
            "• Built React 19/ TypeScript across 5 workspaces.",
            "• Stored files in A WSS3 across 6 buckets.",
        ])

        repaired = builder.repair_and_validate_ats_bullets(spec, extracted)
        actual = [segment.strip().splitlines()[0] for segment in repaired.split("•")[1:]]
        self.assertEqual(actual, expected)
        for artifact in (
            "Salesforce/V eeva",
            "Python NLP ,",
            "master- data",
            "React/ JavaScript",
            "React 19/ TypeScript",
            "A WSS3",
            "A WSNova",
            "A WSstreaming",
        ):
            self.assertNotIn(artifact, repaired)

    def test_ats_round_trip_rejects_changed_reordered_or_extra_bullets(self):
        spec = ats_round_trip_fixture()
        expected = builder.rendered_body_bullets(spec)

        changed = "\n".join(f"• {bullet}" for bullet in expected).replace("3 pipelines", "9 pipelines", 1)
        with self.assertRaisesRegex(ValueError, "exact source-bullet round-trip"):
            builder.repair_and_validate_ats_bullets(spec, changed)

        reordered = "\n".join(f"• {bullet}" for bullet in [expected[1], expected[0], *expected[2:]])
        with self.assertRaisesRegex(ValueError, "exact source-bullet round-trip"):
            builder.repair_and_validate_ats_bullets(spec, reordered)

        extra_content = "\n".join(f"• {bullet}" for bullet in expected).replace(
            expected[0], expected[0] + " Unsupported addition.", 1
        )
        with self.assertRaisesRegex(ValueError, "extra content"):
            builder.repair_and_validate_ats_bullets(spec, extra_content)

        extra_bullet = "\n".join([*(f"• {bullet}" for bullet in expected), "• Extra bullet."])
        with self.assertRaisesRegex(ValueError, "bullet markers"):
            builder.repair_and_validate_ats_bullets(spec, extra_bullet)


if __name__ == "__main__":
    unittest.main()
