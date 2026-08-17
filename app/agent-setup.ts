export type AgentSetup = {
  baseUrl: string;
  privateRoot: string;
};

export const AGENT_PREFERENCES_KEY = "job-hub:agent-setup:v1";
export const AGENT_TOKEN_SESSION_KEY = "job-hub:agent-token:session:v1";
export const DEFAULT_PRIVATE_ROOT = "private-data/job-hub";

export function normalizeAgentBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function isAllowedAgentBaseUrl(value: string) {
  try {
    const url = new URL(normalizeAgentBaseUrl(value));
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch {
    return false;
  }
}

export function isSafePrivateRoot(value: string) {
  const root = value.trim();
  if (!root || ["/", "\\", "~", "$HOME", "${HOME}", "%USERPROFILE%"].includes(root)) return false;
  if (root === "private-data" || root.startsWith("private-data/")) return true;
  if (/^\/(?:[^/]+\/){2,}[^/]+/.test(root)) return true;
  return /^[A-Za-z]:\\(?:[^\\]+\\){2,}[^\\]+/.test(root);
}

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function buildSafeRuntimeSetup(setup: AgentSetup) {
  const baseUrl = normalizeAgentBaseUrl(setup.baseUrl);
  const privateRoot = setup.privateRoot.trim();
  return [
    `export JOB_HUB_BASE_URL=${shellSingleQuote(baseUrl)}`,
    `export JOB_HUB_PRIVATE_ROOT=${shellSingleQuote(privateRoot)}`,
    "printf 'Sites agent token: ' >&2",
    "read -r -s JOB_HUB_SIWC_BYPASS_TOKEN",
    "printf '\\n' >&2",
    "export JOB_HUB_SIWC_BYPASS_TOKEN",
    'mkdir -p "$JOB_HUB_PRIVATE_ROOT"',
    "npm run agent:smoke",
  ].join("\n");
}

export function buildCodexGuide(setup: AgentSetup) {
  const baseUrl = normalizeAgentBaseUrl(setup.baseUrl) || "https://your-job-hub.example.com";
  const privateRoot = setup.privateRoot.trim() || DEFAULT_PRIVATE_ROOT;
  return `# Job Hub Codex setup

This file contains operating instructions, never credentials. Keep the Sites token only in the current process environment.

## Runtime contract

- Backend URL: ${baseUrl}
- Private artifact root: ${privateRoot}
- Required secret variable: JOB_HUB_SIWC_BYPASS_TOKEN
- Integration contract: docs/AGENT_INTEGRATION.md

Before reading or writing Job Hub:

1. Read docs/AGENT_INTEGRATION.md in full.
2. Confirm JOB_HUB_BASE_URL, JOB_HUB_PRIVATE_ROOT, and JOB_HUB_SIWC_BYPASS_TOKEN are present in the runtime environment. Never print the token or write it to a file.
3. Run npm run agent:smoke. It is read-only and must pass before any write.
4. Treat the private Job Hub backend as canonical. Keep candidate facts, resumes, job descriptions, recordings, transcripts, exports, and submitted artifacts under JOB_HUB_PRIVATE_ROOT or another ignored private directory.
5. Use the existing exact-ID clients under scripts/. Dry-run the exact IDs first. Never use --all for routine work.
6. Preserve stable idempotency keys, duplicate checks, exact-package validation, immutable artifact hashes, and ambiguous-outcome stops.
7. After a write, read the backend again and verify the resulting record. Never infer success from a click or an HTTP request alone.
8. Do not submit an application, contact a person, or broaden authority unless the operator's separate policy explicitly allows it.

## Shell setup

Use the terminal setup copied from Job Hub's Data & backup page. It prompts for the token without placing the secret in this file or in the command itself.

Codex reads AGENTS.md before it begins work. Place this file at the repository root as AGENTS.md, or merge this section into the repository's existing AGENTS.md without deleting stricter project instructions.
`;
}
