> Updated kitchen workflow: read [v2 behavior](../docs/KITCHEN_WORKFLOW_V2.md).
> Menu editing is now supported; results may have unmeasured quantities and quick
> portion/container entries. The original setup instructions below still apply.

# MealWise backend

A local hostel meal-planning and food-waste prototype using Python, FastAPI,
SQLModel and SQLite. Implements the original planning API and the v2 kitchen workflow. All supplied recipes and seeded records
are illustrative **Demo data**, not evidence of real savings.

## Windows setup in VS Code

Install Python 3.11 or newer (tested here on Python 3.12), enable “Add Python to PATH”,
and install the VS Code Python extension. Open the `backend` folder
in VS Code, then choose Terminal → New Terminal. Run from that folder:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

These commands use the environment directly, so PowerShell activation permissions
are not needed. In VS Code run “Python: Select Interpreter” and select
`.venv\Scripts\python.exe`. If `py` is unavailable, use `python` for the first command.
Stop the server with Ctrl+C.

- Interactive API documentation: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/api/health
- Base URL for the React API client: `http://127.0.0.1:8000/api`

CORS allows the default Vite origins `http://localhost:5173` and
`http://127.0.0.1:5173`. Keep loopback binding for this local prototype. Both apps
must run on the same computer for this URL to work. The frontend uses a Vite proxy for /api requests. If you change the API port, set
MEALWISE_API_TARGET in the frontend terminal (see frontend/README.md).

## Demo data (optional, explicit)

The normal server starts with an empty database. In a second terminal:

```powershell
.\.venv\Scripts\python.exe seed.py
```

This adds 14 fictional completed lunches before today and one lunch tomorrow,
using Asia/Kolkata dates, stable UUIDs, and `is_demo=true`. Seed notes label records
“Demo data”; forecasts also carry `is_demo`. Some dishes are explicitly estimated.
The upcoming meal cannot receive results until its date. Use a past seeded meal
for result-entry demos. Seed does not overwrite existing plans/results, even when
rerun on another day. Existing date/type slots are skipped. Do not interrupt the
seed process; if a failure occurs after a plan is inserted, its result can be entered
through the normal results endpoint without overwriting other data.

Optional reproducible anchor date (use a date no later than today):

```powershell
.\.venv\Scripts\python.exe seed.py --date 2026-10-22
```

For a separate fresh demo dataset, set the variable in every terminal that runs
MealWise, then seed and run the server:

```powershell
$env:MEALWISE_DB="demo.db"
.\.venv\Scripts\python.exe seed.py
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1
```

Relative database paths are always resolved against the backend folder, never the
terminal working directory. Absolute paths are also accepted. The parent directory
must already exist and be writable. Remove the environment override with
`Remove-Item Env:MEALWISE_DB`. Do not delete a database containing work you need.
To back up: stop both the server and seed process, then copy the active `.db` file.
Restore by pointing `MEALWISE_DB` at the saved copy. SQLite requires no separate installation.

## How the workflow works

1. React loads `/recipes` for capacity, settings, recipe IDs and raw allowances.
2. React sends all planning inputs to `/forecast`. The backend validates them,
   selects completed history strictly before the target date and stores a preview.
3. The manager reviews the forecast. Save sends only its `forecast_id` to `/plans`.
   Changed inputs require a new preview. The backend promotes the stored snapshot
   without recalculating, even after a restart or history/config changes.
4. React reads `/plans` for dashboard/history. Each entry includes forecast,
   nullable result and nullable derived metrics. Dates sort newest first, then
   dinner/lunch/breakfast. The frontend selects the next pending meal on/after
   today and latest completed meal using Asia/Kolkata dates and meal order.
5. Submit weighed or estimated cooked-food outcomes to `/plans/{id}/result`.
   Every saved dish must appear exactly once. A PUT fully replaces the one result.
6. Refresh `/plans` and `/insights` after successful results entry or correction.

### Endpoints

| Method | Path | Successful response |
|---|---|---|
| GET | `/api/health` | Service/database status, 200 |
| GET | `/api/recipes` | Settings and recipes, 200 |
| POST | `/api/recipes` | Create kitchen recipe, 201 |
| PUT | `/api/recipes/{id}` | Edit or archive kitchen recipe, 200 |
| POST | `/api/forecast` | Persistent immutable Forecast, 200 |
| POST | `/api/plans` | Complete Plan, 201 first save; 200 retry of same preview |
| GET | `/api/plans` | `{ "plans": [...] }`, 200 |
| PUT | `/api/plans/{id}/result` | Result object, 200 |
| GET | `/api/insights` | Aggregate analytics, 200 |

There is no single-plan GET, delete, settings endpoint, account
system or external AI API. GET requests accept no body or query parameters.
Errors use `{"error":{"code":"...","message":"...","fields":[]}}`.
Unknown IDs return 404; saving a different preview for an occupied meal slot
returns 409; validation failures return 422; unavailable storage returns 503;
unexpected failures return a generic 500. Failed results validation preserves
previous data. Database unique constraints protect concurrent saves; SQLite upsert
atomically replaces the result JSON and all dish rows as one snapshot.

### Try one meal using Swagger

Open `/docs`, expand POST `/api/forecast`, click Try it out and enter:

```json
{
  "date": "2020-01-01",
  "meal_type": "lunch",
  "recipe_ids": ["rice"],
  "fallback_diners": 180,
  "adjustment": -30,
  "adjustment_reason": "Students attending an off-campus event",
  "buffer_percent": 5
}
```

In a fresh database this yields baseline 180, adjusted 150, planned 158 and raw
rice 15.8 kg. Copy its returned UUID into POST `/api/plans`:

```json
{"forecast_id":"PASTE-FORECAST-UUID-HERE"}
```

Copy the returned plan `id` into PUT `/api/plans/{id}/result`, then enter:

```json
{
  "actual_diners":150,
  "shortage_count":2,
  "dishes":[{
    "recipe_id":"rice",
    "prepared_kg":40,
    "unserved_kg":2,
    "plate_waste_kg":1,
    "measurement_method":"weighed"
  }],
  "notes":"Illustrative demonstration measurements."
}
```

GET `/plans` now shows completed status, 3 kg waste, 20 g waste per diner and
30 diners baseline error. Repeating PUT replaces results rather than adding another meal.

## Files and incremental implementation

| File | Purpose |
|---|---|
| `config.json` | Editable capacity, fallback, default buffer, timezone and demo flag |
| `recipes.json` | Stable recipe/ingredient IDs and illustrative raw grams per diner |
| `models.py` | SQLModel tables and uniqueness/foreign-key constraints |
| `schemas.py` | Required fields, strict types, enums, decimal precision and extra-field rejection |
| `planning.py` | Forecast selection, decimal arithmetic, ingredient aggregation and metrics |
| `main.py` | App factory, anchored SQLite path, routes, errors, CORS and transactions |
| `seed.py` | Explicit, stable, rerunnable fictional demo population |
| `tests/test_backend.py` | API, calculation, validation, concurrency, persistence and seed tests |
| `requirements.txt` | Pinned direct dependencies, including tests and Windows timezone data |
| `pytest.ini` | Makes test imports work from VS Code or the backend folder |
| `docs/PROJECT_BRIEF.md` | Unchanged supplied project brief |
| `docs/API_CONTRACT.md` | Unchanged supplied API contract, exact field reference |
| `TEST_RESULTS.md` | Recorded verification and environment |

To study incrementally: first read models and schemas; next read make_forecast
and run calculation tests; then read forecast/save/list routes; next results and
metrics; finally insights, seed and the remaining tests. The React frontend uses these endpoints directly.

### Database design

`ForecastRow` stores the complete public snapshot plus its private unrounded
baseline as text. `PlanRow` points to that forecast and uniquely reserves date/type
and forecast ID. `ResultRow` has plan ID as its primary key, so each plan has at most
one result. Starter recipes come from JSON; RecipeRow stores persistent kitchen edits, with a
full copy frozen into each forecast. JSON snapshots preserve dish names and
allowances without depending on current recipe edits. Plan status/metrics are
computed when read. Preview rows never count as plans or insights.

### Forecasting and analytics

Use up to four most recent completed meals on the same weekday if at least two
exist; otherwise use up to seven most recent meals of that type; otherwise use
request fallback. Zero-diner completed meals are included. No future or same-date
record contributes. Baselines retain decimal calculation precision; only displayed
values are rounded. Planned diners are ceiling(max(0, baseline + adjustment) ×
(1 + buffer/100)), capped at capacity.

Raw ingredient kg is diners × grams/1000. Equal ingredient IDs are combined before
rounding. Raw ingredients are not cooked-food weights. Recorded waste is unserved
plus plate waste; this demo treats unserved food as discarded edible food.
Kilograms use three decimal places; ratios and errors use two, round-half-up.
Baseline error uses the original baseline, without manager adjustment or buffer.
Shortages remain visible because served diners may understate demand.
Aggregate grams/diner uses complete records only: total waste × 1000 / total
diners for those records, never an average of meal ratios. Zero total diners returns null. No completed meals gives null mean
baseline error. Mixed demo and estimated measurements are exposed through counts.

### Editing settings and recipes

Use Menu Library to add, edit, or archive kitchen recipes. To change server settings
or starter defaults, stop the server, back up the database, edit
`config.json`/`recipes.json`, then restart. Saved kitchen edits override starter defaults.
Startup validates capacity (1–10000), fallback, buffer, timezone, nonempty recipe
fields, unique IDs and consistent shared ingredient names. Never repurpose stable
IDs; add a new ID for a different ingredient/recipe. A shared ingredient must use
the same ID/name, always raw grams per diner. Ingredient allowances must be positive,
no more than 10000 and at most three decimal places. Kitchen staff must validate
these fictional allowances. Existing previews/plans retain their snapshots. Results
validate against the saved capacity and dish set, even if current recipes change.

## Automated checks

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Tests use isolated temporary databases and do not touch your mealwise/demo database.
The delivered version passed **48 tests**. They cover strict validation, rounding,
capacity/zero demand, history selection, raw ingredient merging, weighted insights,
snapshot persistence, result corrections, duplicate requests, concurrent conflicts,
storage errors and rerunnable seeding. One upstream test-client deprecation warning
is harmless; see TEST_RESULTS.md. A Windows computer was not available for execution;
the Windows instructions use standard venv commands and include `tzdata`.

This is the agreed local prototype. There are no claims of proven savings or
production deployment readiness; real allowances and measurements need a kitchen pilot.
