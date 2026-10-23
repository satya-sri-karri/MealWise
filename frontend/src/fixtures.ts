// Explicit browser-only demonstration adapter. Never imported in real API mode.
import { ApiError } from "./api";
import type {
  Catalog,
  Recipe,
  Forecast,
  ForecastRequest,
  Insights,
  Metrics,
  Plan,
  ResultRequest,
} from "./types";
import { chronological, today } from "./utils";
import starters from "./data/starter-recipes.json";
const key = "mealwise-fixtures-v2";
const catalog: Catalog = {
  settings: {
    hostel_capacity: 250,
    default_fallback_diners: 180,
    default_buffer_percent: 5,
    timezone: "Asia/Kolkata",
    is_demo: true,
  },
  recipes: starters as Recipe[],
};
interface State {
  recipes: Recipe[];
  plans: Plan[];
  forecasts: Record<string, Forecast>;
}
const round = (n: number, d = 3) => Number(n.toFixed(d));
function forecast(input: ForecastRequest, plans: Plan[]): Forecast {
  const history = plans
    .filter(
      (p) =>
        p.result &&
        p.forecast.meal_type === input.meal_type &&
        p.forecast.date < input.date,
    )
    .sort((a, b) => -chronological(a, b));
  const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
  const same = history
    .filter((p) => weekday(p.forecast.date) === weekday(input.date))
    .slice(0, 4);
  const used = same.length >= 2 ? same : history.slice(0, 7);
  const base = used.length
    ? used.reduce((s, p) => s + p.result!.actual_diners, 0) / used.length
    : input.fallback_diners;
  const adjusted = Math.max(0, base + input.adjustment),
    planned = Math.min(
      250,
      Math.ceil(adjusted * (1 + input.buffer_percent / 100)),
    );
  const dishes = catalog.recipes
    .filter((r) => input.recipe_ids.includes(r.id))
    .map((r) => ({
      recipe_id: r.id,
      name: r.name,
      portion_label: r.portion_label,
      portion_weight_g: r.portion_weight_g,
      container_label: r.container_label,
      container_weight_g: r.container_weight_g,
      ingredients: r.ingredients.map((i) => ({
        ...i,
        quantity_kg: round((planned * i.grams_per_diner) / 1000),
      })),
    }));
  const combined = new Map<
    string,
    { ingredient_id: string; name: string; quantity_kg: number }
  >();
  for (const d of dishes)
    for (const i of d.ingredients) {
      const old = combined.get(i.ingredient_id);
      combined.set(i.ingredient_id, {
        ingredient_id: i.ingredient_id,
        name: i.name,
        quantity_kg: round((old?.quantity_kg || 0) + i.quantity_kg),
      });
    }
  return {
    ...input,
    forecast_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    hostel_capacity: 250,
    estimated_diners: round(base, 2),
    adjusted_diners: round(adjusted, 2),
    planned_diners: planned,
    method: used.length
      ? same.length >= 2
        ? "same_weekday"
        : "recent_meals"
      : "fallback",
    history_count: used.length,
    history_plan_ids: used.map((p) => p.id),
    explanation: `${used.length ? `Average of ${used.length} previous ${input.meal_type} meals` : `No history; fallback ${base}`}. Adjustment ${input.adjustment}; buffer ${input.buffer_percent}%; planned ${planned} (capacity 250).`,
    is_demo: true,
    dishes,
    ingredients: [...combined.values()].sort((a, b) =>
      a.ingredient_id.localeCompare(b.ingredient_id),
    ),
  };
}
function metrics(plan: Plan): Metrics {
  const r = plan.result!;
  const sum = (field: "prepared_kg" | "unserved_kg" | "plate_waste_kg") =>
    round(r.dishes.reduce((s, d) => s + (d[field] ?? 0), 0));
  const plates = round(sum("plate_waste_kg") + (r.mixed_plate_waste_kg ?? 0));
  const recorded = r.dishes.filter((d) => d.unserved_kg !== null).length;
  const plateRecorded =
    r.mixed_plate_waste_kg != null ||
    r.dishes.every((d) => d.plate_waste_kg !== null);
  const complete = recorded === r.dishes.length && plateRecorded;
  const waste = round(sum("unserved_kg") + plates);
  return {
    total_prepared_kg: sum("prepared_kg"),
    total_unserved_kg: sum("unserved_kg"),
    total_plate_waste_kg: plates,
    total_waste_kg: waste,
    recorded_dishes: recorded,
    total_dishes: r.dishes.length,
    plate_waste_recorded: plateRecorded,
    waste_record_complete: complete,
    waste_per_diner_g:
      r.actual_diners && complete
        ? round((waste * 1000) / r.actual_diners, 2)
        : null,
    forecast_error_diners: round(
      Math.abs(plan.forecast.estimated_diners - r.actual_diners),
      2,
    ),
    has_estimated_measurements: r.dishes.some(
      (d) => d.measurement_method === "estimated",
    ),
  };
}
function seed(): State {
  const state: State = {
    plans: [],
    forecasts: {},
    recipes: structuredClone(catalog.recipes),
  };
  for (let n = 7; n >= 1; n--) {
    const d = new Date(`${today()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    const f = forecast(
      {
        date: d.toISOString().slice(0, 10),
        meal_type: "lunch",
        recipe_ids: ["rice", "dal", "vegetable-curry"],
        fallback_diners: 180,
        adjustment: 0,
        adjustment_reason: "",
        buffer_percent: 5,
      },
      state.plans,
    );
    const p: Plan = {
      id: crypto.randomUUID(),
      created_at: f.created_at,
      status: "completed",
      forecast: f,
      result: null,
      metrics: null,
    };
    p.result = {
      plan_id: p.id,
      actual_diners: 170 + (n % 3) * 8,
      shortage_count: n === 3 ? 2 : 0,
      dishes: f.dishes.map((dish, i) => ({
        recipe_id: dish.recipe_id,
        prepared_kg: [18, 42, 22][i],
        unserved_kg: round(0.6 + n * 0.12),
        plate_waste_kg: round(0.2 + n * 0.04),
        measurement_method: n === 2 ? "estimated" : "weighed",
      })),
      notes: "Fictional sample meal for interface demonstration.",
      updated_at: f.created_at,
    };
    p.metrics = metrics(p);
    state.plans.push(p);
    state.forecasts[f.forecast_id] = f;
  }
  return state;
}
function read(): State {
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw) as State;
  const state = seed();
  write(state);
  return state;
}
function write(state: State) {
  localStorage.setItem(key, JSON.stringify(state));
}
function insights(plans: Plan[]): Insights {
  const completed = plans.filter((p) => p.result && p.metrics);
  const sum = (field: keyof Metrics) =>
    round(completed.reduce((s, p) => s + Number(p.metrics![field]), 0));
  const full = completed.filter(
    (p) => p.metrics!.waste_record_complete !== false,
  );
  const completeDiners = full.reduce((s, p) => s + p.result!.actual_diners, 0);
  const completeWaste = full.reduce((s, p) => s + p.metrics!.total_waste_kg, 0);
  const diners = completed.reduce((s, p) => s + p.result!.actual_diners, 0);
  return {
    completed_meals: completed.length,
    total_actual_diners: diners,
    total_shortage_count: completed.reduce(
      (s, p) => s + p.result!.shortage_count,
      0,
    ),
    total_prepared_kg: sum("total_prepared_kg"),
    total_unserved_kg: sum("total_unserved_kg"),
    total_plate_waste_kg: sum("total_plate_waste_kg"),
    total_waste_kg: sum("total_waste_kg"),
    complete_waste_meals: full.length,
    partial_waste_meals: completed.length - full.length,
    complete_waste_diners: completeDiners,
    waste_per_diner_g: completeDiners
      ? round((completeWaste * 1000) / completeDiners, 2)
      : null,
    mean_forecast_error_diners: completed.length
      ? round(sum("forecast_error_diners") / completed.length, 2)
      : null,
    meals_with_estimated_measurements: completed.filter(
      (p) => p.metrics!.has_estimated_measurements,
    ).length,
    demo_meals: completed.length,
  };
}
export async function fixtureRequest(
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  const state = read();
  catalog.recipes = state.recipes;
  if (
    (path === "/recipes" && method === "POST") ||
    (path.startsWith("/recipes/") && method === "PUT")
  ) {
    const id = method === "POST" ? crypto.randomUUID() : path.split("/")[2];
    const data = { ...(body as Omit<Recipe, "id">), id };
    if (
      state.recipes.some(
        (r) => r.id !== id && r.name.toLowerCase() === data.name.toLowerCase(),
      )
    )
      throw new ApiError("A dish with this name already exists.", [], 409);
    state.recipes = [...state.recipes.filter((r) => r.id !== id), data];
    write(state);
    return data;
  }
  if (path === "/health")
    return { status: "ok", api_version: "1", database: "ok" };
  if (path === "/recipes" && method === "GET") return structuredClone(catalog);
  if (path === "/insights") return insights(state.plans);
  if (path === "/plans" && method === "GET")
    return {
      plans: structuredClone(state.plans).sort((a, b) => -chronological(a, b)),
    };
  if (path === "/forecast" && method === "POST") {
    const f = forecast(body as ForecastRequest, state.plans);
    state.forecasts[f.forecast_id] = f;
    write(state);
    return f;
  }
  if (path === "/plans" && method === "POST") {
    const id = (body as { forecast_id: string }).forecast_id;
    const existing = state.plans.find((p) => p.forecast.forecast_id === id);
    if (existing) return existing;
    const f = state.forecasts[id];
    if (!f) throw new ApiError("Forecast not found.", [], 404);
    if (
      state.plans.some(
        (p) =>
          p.forecast.date === f.date && p.forecast.meal_type === f.meal_type,
      )
    )
      throw new ApiError(
        `A ${f.meal_type} plan already exists for ${f.date}.`,
        [],
        409,
      );
    const p: Plan = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      status: "planned",
      forecast: f,
      result: null,
      metrics: null,
    };
    state.plans.push(p);
    write(state);
    return p;
  }
  if (
    path.startsWith("/plans/") &&
    path.endsWith("/result") &&
    method === "PUT"
  ) {
    const p = state.plans.find((p) => p.id === path.split("/")[2]);
    if (!p) throw new ApiError("Meal plan not found.", [], 404);
    if (p.forecast.date > today())
      throw new ApiError(
        "Results cannot be recorded for a future date.",
        [],
        422,
      );
    const input = body as ResultRequest;
    p.result = {
      ...input,
      plan_id: p.id,
      updated_at: new Date().toISOString(),
    };
    p.status = "completed";
    p.metrics = metrics(p);
    write(state);
    return p.result;
  }
  throw new ApiError("Unsupported fixture request.", [], 404);
}
