# Job Application Hub

A candidate-neutral, backend-synced workspace for application tracking, job discovery, interview preparation, and coding practice. The repository ships with an empty application seed and no candidate records.

## Features

- Cloudflare D1-backed application, discovery, preparation, and interview state
- Idempotent agent-facing application and discovery actions
- Exception-only review for genuine judgment or access blockers
- Immutable resume-package metadata and upload-hash validation
- Daily mailbox-status fields kept separate from recruiter-outreach timing
- Cached recruiter-call follow-up drills with full Career Lab content gated on a confirmed interview
- Evidence-based funnel diagnostics
- Coding-practice plan, journals, hints, and optional OpenAI-assisted review
- Local JSON/CSV/XLSX recovery exports

## Local setup

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Keep API keys, backend tokens, candidate facts, resumes, application ledgers, mailbox exports, and database backups out of Git.

## Sites setup

Replace `REPLACE_WITH_YOUR_SITES_PROJECT_ID` in `.openai/hosting.json` with a project created for your own deployment. The D1 binding remains `DB`. Do not reuse another person's Sites project ID or backend token.

The optional OpenAI features use `OPENAI_API_KEY` on the server. The key is never required in browser code.

## Codex and agent integration

Use the in-app **Data & backup → Agent onboarding** flow, then read [docs/CODEX_SETUP.md](./docs/CODEX_SETUP.md), [AGENTS.md](./AGENTS.md), and [docs/AGENT_INTEGRATION.md](./docs/AGENT_INTEGRATION.md). Agent sync scripts require:

```bash
export JOB_HUB_BASE_URL='https://your-job-hub.example.com'
export JOB_HUB_SIWC_BYPASS_TOKEN='runtime-only-token'
export JOB_HUB_PRIVATE_ROOT='private-data/job-hub'
npm run agent:smoke
```

Production writes require exact event/package/action IDs. The sync scripts dry-run locally, use stable idempotency keys, and reject broad writes unless an intentional migration explicitly supplies `--all`.

## Validation

```bash
npm run safety:check
npm test
```

The safety check rejects committed private configuration, non-empty seed applications, resume artifacts, absolute home-directory paths, likely secrets, and first-party personal contact data.

## Privacy model

The repository contains code and placeholders only. Durable user records belong in the private D1 database. Local candidate facts, populated resume specifications, generated PDFs, job descriptions, screenshots, application answers, recruiter messages, and exports belong under `private-data/`, which is ignored.

Do not push a clone of a private working repository whose history contains candidate data. Publish this sanitized tree as a new repository or an orphan-history release after `npm run safety:check` passes.
