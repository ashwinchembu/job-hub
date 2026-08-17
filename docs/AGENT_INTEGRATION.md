# Agent Integration

This contract lets Codex or another automation client read and update Job Hub without embedding private data in source control.

## Runtime configuration

Set these values outside Git:

```bash
export JOB_HUB_BASE_URL='https://your-job-hub.example.com'
export JOB_HUB_SIWC_BYPASS_TOKEN='runtime-only-token'
export JOB_HUB_PRIVATE_ROOT='private-data/job-hub'
```

Hosted requests use the token as:

```text
OAI-Sites-Authorization: Bearer <runtime token>
```

Never log the token. A local development server may not require the Sites authorization header.

`JOB_HUB_PRIVATE_ROOT` is the stable ignored directory for candidate facts, generated resumes, job descriptions, recordings, transcripts, exports, and immutable submitted artifacts. Use the same path across agent runs; never place these files in tracked source directories.

Run `npm run agent:smoke` first. It performs only `GET /api/state` and `GET /api/discovery` and reports counts rather than record contents.

## Canonical endpoints

### `GET /api/state`

Returns the current application list, coding progress, settings, and `updatedAt` revision.

### `PUT /api/state`

Replaces the complete state and requires `baseUpdatedAt` from the latest read. Use this only for interactive UI saves or intentional restoration. A stale revision returns `409`; reload rather than overwriting newer state.

### `POST /api/application-actions`

Supported actions are `PREPARED`, `APPROVED`, `APPROVAL_REJECTED`, `SUBMITTED`, `BLOCKED`, `MAILBOX_CHECKED`, `STATUS_CHANGED`, and `UPSERT`.

Every request requires:

- a stable `approvalId` or `idempotencyKey`;
- `action` or `operation`;
- a timezone-aware `recordedAt`.

Retries with the same action ID return `duplicate: true`. Preparation and submission actions enforce the exact package, immutable artifact path, resume/upload SHA-256, validation, confirmation, and exception state stored by the backend.

Example non-submission action:

```json
{
  "action": "MAILBOX_CHECKED",
  "idempotencyKey": "mailbox-example-company-role-2026-01-15",
  "applicationId": "application-example-123",
  "company": "Example Company",
  "role": "Software Engineer",
  "recordedAt": "2026-01-15T08:00:00-08:00",
  "mailboxSignal": "No new application-status message found."
}
```

### `GET /api/discovery`

Returns source summaries, deduplicated leads, and recent run summaries.

### `POST /api/discovery`

Supported operations are `SOURCE_SCAN_RECORDED`, `LEAD_UPSERT`, `LEAD_STATUS_CHANGED`, and `DISCOVERY_RUN_RECORDED`. Use a stable event ID, retain the discovery URL separately from the official employer URL, and verify an official posting before marking a lead `Qualified`.

Example:

```json
{
  "operation": "LEAD_UPSERT",
  "eventId": "lead-example-company-engineer-v1",
  "source": "Example source",
  "recordedAt": "2026-01-15T08:15:00-08:00",
  "lead": {
    "id": "example-company-engineer",
    "company": "Example Company",
    "role": "Software Engineer",
    "location": "Example location",
    "status": "Verified",
    "sourceUrl": "https://example.com/discovery/example-role",
    "officialUrl": "https://jobs.example.com/example-role"
  }
}
```

### `GET /api/interview-lessons`

Returns compact, user-scoped lessons derived from completed interview-recording analyses. It intentionally omits audio and raw transcripts. Each lesson includes the company/role/stage, the user-recorded outcome (`Passed`, `Failed`, `Pending`, or `Unknown`), actual question patterns, strengths, improvement targets, and next-pack instructions.

Use this read-only endpoint when generating a new company-specific interview pack:

- reinforce answer patterns associated with `Passed` stages;
- repair weaknesses associated with `Failed` stages;
- treat `Pending` and `Unknown` as observations, never as evidence of success or failure;
- transfer question patterns and coaching lessons, not stale facts about another company;
- keep the current company's product, role, official description, and verified candidate evidence authoritative.

### Interview recording endpoints

`POST /api/interview-recordings` accepts a multipart audio upload tied to an exact `applicationId`, interview-stage key/label, call date, and known outcome. The private backend stores audio in object storage and transcript/analysis metadata in its database, then runs speaker-aware transcription and structured analysis before returning. Authorized runtime-token clients and the signed-in owner share one canonical private recording history, so agent uploads appear immediately in Job Hub.

`GET /api/interview-recordings?applicationId=<exact-id>` returns that application's private recording history, transcript, analysis JSON, questions, feedback, and recruiter-confirmed future steps. `GET /api/interview-recordings?scope=all` returns metadata without raw transcripts.

`PATCH /api/interview-recordings/<recording-id>` updates the authoritative outcome. `POST /api/interview-recordings/<recording-id>/reprocess` retries a failed analysis without uploading another copy. Audio playback is available through the authenticated `/audio` subroute.

Do not download, print, persist, or commit raw audio/transcripts unless the user explicitly requests a private export. For new-pack generation, prefer `GET /api/interview-lessons`.

## Included sync clients

- `scripts/sync-discovery-events.mjs` syncs exact discovery event IDs.
- `scripts/sync-prepared-applications.mjs` syncs exact preparation package IDs.
- `scripts/sync-application-actions.mjs` syncs exact application action IDs.

All three require `JOB_HUB_BASE_URL`. Production writes additionally require `JOB_HUB_SIWC_BYPASS_TOKEN`. Use `--dry-run` first and supply an exact allowlist. Do not use `--all` for ordinary work.

## Agent operating sequence

1. Run the read-only smoke test.
2. Read current backend state and deduplicate against existing IDs and normalized company/role keys.
3. Validate private candidate facts and the complete official job description outside the repository.
4. Create immutable private artifacts and stable IDs.
5. Dry-run only the intended events.
6. Send exact idempotent actions.
7. Read the backend again and verify the resulting state.
8. Read `/api/interview-lessons` when producing interview preparation, and apply outcome-aware lessons without copying stale company facts.
9. Keep private artifacts and any response containing candidate information outside Git.

This codebase supplies an interface, not application-submission authority. The operator's private policy determines what external actions are allowed.
