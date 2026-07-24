# PERT Reading Practice (web app)

Static **Option C** hybrid trainer for GitHub Pages: skill drills, mixed sets, PERT-style mock (no back), missed queue, and progress with export/import.

## Run locally

Needs `http`/`https` (not `file://`) because questions load via `fetch`:

```bash
cd practice
python3 -m http.server 8080
```

Open http://localhost:8080/

## GitHub Pages

Publish this folder (or the repo root containing it). Use relative paths only — already configured (`./app.js`, `./questions.json`). Navigation uses hash routes (`#drill`, `#mock`, …).

## Files

| File | Role |
|------|------|
| `index.html` | Bootstrap UI |
| `app.js` | Modes, scoring, `localStorage` |
| `questions.json` | Original practice bank (**400** items, 40 per skill; long passages) |

Progress key: `pert-reading-practice-v1` in the browser.

## Refreshing the question bank

Use the project skill **`refresh-pert-reading-bank`** (ask the agent to refresh/renew/expand the bank). Validator:

```bash
python3 .cursor/skills/refresh-pert-reading-bank/scripts/validate_bank.py belle/practice/questions.json
```

