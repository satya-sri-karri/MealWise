import { useState } from "react";
import { api } from "../api";
import { Empty, ErrorBox, ForecastView } from "../components";
import type { Catalog, Forecast, ForecastRequest, Plan } from "../types";
import { today } from "../utils";
export default function Planner({
  catalog,
  onSaved,
  plans,
  openMenu,
}: {
  catalog: Catalog;
  plans: Plan[];
  openMenu: () => void;
  onSaved: () => Promise<void>;
}) {
  const { settings, recipes } = catalog;
  const [form, setForm] = useState<ForecastRequest>({
    date: today(),
    meal_type: "lunch",
    recipe_ids: recipes
      .filter(
        (r) =>
          ["rice", "dal", "vegetable-curry"].includes(r.id) &&
          r.active !== false,
      )
      .map((r) => r.id),
    fallback_diners: settings.default_fallback_diners,
    adjustment: 0,
    adjustment_reason: "",
    buffer_percent: settings.default_buffer_percent,
  });
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const available = recipes.filter((r) => r.active !== false);
  const matching = available.filter(
    (r) =>
      (showAll ||
        !r.meal_types ||
        r.meal_types.includes(form.meal_type) ||
        form.recipe_ids.includes(r.id)) &&
      r.name.toLowerCase().includes(search.toLowerCase()),
  );
  const last = [...plans]
    .filter((p) => p.forecast.meal_type === form.meal_type)
    .sort((a, b) => b.forecast.date.localeCompare(a.forecast.date))[0];
  const presets =
    form.meal_type === "breakfast"
      ? [
          ["Idli breakfast", ["idli", "sambar", "chutney"]],
          ["Dosa breakfast", ["dosa", "chutney", "sambar"]],
        ]
      : [
          ["Rice meal", ["rice", "dal", "vegetable-curry", "curd"]],
          ["Chapati meal", ["chapati", "dal", "vegetable-curry"]],
        ];
  const [forecast, setForecast] = useState<Forecast | null>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  function change<K extends keyof ForecastRequest>(
    key: K,
    value: ForecastRequest[K],
  ) {
    setForm({ ...form, [key]: value });
    setForecast(null);
    setSaved(false);
    setError(null);
  }
  async function preview(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    setForecast(null);
    try {
      if (!form.recipe_ids.length) throw new Error("Select at least one dish.");
      setForecast(
        await api.forecast({
          ...form,
          adjustment_reason: form.adjustment_reason.trim(),
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!forecast) return;
    setBusy(true);
    setError(null);
    try {
      await api.savePlan(forecast.forecast_id);
      setSaved(true);
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="split">
      <section className="panel">
        <div className="section-title">
          <span className="step">01</span>
          <div>
            <h2>Set the table</h2>
            <p>A few details for your next meal.</p>
          </div>
        </div>
        <form onSubmit={preview}>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label>
                Meal date
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(e) => change("date", e.target.value)}
                />
              </label>
              <label>
                Meal
                <select
                  aria-label="Meal"
                  value={form.meal_type}
                  onChange={(e) =>
                    change(
                      "meal_type",
                      e.target.value as ForecastRequest["meal_type"],
                    )
                  }
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                </select>
              </label>
            </div>
            <div className="menu-shortcuts">
              <span className="muted">Start with a menu</span>
              {presets.map(([label, ids]) => (
                <button
                  type="button"
                  className="secondary"
                  key={String(label)}
                  onClick={() =>
                    change(
                      "recipe_ids",
                      (ids as string[]).filter((id) =>
                        available.some((r) => r.id === id),
                      ),
                    )
                  }
                >
                  {label}
                </button>
              ))}
              {last && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    change(
                      "recipe_ids",
                      last.forecast.recipe_ids.filter((id) =>
                        available.some((r) => r.id === id),
                      ),
                    )
                  }
                >
                  Repeat last {form.meal_type}
                </button>
              )}
            </div>
            <div className="planner-search">
              <label>
                Find a dish
                <input
                  type="search"
                  value={search}
                  placeholder="Search your menu…"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button type="button" className="text-button" onClick={openMenu}>
                + Add / edit dishes
              </button>
            </div>
            <fieldset className="dish-picker">
              <legend>What's on the menu?</legend>
              {matching.map((r) => (
                <label className="check" key={r.id}>
                  <input
                    type="checkbox"
                    checked={form.recipe_ids.includes(r.id)}
                    onChange={(e) =>
                      change(
                        "recipe_ids",
                        e.target.checked
                          ? [...form.recipe_ids, r.id].slice(0, 20)
                          : form.recipe_ids.filter((id) => id !== r.id),
                      )
                    }
                  />
                  <span>{r.name}</span>
                </label>
              ))}
            </fieldset>
            <div className="selection-bar">
              <span>{form.recipe_ids.length} selected · max 20</span>
              <button
                type="button"
                className="text-button"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show this meal" : "Browse all dishes"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => change("recipe_ids", [])}
              >
                Clear selection
              </button>
            </div>
            <div className="selected-menu" aria-label="Selected dishes">
              {form.recipe_ids.map((id) => (
                <button
                  type="button"
                  className="selected-chip"
                  key={id}
                  onClick={() =>
                    change(
                      "recipe_ids",
                      form.recipe_ids.filter((x) => x !== id),
                    )
                  }
                >
                  {recipes.find((r) => r.id === id)?.name || id} ×
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Fallback attendance
                <input
                  required
                  type="number"
                  min="0"
                  max={settings.hostel_capacity}
                  step="1"
                  value={
                    Number.isNaN(form.fallback_diners)
                      ? ""
                      : form.fallback_diners
                  }
                  onChange={(e) =>
                    change("fallback_diners", e.target.valueAsNumber)
                  }
                />
                <small>Used only when there is no meal history.</small>
              </label>
              <label>
                Planning buffer (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="30"
                  step="0.01"
                  value={
                    Number.isNaN(form.buffer_percent) ? "" : form.buffer_percent
                  }
                  onChange={(e) =>
                    change("buffer_percent", e.target.valueAsNumber)
                  }
                />
                <small>Extra portions, capped at hostel capacity.</small>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Attendance adjustment
                <input
                  required
                  type="number"
                  min={-settings.hostel_capacity}
                  max={settings.hostel_capacity}
                  step="1"
                  value={Number.isNaN(form.adjustment) ? "" : form.adjustment}
                  onChange={(e) => change("adjustment", e.target.valueAsNumber)}
                />
                <small>Use a negative number for fewer diners.</small>
              </label>
              <label>
                Reason for adjustment
                <input
                  required={form.adjustment !== 0}
                  maxLength={300}
                  value={form.adjustment_reason}
                  placeholder="e.g. Off-campus event"
                  onChange={(e) => change("adjustment_reason", e.target.value)}
                />
              </label>
            </div>
            <button className="primary" type="submit">
              {busy ? "Please wait…" : "Generate meal plan"}{" "}
              <span aria-hidden="true">→</span>
            </button>
          </fieldset>
        </form>
        <ErrorBox error={error} />
      </section>
      <section className="panel preview" aria-live="polite">
        <div className="section-title">
          <span className="step">02</span>
          <div>
            <h2>Your cooking plan</h2>
            <p>Review quantities before saving.</p>
          </div>
        </div>
        {forecast ? (
          <>
            <ForecastView forecast={forecast} />
            {saved ? (
              <div className="notice success" role="status">
                Meal plan saved. Find it in Record Results after service.
              </div>
            ) : (
              <button className="primary full" disabled={busy} onClick={save}>
                Save meal plan
              </button>
            )}
          </>
        ) : (
          <Empty title="A little planning. Less guessing.">
            Choose your dishes and generate a plan to see attendance and
            ingredient quantities here.
          </Empty>
        )}
      </section>
    </div>
  );
}
