# MealWise API contract v1

Status: implementation specification. Both assistants must implement these names
and structures exactly. Changes require agreement before either side codes them.

## 1. Conventions and configuration

Base path: `/api`. JSON request/response bodies; UTF-8; snake_case keys.
No authentication for this local fictional-data prototype. Bind backend to loopback.
Do not expose it publicly as a production application.

- Dates: valid ISO calendar dates `YYYY-MM-DD`, interpreted in Asia/Kolkata.
- Timestamps: UTC ISO 8601 strings ending in `Z`.
- IDs: opaque strings; generated plan/forecast IDs are UUID strings. Recipe and
  ingredient IDs are stable slugs, never display names.
- Meal type: exactly `breakfast`, `lunch`, or `dinner`.
- Counts: JSON integers, never numeric strings or booleans.
- Numbers: finite JSON numbers; reject NaN, infinity, negative weights and numeric strings.
- All fields listed in request examples are required. No unknown fields accepted.
  Requests and responses have no additional properties unless explicitly stated.
- All response fields are always present; only fields explicitly marked nullable may be null.
- Weight inputs: cooked kilograms, maximum three decimal places, 0–10000 per dish.
  Ingredient allowances: raw grams per diner, >0–10000, maximum three decimal places.
- Arithmetic: use decimal-safe calculations; round displayed kilogram results to
  three decimals and ratios/errors to two decimals using round-half-up.
  Do not round averages before calculating planned diners.
- All endpoint errors use the envelope in section 3.
- GET endpoints have no request body or query parameters in v1.

Backend configuration defaults (loaded from a documented config file/module):
`hostel_capacity=250`, `default_fallback_diners=180`,
`default_buffer_percent=5`, `timezone="Asia/Kolkata"`, `is_demo=true`.
Capacity is a positive integer up to 10000. Fallback is 0–capacity.
Buffer is 0–30%, at most two decimal places.
Recipes and configuration can be edited through the documented backend workflow
and reloaded by restart. Stable IDs must not be repurposed. No edit endpoint in v1.
The frontend gets configuration from GET /recipes; it must not hardcode capacity.

## 2. Forecast algorithm and immutable snapshots

For target date D and meal type T:

1. Consider only plans with saved results, type T, and date strictly before D.
   Use actual_diners (people served). Include zero-diner completed meals.
2. Select up to four most recent matching weekdays. If at least two exist, use
   their arithmetic mean; method = `same_weekday`.
3. Otherwise use up to seven most recent completed meals of type T, regardless of
   weekday; method = `recent_meals`. Do not double-count the weekday sample.
4. If none exist, use request fallback_diners; method = `fallback`.
5. baseline = unrounded mean (or fallback).
6. adjusted = max(0, baseline + adjustment).
7. planned_diners = min(capacity, ceil(adjusted * (1 + buffer_percent / 100))).
8. For each selected recipe, raw ingredient kg =
   planned_diners * grams_per_diner / 1000.
9. Combine equal ingredient IDs across recipes before rounding totals.
   Return per-dish ingredient quantities as well as combined quantities.

Sort historical records by date descending. One plan per date/type prevents ties.
Sort returned dishes by recipe_id and ingredients by ingredient_id.
history_count is the number actually used; history_plan_ids contains their IDs in
newest-first order. fallback_diners is retained even when history is available.
estimated_diners is the baseline rounded to two decimals (a number, not necessarily
an integer); adjusted_diners is adjusted demand rounded to two decimals.
Internal baseline precision is retained with the snapshot for error calculations.

POST /forecast creates a persistent, immutable preview identified by forecast_id.
It freezes the inputs, capacity, demo flag, historical IDs/baseline, recipe names,
allowances, outputs and explanation. Previews do not count as saved meal plans and
do not appear in GET /plans or insights. They do not expire in the one-day prototype.

POST /plans accepts only forecast_id. It promotes exactly that stored snapshot;
never recompute using new history/configuration or accept client-supplied totals.
If the user changes any form input, invalidate the displayed preview and request a
new one before enabling Save. A preview must remain usable after backend restart.

A saved plan's forecast, recipe data and created_at never change. Only its result
and derived status/metrics can change.

## 3. Errors and HTTP status codes

All error responses use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Unserved food plus plate waste cannot exceed prepared food.",
    "fields": [
      {
        "path": "dishes.0.unserved_kg",
        "message": "Combined waste must be at most prepared_kg."
      }
    ]
  }
}
```

error.code and message are strings. fields is an array (empty for non-field errors);
each item has string path (dot-separated request field path) and message.
Normalize FastAPI/Pydantic validation errors into this envelope; do not return
FastAPI's default detail array. Never expose stack traces or secrets.

| HTTP | code | When |
| --- | --- | --- |
| 200 | — | Successful GET, forecast, PUT, or repeat save of same forecast |
| 201 | — | First successful creation of a meal plan |
| 404 | NOT_FOUND | Unknown forecast_id or plan ID |
| 409 | PLAN_ALREADY_EXISTS | Different forecast for an already saved date/type |
| 422 | VALIDATION_ERROR | Malformed JSON, invalid types/values, unknown fields, unknown recipe, missing/duplicate dish |
| 500 | INTERNAL_ERROR | Unexpected failure; generic user-facing message |
| 503 | STORAGE_UNAVAILABLE | Database unavailable; retryable failure |

Example 404:
```json
{"error":{"code":"NOT_FOUND","message":"Meal plan not found.","fields":[]}}
```

Example 409:
```json
{"error":{"code":"PLAN_ALREADY_EXISTS","message":"A lunch plan already exists for 2026-10-23.","fields":[]}}
```

Use a database uniqueness constraint on (date, meal_type), forecast_id for plans,
and plan_id for results. Conflict handling must be transactional, including concurrent requests.

## 4. GET /api/health

No body. 200 when service and database are usable; 503 otherwise.

```json
{"status":"ok","api_version":"1","database":"ok"}
```

Fields are strings with the exact successful values above. Do not include host paths.

## 5. GET /api/recipes

No body. 200:

```json
{
  "settings": {
    "hostel_capacity": 250,
    "default_fallback_diners": 180,
    "default_buffer_percent": 5,
    "timezone": "Asia/Kolkata",
    "is_demo": true
  },
  "recipes": [
    {
      "id": "rice",
      "name": "Rice",
      "ingredients": [
        {"ingredient_id":"raw-rice","name":"Raw rice","grams_per_diner":100}
      ]
    },
    {
      "id": "dal",
      "name": "Dal",
      "ingredients": [
        {"ingredient_id":"toor-dal","name":"Toor dal","grams_per_diner":40}
      ]
    },
    {
      "id": "vegetable-curry",
      "name": "Vegetable curry",
      "ingredients": [
        {"ingredient_id":"mixed-vegetables","name":"Mixed vegetables","grams_per_diner":80}
      ]
    }
  ]
}
```

settings types: capacity/fallback integers; buffer number; timezone string; is_demo
boolean. Recipe id/name are nonempty strings; ingredients is a nonempty array;
ingredient_id/name are nonempty strings and grams_per_diner is a positive number.
IDs are unique in their respective lists. The same ingredient ID must always have
the same name and unit. These simplified demo recipes are not complete kitchen recipes.
The endpoint may return additional recipes in this exact structure.
Recipe ordering is by id; example ordering is illustrative.

## 6. POST /api/forecast

Request:

```json
{
  "date": "2026-10-23",
  "meal_type": "lunch",
  "recipe_ids": ["rice"],
  "fallback_diners": 180,
  "adjustment": -30,
  "adjustment_reason": "Students attending an off-campus event",
  "buffer_percent": 5
}
```

| Field | Type | Validation |
| --- | --- | --- |
| date | string | Valid ISO date; past dates allowed for historical entry |
| meal_type | enum string | breakfast / lunch / dinner |
| recipe_ids | string array | 1–20 unique existing IDs |
| fallback_diners | integer | 0–current capacity |
| adjustment | integer | -capacity to +capacity |
| adjustment_reason | string | Trim whitespace; max 300 chars; nonempty when adjustment != 0 |
| buffer_percent | number | 0–30 inclusive; max 2 decimal places |

200 response is the complete **Forecast** object:

```json
{
  "forecast_id": "c475ef05-75bb-4c37-a10d-5da649cf4b36",
  "created_at": "2026-10-22T10:00:00Z",
  "date": "2026-10-23",
  "meal_type": "lunch",
  "recipe_ids": ["rice"],
  "fallback_diners": 180,
  "adjustment": -30,
  "adjustment_reason": "Students attending an off-campus event",
  "buffer_percent": 5,
  "hostel_capacity": 250,
  "estimated_diners": 180,
  "adjusted_diners": 150,
  "planned_diners": 158,
  "method": "fallback",
  "history_count": 0,
  "history_plan_ids": [],
  "explanation": "No completed lunches before 2026-10-23. Using fallback 180; adjustment -30; buffer 5%; planned 158 (capacity 250).",
  "is_demo": true,
  "dishes": [
    {
      "recipe_id": "rice",
      "name": "Rice",
      "ingredients": [
        {
          "ingredient_id": "raw-rice",
          "name": "Raw rice",
          "grams_per_diner": 100,
          "quantity_kg": 15.8
        }
      ]
    }
  ],
  "ingredients": [
    {"ingredient_id":"raw-rice","name":"Raw rice","quantity_kg":15.8}
  ]
}
```

Input fields retain their validated types. forecast_id/created_at/explanation are
strings. capacity, planned_diners and history_count are integers.
estimated_diners/adjusted_diners are nonnegative numbers. method is one of
same_weekday/recent_meals/fallback. history_plan_ids is a string array.
is_demo is boolean. dishes is the selected recipe snapshot array. Each dish has
string recipe_id/name and ingredient snapshots with string ingredient_id/name,
positive numeric grams_per_diner and nonnegative numeric quantity_kg.
Combined ingredients omit grams_per_diner and contain string ingredient_id/name
and nonnegative number quantity_kg. All quantities are RAW kilograms.
A zero-demand forecast still returns every selected dish/ingredient with zero kg.

Explanation wording is not a frontend parsing interface. It must state source,
history count (when applicable), adjustment, buffer and any capacity capping.
Errors: 422 or service errors. Forecasting is permitted even if a date/type already
has a saved plan; attempting to save a second distinct forecast returns 409.

## 7. POST /api/plans

Request:

```json
{"forecast_id":"c475ef05-75bb-4c37-a10d-5da649cf4b36"}
```

forecast_id is a required UUID string. First save returns 201 and a **Plan**:

```json
{
  "id": "0e61778c-57fb-4dc8-b33f-0e46baa33afe",
  "created_at": "2026-10-22T10:01:00Z",
  "status": "planned",
  "forecast": {
    "forecast_id": "c475ef05-75bb-4c37-a10d-5da649cf4b36",
    "created_at": "2026-10-22T10:00:00Z",
    "date": "2026-10-23",
    "meal_type": "lunch",
    "recipe_ids": ["rice"],
    "fallback_diners": 180,
    "adjustment": -30,
    "adjustment_reason": "Students attending an off-campus event",
    "buffer_percent": 5,
    "hostel_capacity": 250,
    "estimated_diners": 180,
    "adjusted_diners": 150,
    "planned_diners": 158,
    "method": "fallback",
    "history_count": 0,
    "history_plan_ids": [],
    "explanation": "No completed lunches before 2026-10-23. Using fallback 180; adjustment -30; buffer 5%; planned 158 (capacity 250).",
    "is_demo": true,
    "dishes": [
      {
        "recipe_id":"rice",
        "name":"Rice",
        "ingredients":[{"ingredient_id":"raw-rice","name":"Raw rice","grams_per_diner":100,"quantity_kg":15.8}]
      }
    ],
    "ingredients":[{"ingredient_id":"raw-rice","name":"Raw rice","quantity_kg":15.8}]
  },
  "result": null,
  "metrics": null
}
```

Plan fields: id/created_at strings; status enum planned/completed; forecast is
exactly the stored Forecast; result is null or Result; metrics is null or Metrics.
Only status/result/metrics change on PUT. There is no plan editing/deletion in v1.
Repeating POST with the SAME forecast_id returns the existing current Plan with
200 (including any result), never creates a duplicate. This is safe for network retries.
A different forecast for the same date/type returns 409. Unknown forecast returns
404; invalid body returns 422. Always return the full Plan.

## 8. GET /api/plans

No body. 200: object with one field `plans`, an array of complete Plan objects
defined in section 7 (including full forecast, result and metrics). No pagination
or filters for the one-hostel prototype. Empty dataset example:

```json
{"plans":[]}
```

After creating the example plan, the array contains exactly the section 7 Plan;
after recording results, the same entry has status completed and the Result and
Metrics from section 9. Return newest date first, dinner/lunch/breakfast within
a date. Frontend finds a particular plan by id in this list; no single-plan GET
endpoint is required. Errors: service errors only.

## 9. PUT /api/plans/{id}/result

id is the plan UUID. Creates or fully replaces its ONE result atomically.
No partial update; repeated identical requests never duplicate results or dishes.
Results for future plan dates are rejected with 422 until that date in Asia/Kolkata.

Request:

```json
{
  "actual_diners": 150,
  "shortage_count": 2,
  "dishes": [
    {
      "recipe_id": "rice",
      "prepared_kg": 40,
      "unserved_kg": 2,
      "plate_waste_kg": 1,
      "measurement_method": "weighed"
    }
  ],
  "notes": "Illustrative demonstration measurements."
}
```

Validation:

- actual_diners and shortage_count: integers 0–snapshot hostel_capacity each.
  Their sum must not exceed snapshot capacity. actual_diners counts people served;
  shortage_count counts additional people unable to be served. They may exceed
  planned_diners within capacity; this is an outcome, not a validation failure.
- dishes: exactly one entry per recipe_id in the saved forecast, no extras or duplicates.
  Names and ingredient data come from the snapshot, not current recipes.
- prepared_kg, unserved_kg, plate_waste_kg: COOKED edible-food kilograms, numeric
  0–10000, max three decimal places. unserved + plate_waste <= prepared for each dish.
- measurement_method: enum `weighed` or `estimated`, applies to all three weights
  in that dish row. Do not mix methods within one row.
- If actual_diners = 0, plate_waste_kg must be 0 in every dish; prepared/unserved
  weights may still be nonzero. Waste-per-diner is null.
- notes: string, trim whitespace, max 1000 chars; empty string permitted.

200 response is the **Result** object (not a Plan wrapper):

```json
{
  "plan_id": "0e61778c-57fb-4dc8-b33f-0e46baa33afe",
  "actual_diners": 150,
  "shortage_count": 2,
  "dishes": [
    {
      "recipe_id": "rice",
      "prepared_kg": 40,
      "unserved_kg": 2,
      "plate_waste_kg": 1,
      "measurement_method": "weighed"
    }
  ],
  "notes": "Illustrative demonstration measurements.",
  "updated_at": "2026-10-23T08:30:00Z"
}
```

Types match the request, plus string plan_id and updated_at. Sort dishes by recipe_id.
On successful PUT, frontend refreshes GET /plans and GET /insights. A failed PUT
must leave the previous result intact and preserve frontend form inputs.
Errors: 404 unknown plan; 422 invalid fields or future date; service errors.

For this completed plan, GET /plans returns status completed, result equal to the
object above, and **Metrics**:

```json
{
  "total_prepared_kg": 40,
  "total_unserved_kg": 2,
  "total_plate_waste_kg": 1,
  "total_waste_kg": 3,
  "waste_per_diner_g": 20,
  "forecast_error_diners": 30,
  "has_estimated_measurements": false
}
```

Metrics fields: nonnegative numbers (kilograms 3 decimals; grams/error 2 decimals),
except waste_per_diner_g may be null and has_estimated_measurements is boolean.
total_waste_kg = sum(unserved_kg + plate_waste_kg).
waste_per_diner_g = total_waste_kg * 1000 / actual_diners, null when zero.
forecast_error_diners = abs(original unrounded baseline - actual_diners).
It intentionally excludes manager adjustment/buffer; call it “Baseline forecast
error” in the UI. With shortages, served counts can understate true demand: display
shortages alongside the error rather than claiming this is full demand accuracy.
has_estimated_measurements is true if any row is estimated.
No cooked-vs-raw yield comparison is implied.

## 10. GET /api/insights

No body. Aggregate over ALL completed plans only. 200 example after the single
result above:

```json
{
  "completed_meals": 1,
  "total_actual_diners": 150,
  "total_shortage_count": 2,
  "total_prepared_kg": 40,
  "total_unserved_kg": 2,
  "total_plate_waste_kg": 1,
  "total_waste_kg": 3,
  "waste_per_diner_g": 20,
  "mean_forecast_error_diners": 30,
  "meals_with_estimated_measurements": 0,
  "demo_meals": 1
}
```

completed_meals, total_actual_diners, total_shortage_count,
meals_with_estimated_measurements and demo_meals are nonnegative integers.
Weights are nonnegative numbers (3 decimals); ratios/errors are numbers rounded
to 2 decimals or null as below.

- Sum underlying raw result values, not rounded per-meal metrics.
- waste_per_diner_g = total_waste_kg * 1000 / total_actual_diners.
  Never average individual meal ratios. Null if total_actual_diners = 0.
- mean_forecast_error_diners is the arithmetic mean of baseline absolute errors
  across completed meals, including zero-diner meals. Null if none completed.
- meals_with_estimated_measurements counts meals with at least one estimated row.
- demo_meals counts completed plans whose forecast.is_demo is true.
- Insights include both measured/estimated and demo/non-demo results, but expose
  these counts so the UI labels mixtures honestly. For v1 use a dedicated demo DB.

Empty dataset:

```json
{
  "completed_meals": 0,
  "total_actual_diners": 0,
  "total_shortage_count": 0,
  "total_prepared_kg": 0,
  "total_unserved_kg": 0,
  "total_plate_waste_kg": 0,
  "total_waste_kg": 0,
  "waste_per_diner_g": null,
  "mean_forecast_error_diners": null,
  "meals_with_estimated_measurements": 0,
  "demo_meals": 0
}
```

Errors: service errors only.

## 11. Integration and verification fixtures

Frontend fixture mode must implement these same response shapes and be explicitly
enabled with a visible banner. Never silently use fixtures when a real request fails.
Use a selected historical date for result-entry demos; do not bypass the future-date rule.

| Case | Required outcome |
| --- | --- |
| Baseline 180, adjustment -30, buffer 5, capacity 250 | planned 158; rice at 100 g gives 15.8 kg |
| Baseline 240, adjustment 20, buffer 10, capacity 250 | planned 250 |
| Baseline 10, adjustment -20, buffer 5 | planned 0; ingredient quantities 0 |
| No completed history, fallback 180 | method fallback, history_count 0 |
| Only one same-weekday meal | Use recent-meals selection, not just that weekday |
| Future/equal-date completed records present | Excluded from forecast |
| Preview created, then history/recipes edited | Saving keeps original snapshot |
| Same forecast saved twice | Same plan ID; second response 200 |
| Two forecasts for same date/type saved | Second distinct save 409 |
| Prepared 10, unserved 8, plate waste 3 | 422; no partial write |
| Result corrected twice | One result; totals reflect latest correction only |
| Two meals: 1 kg/10 diners and 9 kg/90 diners | Aggregate 100 g/diner |
| Zero total diners | waste_per_diner_g null |
| No completed meals | mean_forecast_error_diners null |
| Backend restarted from another directory | Same plans, previews and results |

Implementation owners add meaningful tests for calculations, schema validation,
snapshot immutability, idempotency, atomic corrections and database persistence.
