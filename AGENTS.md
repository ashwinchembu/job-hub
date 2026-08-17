# Agent Instructions

This repository is a candidate-neutral Job Application Hub. It intentionally contains no real candidate profile, resume, application history, recruiter communication, credentials, or deployment identity.

Before changing or operating the backend, read `docs/AGENT_INTEGRATION.md` in full.

## Privacy boundary

- Never commit real names, personal email addresses, phone numbers, home locations, portfolio/social URLs, employer feedback, resumes, job descriptions tied to a private application, application answers, recruiter messages, mailbox data, database exports, authentication tokens, or absolute user-home paths.
- Keep private inputs under `private-data/` or another ignored directory.
- Pass `JOB_HUB_BASE_URL`, `JOB_HUB_SIWC_BYPASS_TOKEN`, `JOB_HUB_PRIVATE_ROOT`, and `OPENAI_API_KEY` through the runtime environment. Never print, persist, or commit secret values; keep the private root in an ignored directory.
- The repository does not grant authority to submit an external job application, contact an employer, or send a networking message. Obtain and follow the operator's separate, explicit policy.

## Backend rules

- Treat the Job Hub backend as canonical. Do not make a spreadsheet the primary state store.
- Prefer `/api/application-actions` and `/api/discovery` over replacing the full `/api/state` object.
- Use stable idempotency keys and timezone-aware timestamps.
- Dry-run exact IDs before production writes. Never use `--all` except for an explicitly authorized migration.
- Never record `SUBMITTED` without authoritative confirmation. Never retry an ambiguous final submission.
- Preserve exact-package, upload-hash, duplicate, and optimistic-revision controls.

## Validation

Before handing off a change, run:

```bash
npm run safety:check
npm test
```

For a configured backend, run the read-only agent smoke test:

```bash
npm run agent:smoke
```

Do not weaken the safety check or add personal fixtures to make a test pass.
