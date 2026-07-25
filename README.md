# Job Hub

A local-first workspace for job applications, follow-ups, and a personalized 84-day interview-prep plan. It automatically reads the existing Excel job tracker in the parent project.

## What it includes

- Automatic sync from the workbook's `Applications` sheet every 30 seconds and whenever the window regains focus
- Application pipeline with compensation, exact workbook status, current round, next action, and notes
- Overview with active applications, interviews, offers, and overdue follow-ups
- 12-week LeetCode plan with daily focus, timer, progress, confidence, and written journals
- AI submission coach: score pasted code plus every journal explanation against current online references, with a weighted rubric, missing-input check, progressive hints, edge cases, and interview feedback
- JSON backup/restore and CSV import for application data
- Local-only storage and workbook access: personal records are not built into the repository or sent to an external server

## Run locally

Requires Node.js 22.13 or newer.

### Easiest on macOS

Double-click `start-local.command`. The first launch installs the required packages, then opens the app at `http://localhost:3000`.

### From a terminal

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## One-time AI code-review setup

The AI reviewer needs an OpenAI API key. The key stays in the local server and is never placed in browser code or committed to GitHub.

1. Copy `.env.example` to a new file named `.env.local`.
2. Add your key after `OPENAI_API_KEY=`.
3. Restart Job Hub.

The default review model is `gpt-5.6-sol`. You can change `OPENAI_MODEL` in `.env.local` if your account uses a different available model. The journal defaults to Python 3 and keeps brute-force time/space, optimal time/space, algorithm steps, edge cases, and mistake reflection as separate answers. AI review uses OpenAI web search to compare every journal answer plus your code with current public problem references. It returns a weighted scorecard and progressive hints, but it can make mistakes and does not replace running LeetCode tests.

## Workbook connection

By default, Job Hub reads:

```text
../outputs/2026-07-19-sf-job-tracker/Ashwin_Chembu_SF_Job_Tracker.xlsx
```

The workbook's `Applications` sheet is the source of truth. Changes made by the Gmail tracker automation or in Excel appear in the app automatically. Workbook-synced records are read-only in Job Hub so a browser edit cannot accidentally overwrite the tracker.

If the workbook moves, start Job Hub with `JOB_TRACKER_PATH` set to the new absolute or project-relative path.

## Validate a production build

```bash
npm run build
npm test
```

## Privacy

The repository contains no private application rows. The local server reads the workbook directly, while coding progress, manually added roles, journals, pasted code, and saved AI reviews are stored in browser local storage. Your pasted code and journal answers are sent to OpenAI only when you press **Score all my work**. Use **Data & backup** inside the app to export local records before switching browsers or computers.
