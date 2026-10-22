import { useEffect, useState } from "react";
import { api } from "../api";
import { Empty, ErrorBox } from "../components";
import type { Plan, ResultRequest } from "../types";
import { chronological, dateLabel, today } from "../utils";
function ResultForm({
  plan,
  onSaved,
}: {
  plan: Plan;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<ResultRequest>(
    plan.result
      ? {
          actual_diners: plan.result.actual_diners,
          shortage_count: plan.result.shortage_count,
          dishes: plan.result.dishes.map((d) => ({ ...d })),
          notes: plan.result.notes,
        }
      : {
          actual_diners: 0,
          shortage_count: 0,
          dishes: plan.forecast.dishes.map((d) => ({
            recipe_id: d.recipe_id,
            prepared_kg: 0,
            unserved_kg: 0,
            plate_waste_kg: 0,
            measurement_method: "weighed",
          })),
          notes: "",
        },
  );
  const [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const future = plan.forecast.date > today();
  function update(next: ResultRequest) {
    setForm(next);
    setSaved(false);
    setError(null);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const capacity = plan.forecast.hostel_capacity;
    if (form.actual_diners + form.shortage_count > capacity) {
      setError(
        new Error(
          `Diners served plus shortages cannot exceed capacity (${capacity}).`,
        ),
      );
      return;
    }
    for (const dish of form.dishes) {
      const name = plan.forecast.dishes.find(
        (d) => d.recipe_id === dish.recipe_id,
      )?.name;
      if (
        Math.round(dish.unserved_kg * 1000) +
          Math.round(dish.plate_waste_kg * 1000) >
        Math.round(dish.prepared_kg * 1000)
      ) {
        setError(
          new Error(
            `${name}: unserved food plus plate waste cannot exceed prepared food.`,
          ),
        );
        return;
      }
      if (form.actual_diners === 0 && dish.plate_waste_kg > 0) {
        setError(
          new Error(
            `${name}: plate waste must be zero when no diners were served.`,
          ),
        );
        return;
      }
    }
    setBusy(true);
    try {
      await api.saveResult(plan.id, { ...form, notes: form.notes.trim() });
      setSaved(true);
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="panel">
      <div className="section-title">
        <div>
          <h2 className="capitalize">
            {plan.forecast.meal_type} · {dateLabel(plan.forecast.date)}
          </h2>
          <p>
            Planned for {plan.forecast.planned_diners} diners · capacity{" "}
            {plan.forecast.hostel_capacity}
          </p>
        </div>
        <span className="badge">
          {plan.result ? "Correction" : "After service"}
        </span>
      </div>
      {future && (
        <div className="notice">
          Results can be entered on or after {dateLabel(plan.forecast.date)}{" "}
          (India time).
        </div>
      )}
      <fieldset disabled={busy || future}>
        <div className="form-grid">
          <label>
            Diners served
            <input
              required
              type="number"
              min="0"
              step="1"
              max={plan.forecast.hostel_capacity}
              value={Number.isNaN(form.actual_diners) ? "" : form.actual_diners}
              onChange={(e) =>
                update({ ...form, actual_diners: e.target.valueAsNumber })
              }
            />
          </label>
          <label>
            People unable to be served
            <input
              required
              type="number"
              min="0"
              step="1"
              max={plan.forecast.hostel_capacity}
              value={
                Number.isNaN(form.shortage_count) ? "" : form.shortage_count
              }
              onChange={(e) =>
                update({ ...form, shortage_count: e.target.valueAsNumber })
              }
            />
          </label>
        </div>
        <h3>Cooked food, in kilograms</h3>
        <p className="muted">
          Unserved food here means discarded edible food. Weigh food without its
          container.
        </p>
        {form.dishes.map((dish, i) => (
          <fieldset className="dish-result" key={dish.recipe_id}>
            <legend>
              {
                plan.forecast.dishes.find((d) => d.recipe_id === dish.recipe_id)
                  ?.name
              }
            </legend>
            <div className="weight-grid">
              {(["prepared_kg", "unserved_kg", "plate_waste_kg"] as const).map(
                (key, j) => (
                  <label key={key}>
                    {["Prepared (kg)", "Unserved (kg)", "Plate waste (kg)"][j]}
                    <input
                      required
                      type="number"
                      min="0"
                      max="10000"
                      step="0.001"
                      value={Number.isNaN(dish[key]) ? "" : dish[key]}
                      onChange={(e) =>
                        update({
                          ...form,
                          dishes: form.dishes.map((d, index) =>
                            index === i
                              ? { ...d, [key]: e.target.valueAsNumber }
                              : d,
                          ),
                        })
                      }
                    />
                  </label>
                ),
              )}
              <label>
                Measurement
                <select
                  value={dish.measurement_method}
                  onChange={(e) =>
                    update({
                      ...form,
                      dishes: form.dishes.map((d, index) =>
                        index === i
                          ? {
                              ...d,
                              measurement_method: e.target.value as
                                | "weighed"
                                | "estimated",
                            }
                          : d,
                      ),
                    })
                  }
                >
                  <option value="weighed">Weighed</option>
                  <option value="estimated">Estimated</option>
                </select>
              </label>
            </div>
          </fieldset>
        ))}
        <label>
          Notes <span className="muted">(optional)</span>
          <textarea
            maxLength={1000}
            rows={3}
            value={form.notes}
            placeholder="Anything that changed service today?"
            onChange={(e) => update({ ...form, notes: e.target.value })}
          />
        </label>
        <button className="primary" type="submit">
          {busy ? "Saving…" : plan.result ? "Update results" : "Save results"}
        </button>
      </fieldset>
      <ErrorBox error={error} />
      {saved && (
        <div className="notice success" role="status">
          Results saved. Dashboard and history have been refreshed.
        </div>
      )}
    </form>
  );
}
export default function Results({
  plans,
  onSaved,
  active,
}: {
  plans: Plan[];
  onSaved: () => Promise<void>;
  active: boolean;
}) {
  const sorted = [...plans].sort((a, b) => -chronological(a, b));
  const [selected, setSelected] = useState("");
  const plan =
    plans.find((p) => p.id === selected) ||
    sorted.find((p) => p.status === "planned" && p.forecast.date <= today()) ||
    sorted[0];
  useEffect(() => {
    if (active && !selected && plan) setSelected(plan.id);
  }, [selected, plan, active]);
  if (!plan)
    return (
      <section className="panel">
        <Empty title="Start with a meal plan">
          Save a plan first, then return here after service to record the
          outcome.
        </Empty>
      </section>
    );
  return (
    <>
      <label className="plan-select">
        Choose a saved meal
        <select value={plan.id} onChange={(e) => setSelected(e.target.value)}>
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {dateLabel(p.forecast.date)} · {p.forecast.meal_type} ·{" "}
              {p.status === "completed" ? "Edit results" : "Awaiting results"}
            </option>
          ))}
        </select>
      </label>
      <ResultForm key={plan.id} plan={plan} onSaved={onSaved} />
    </>
  );
}
