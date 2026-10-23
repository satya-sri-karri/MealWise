# Kitchen workflow v2

This additive update supersedes the recipe and result restrictions in API_CONTRACT.md v1.
Forecast selection, capacity limits, date rules, immutable plans, duplicate prevention,
error envelope, and existing endpoint URLs remain as documented in v1.

## Kitchen experience

- Menu Library starts with 22 illustrative dishes. Search, add, edit, or archive dishes.
- Recipes can have no ingredient allowances: planning still tracks attendance and the
  menu, but the UI explicitly identifies missing raw-ingredient quantities.
- Meal planning offers breakfast/lunch/dinner suggestions, menu shortcuts, and reuse
  of a previous meal's menu. At most 20 dishes may be selected for one meal.
- Results require attendance and shortages. Staff may leave every weight unrecorded.
  They can select “none discarded” explicitly, estimate portions, or use a configured
  container. Prepared weights are optional. Retained food is not counted as waste.
- Mixed plate waste can be recorded once for the whole meal; staff need not sort it.
- Serving/container conversion is an estimate. Calibrate a typical portion or the net
  contents of a full vessel once per dish; do not equate a litre with a kilogram.
- Existing saved forecasts retain their original recipes and conversion sizes.
  Older forecasts without conversion data continue to support optional kg entry.

## Recipe schema and endpoints

GET /api/recipes returns settings plus all recipes, including archived recipes.
Each recipe adds category, meal_types, portion_label, portion_weight_g,
container_label, container_weight_g, active. Legacy starter records receive defaults.

POST /api/recipes (201) creates a generated UUID recipe. PUT /api/recipes/{id} (200)
replaces its editable fields and preserves its ID. Bodies exclude id:

```json
{
  "name": "Pesarattu",
  "category": "Breakfast",
  "meal_types": ["breakfast"],
  "portion_label": "piece",
  "portion_weight_g": 100,
  "container_label": "tray",
  "container_weight_g": 2000,
  "active": true,
  "ingredients": []
}
```

Both return the full recipe including id. category is one of Breakfast, Rice & breads,
Dal & curries, Sides, Drinks, Other. meal_types is a nonempty unique subset of the v1
meal enum. Names/labels use 1–100 trimmed characters. Conversion weights are null or
positive JSON numbers up to 100000 grams with up to three decimals. Ingredients use
v1 fields and validation, now allow 0–30 unique IDs, and shared IDs must share names.
Duplicate names return 409 RECIPE_ALREADY_EXISTS; unknown edit IDs return 404;
invalid values return 422. Archived IDs are rejected by new forecasts, but saved
plans containing them still accept results. A new RecipeRow table holds JSON overrides
in the same SQLite database; schema creation is additive and existing data is retained.
Starter recipes are defaults; persistent edits take priority.

Forecast dish snapshots add portion_label, portion_weight_g, container_label,
container_weight_g. Missing conversion weights mean the corresponding quick unit
cannot be used. Ingredient totals cover only configured recipes; never invent quantities.

## Result changes

prepared_kg, unserved_kg, plate_waste_kg are each nullable. Null means unknown,
never zero. Keep exactly one dish entry for each saved recipe, including unknown rows.
Each dish optionally adds entry_unit (kg/portion/container; default kg) and entry_amount
(nullable number 0–10000 with up to three decimals). For portion/container entry, amount
is required, the saved conversion must exist, unserved_kg must equal amount * saved
weight / 1000 rounded half-up to three decimals, and measurement_method must be estimated.

At meal level, mixed_plate_waste_kg is optional/null or 0–10000 with up to three
decimals. It is conservatively treated as estimated. It cannot coexist with ANY
non-null individual plate_waste_kg, including explicit zero, to prevent double counting.
When actual_diners is zero, positive plate waste is invalid. A supplied prepared weight
must be at least the sum of known per-dish waste. It is not required for quick logging.

Example: three servings of a dish whose saved portion is 200 g, no prepared weight,
and one common plate-waste total:

```json
{
  "actual_diners": 150,
  "shortage_count": 0,
  "dishes": [{
    "recipe_id": "rice",
    "prepared_kg": null,
    "unserved_kg": 0.6,
    "plate_waste_kg": null,
    "measurement_method": "estimated",
    "entry_unit": "portion",
    "entry_amount": 3
  }],
  "mixed_plate_waste_kg": 1.4,
  "notes": "Approximate quantities after service."
}
```

The existing Result response adds entry metadata and mixed_plate_waste_kg.
Legacy result JSON remains readable and editable; new PUTs normalize it.

## Honest metrics

Recorded totals sum known observations only; incomplete records are explicitly labeled.
Per-plan Metrics adds recorded_dishes, total_dishes, plate_waste_recorded,
waste_record_complete. A complete waste record has non-null discarded leftovers for
every dish AND either a shared plate total or non-null plate waste for every dish.
Prepared-food measurement is not needed for completeness.

Waste per diner is null for incomplete or zero-diner meals. Aggregate insights use
ONLY complete meals' waste and diners for that ratio. Partial meals do not dilute it.
Attendance/shortages and recorded waste totals still include partial meals.

Insights adds complete_waste_meals, partial_waste_meals, complete_waste_diners and
dish_leftovers (recipe_id, name, recorded_meals, unserved_kg), ordered by recorded
leftovers descending. The dashboard displays these as inspection priorities, not proof
that a dish is unpopular or that reducing its portions will be safe. Shared plate waste
is included once in totals and is not attributed to an individual dish.

## Verification

Backend regression tests cover the original workflow plus recipe persistence,
archive/snapshot behavior, partial-data denominators, shared bins, conversion validation,
and unknown conversion rejection. Frontend browser checks cover custom menus, quick
logging, corrections, persistence, duplicate/error handling, keyboard and phone layouts.

Verified on 23 October 2026: 48 backend tests, 14 desktop/mobile browser tests,
and the TypeScript/production build passed. A real FastAPI + SQLite browser check
covered custom-dish persistence, a saved forecast, half-tray conversion, optional
prepared weight, shared plate waste, and reload persistence through the port 8001 proxy.
