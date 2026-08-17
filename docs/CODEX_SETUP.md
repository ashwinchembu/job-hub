# Codex setup for Job Hub

Job Hub's **Data & backup → Agent onboarding** section creates a safe, deployment-specific handoff for another Codex installation.

## One-time operator setup

1. Enter the deployed Job Hub URL.
2. Choose a dedicated private save path. `private-data/job-hub` is the repository-safe default because `private-data/` is ignored; a dedicated absolute directory is also accepted. Broad paths such as `/`, `~`, `$HOME`, or `%USERPROFILE%` are rejected.
3. Paste that deployment's Sites runtime token and select **Verify read-only access**. The browser sends it only to the selected backend's `GET /api/state` endpoint.
4. Select **Copy terminal setup**. The copied command contains the URL and private path, but prompts for the token in the terminal instead of embedding it in shell history.
5. Select **Download AGENTS.md** and place or merge it at the root of the repository Codex will operate.

The token is held only in the current tab's `sessionStorage`. It is never added to Job Hub state, D1, `localStorage`, a backup, the downloaded guide, source control, or the generated terminal command.

## What the generated guide enforces

- Read `docs/AGENT_INTEGRATION.md` before backend operations.
- Run the read-only smoke test first.
- Treat the private backend as canonical.
- Keep candidate artifacts under the selected private path.
- Dry-run exact IDs; never use `--all` for routine work.
- Preserve idempotency, duplicate protection, immutable hashes, and ambiguous-outcome stops.
- Read the backend after a write and verify the resulting record.
- Keep external-action authority separate from backend access.

Codex reads `AGENTS.md` at startup, so restart the task after adding or changing the file.
