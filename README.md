# Job Hub

A local-first workspace for job applications, follow-ups, and a personalized 84-day interview-prep plan. It automatically reads the existing Excel job tracker in the parent project.

## What it includes

- Automatic sync from the workbook's `Applications` sheet every 30 seconds and whenever the window regains focus
- Application pipeline with compensation, exact workbook status, current round, next action, and notes
- Overview with active applications, interviews, offers, and overdue follow-ups
- 12-week LeetCode plan with daily focus, timer, progress, confidence, and written journals
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

The repository contains no private application rows. The local server reads the workbook directly, while coding progress, manually added roles, and journals are stored in browser local storage. Use **Data & backup** inside the app to export them before switching browsers or computers.
