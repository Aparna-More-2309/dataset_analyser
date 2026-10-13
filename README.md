# Clarity Data Health

A local-first data quality dashboard that lets you upload CSV/TSV files, inspect dataset health, and explore a Supabase-like local studio without needing API keys or external services.

## Features

- CSV and TSV upload analysis
- Local dataset quality scoring
- Duplicate, missing-value, and outlier checks
- Data profile and pivot relationship insights
- Local Studio database-like project persistence
- Watched folder support for local files in `data/watched`
- Optional Gemini AI summary button for manual dataset summaries
- Works fully offline by default

## Tech stack

- React + Vite
- Express + Node.js
- Local JSON-backed project storage
- CSV parsing and analysis logic in the app

## Project structure

```text
dataset_analyser/
  server/
    index.js
    analyzer.js
  src/
    main.jsx
    lib/
      data-analysis.js
  data/
    watched/
    local/
  .env.example
  .gitignore
  package.json
  README.md
```

## Prerequisites

- Node.js 18+
- npm

## Install dependencies

```bash
cd dataset_analyser
npm install
```

## Run locally

Start the app in development mode:

```bash
cd dataset_analyser
npm run dev
```

This launches the backend and front end together.

## App URLs

- Front end: http://localhost:5173
- Backend: http://localhost:8787

## Environment variables

Copy `.env.example` to `.env` if needed:

```bash
cp .env.example .env
```

Example values:

```env
PORT=8787
VITE_API_URL=http://localhost:8787
GEMINI_API_KEY=
```

The app runs without external credentials by default. The Gemini key is optional and only used when you manually trigger the AI summary button.

## Local file watch

The app checks the folder:

```text
data/watched
```

Drop CSV or TSV files there, and the dashboard will detect them in the right-side Files panel. Clicking one loads the full dataset analysis.

## Notes

- No billing is required for the local-first workflow.
- Gemini is optional and should be used sparingly.
- Keep `.env` out of version control.

## Scripts

```bash
npm run dev
npm run build
npm test
```
