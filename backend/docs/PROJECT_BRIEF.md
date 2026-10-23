# MealWise — one-day project brief

## Goal

Help one hostel mess manager decide how much food to prepare, record actual service
outcomes, and understand recurring overpreparation. Build a usable local prototype
in ten working hours with two people. Actual savings require a later kitchen pilot.

## Scope

| Screen | Required behavior |
| --- | --- |
| Dashboard | Next pending meal, latest completed meal, aggregate waste and waste per diner |
| Plan a Meal | Date, meal type, recipes, fallback attendance, manager adjustment/reason, buffer, explained forecast and raw ingredient quantities; save approved preview |
| Record Results | Choose a plan; enter diners served, shortages and per-dish cooked prepared/unserved/plate-waste kg; correct existing results |
| History | Plans, completion status, saved forecast snapshots, results and metrics |

Use the API contract as the source of truth for field names and calculations.
The frontend derives dashboard selections from the plan list; aggregates come from insights.
Pick the earliest pending plan on/after today for “next meal” and the most recent
completed plan for “latest meal”, using Asia/Kolkata dates and breakfast/lunch/dinner order.

### Excluded

Student accounts, payments, chatbots, external AI APIs, notifications, donation matching,
cameras, advanced ML, public deployment and statistical claims about savings.
Batch cooking, Telugu translations and additional charts are optional only after
the complete workflow passes checks. Do not expand the API silently.

## Stack and responsibilities

- Satya Sri: React + Vite + TypeScript + plain CSS under `frontend/`; integration and demo.
- Teammate: Python + FastAPI + SQLModel + SQLite under `backend/`; calculations and data.
- Shared: approve contract changes together; Satya Sri coordinates merges.
- Keep backend simple: `main.py`, `models.py`, `planning.py`, `seed.py`,
  `requirements.txt`, `tests/`, `README.md`.
- Anchor the database path to the backend directory, independent of process working directory.
- Configuration and recipes are editable through a documented backend config/seed
  workflow for v1; no settings or recipe editor endpoint is required.
- Default fictional hostel: capacity 250, fallback 180, buffer 5%, timezone Asia/Kolkata.
- Recipes: rice, dal, vegetable curry. Ingredient allowances are illustrative and
  require kitchen validation before real use.
- Recipes must share stable ingredient IDs when an ingredient appears in multiple dishes.

## Product rules

1. Historical baseline uses only completed meals dated before the target date.
2. Students do not need to submit daily meal intentions.
3. The manager approves the forecast; the tool does not autonomously control cooking.
4. Raw ingredients and cooked-food weights are different measurements.
5. Saved forecast and recipe snapshots never change after later history/config edits.
6. Each plan has at most one result; corrections replace it atomically.
7. Label fictional records “Demo data”; label weighed versus estimated measurements.
8. Waste means recorded unserved plus plate waste. For the demo, unserved food is
   treated as discarded edible food; future retained/reused food needs a separate field.
9. No money-saved or proven-waste-reduction card.
10. Forecast error measures the original baseline; buffered planned diners are separate.

## Schedule

| Elapsed hours | Frontend | Backend | Shared checkpoint |
| --- | --- | --- | --- |
| 0–0.75 | Read contract, sketch screens | Read contract, define models | Same committed specification |
| 0.75–2 | Scaffold and typed API client | Health, recipes, forecast | Real forecast displayed |
| 2–4 | Plan saving and results form | Plan persistence and result upsert | Core workflow works |
| 4–6 | Dashboard and history | Insights and seed data | Feature complete |
| 6–8 | Integration, mobile and error states | Edge cases and persistence tests | Acceptance checks pass |
| 8–10 | Screenshots and demo rehearsal | README, clean setup and backup | Reproducible local delivery |

Stop adding features at hour six. Integrate early instead of waiting for finished branches.

## Acceptance checklist

- [ ] Both assistants implement the exact shared contract.
- [ ] 180 baseline minus 30 adjustment plus 5% buffer yields 158 planned diners.
- [ ] At 100 g raw rice per diner, 158 diners require 15.8 kg.
- [ ] Capacity cap, zero demand and no-history fallback work.
- [ ] Only historical completed meals contribute; future records are excluded.
- [ ] Preview/save uses the same snapshot, even if history changes meanwhile.
- [ ] Duplicate meal plans and repeated create requests follow contract behavior.
- [ ] Invalid numbers, missing/duplicate dishes and waste exceeding prepared weight fail clearly.
- [ ] PUT twice leaves one result; corrections update analytics.
- [ ] Zero diners returns null for waste per diner.
- [ ] Aggregate waste per diner uses total waste / total diners.
- [ ] Data survives refresh and backend restart, including a changed working directory.
- [ ] Seed can run twice without duplication or overwriting user-created data.
- [ ] API failure preserves inputs and shows a useful error; no silent mock fallback.
- [ ] Phone-sized layout and keyboard navigation work; inputs have visible labels and units.
- [ ] Frontend production build succeeds and backend tests pass.
- [ ] Both computers can follow READMEs and run the combined project.

## Demo and pilot

Seed about 14 fictional completed meals with varying attendance and waste. All seed
records have stable identifiers, `is_demo: true`, and are safely rerunnable.
Keep dates relative to the demo date; do not silently modify existing records on rerun.
Use a separate disposable demo database when a fresh dataset is needed.
Include one upcoming plan and clearly mark the entire seeded environment as demo.

Three-minute demo: explain the problem (25 sec); preview a meal (45 sec); apply
an event adjustment (30 sec); save and enter actual outcomes (35 sec); show insights
(25 sec); explain a proposed pilot (20 sec).

For a real pilot, interview the manager and cooks, validate recipe quantities, record
comparable menus/weekdays, and track waste per diner alongside shortages and waiting
time. Do not present simulated improvements as observed impact.
