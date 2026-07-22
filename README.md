# Job Hub

A local-first workspace for job applications, follow-ups, and a personalized 84-day interview-prep plan.

## What it includes

- Application pipeline with compensation, status, priority, links, and follow-up dates
- Overview with active applications, interviews, offers, and overdue follow-ups
- 12-week LeetCode plan with daily focus, timer, progress, confidence, and written journals
- JSON backup/restore and CSV import for application data
- Browser-only storage: personal records are not built into the repository or sent to a server

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

## Validate a production build

```bash
npm run build
npm test
```

## Privacy

The repository ships with three clearly labeled demo applications. Your real applications, notes, and problem journals are stored in your browser's local storage. Use **Data & backup** inside the app to export them before switching browsers or computers.
