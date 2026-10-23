import { useEffect, useState } from "react";
import { api } from "../api";
import { Empty, ErrorBox } from "../components";
import type { DishResult, Plan, ResultRequest } from "../types";
import { chronological, dateLabel, number, today } from "../utils";
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
          mixed_plate_waste_kg: plan.result.mixed_plate_waste_kg ?? null,
        }
      : {
          actual_diners: NaN,
          shortage_count: 0,
          dishes: plan.forecast.dishes.map((d) => ({
            recipe_id: d.recipe_id,
            prepared_kg: null,
            unserved_kg: null,
            plate_waste_kg: null,
            measurement_method: "estimated",
            entry_unit: "kg",
            entry_amount: null,
          })),
          notes: "",
          mixed_plate_waste_kg: null,
        },
  );
  const [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const [editingAmounts, setEditingAmounts] = useState<Record<number, boolean>>({});
  const future = plan.forecast.date > today();
  function update(next: ResultRequest) {
    setForm(next);
    setSaved(false);
    setError(null);
  }
  function patch(i: number, changes: Partial<DishResult>) {
    update({
      ...form,
      dishes: form.dishes.map((d, n) => (n === i ? { ...d, ...changes } : d)),
    });
  }
  function convert(
    i: number,
    unit: "portion" | "container" | "kg",
    amount: number | null,
    keepInput = false,
  ) {
    setEditingAmounts((previous) => ({ ...previous, [i]: keepInput }));
    const source = plan.forecast.dishes.find(
      (d) => d.recipe_id === form.dishes[i].recipe_id,
    )!;
    const grams =
      unit === "portion" ? source.portion_weight_g : source.container_weight_g;
    patch(i, {
      entry_unit: amount === null && !keepInput ? "kg" : unit,
      entry_amount: amount,
      unserved_kg:
        amount === null
          ? null
          : unit === "kg"
            ? amount
            : Math.round((Math.round(amount * 1000) * Math.round((grams || 0) * 1000)) / 1_000_000) / 1000,
      measurement_method: "estimated",
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (
      form.actual_diners + form.shortage_count >
      plan.forecast.hostel_capacity
    ) {
      setError(
        new Error(
          "Diners served plus shortages cannot exceed hostel capacity.",
        ),
      );
      return;
    }
    for (const d of form.dishes) {
      if (
        d.prepared_kg !== null &&
        (d.unserved_kg ?? 0) + (d.plate_waste_kg ?? 0) >
          d.prepared_kg + 0.0000001
      ) {
        setError(
          new Error(
            "Recorded waste cannot exceed the prepared weight. Check the expanded dish details.",
          ),
        );
        return;
      }
      if (form.actual_diners === 0 && (d.plate_waste_kg ?? 0) > 0) {
        setError(
          new Error("Plate waste must be zero when no diners were served."),
        );
        return;
      }
    }
    if (form.actual_diners === 0 && (form.mixed_plate_waste_kg ?? 0) > 0) {
      setError(
        new Error("Plate waste must be zero when no diners were served."),
      );
      return;
    }
    setBusy(true);
    try {
      await api.saveResult(plan.id, { ...form, notes: form.notes.trim() });
      await onSaved();
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const recorded = form.dishes.filter((d) => d.unserved_kg !== null).length;
  const sharedBin =
    form.mixed_plate_waste_kg !== null &&
    form.mixed_plate_waste_kg !== undefined;
  return (
    <form className="panel" onSubmit={submit}>
      <div className="section-title">
        <div>
          <h2 className="capitalize">
            {plan.forecast.meal_type} · {dateLabel(plan.forecast.date)}
          </h2>
          <p>Planned for {plan.forecast.planned_diners} diners</p>
        </div>
        <span className="badge">Quick service log</span>
      </div>
      {future && (
        <div className="notice">
          Results open on {dateLabel(plan.forecast.date)} (India time).
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
              max={plan.forecast.hostel_capacity}
              step="1"
              value={Number.isNaN(form.actual_diners) ? "" : form.actual_diners}
              placeholder="How many ate?"
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
              max={plan.forecast.hostel_capacity}
              step="1"
              value={
                Number.isNaN(form.shortage_count) ? "" : form.shortage_count
              }
              onChange={(e) =>
                update({ ...form, shortage_count: e.target.valueAsNumber })
              }
            />
          </label>
        </div>
        <div className="section-title">
          <div>
            <h3>What was left and discarded?</h3>
            <p>
              Skip what you did not record. Do not count food kept for later.
            </p>
          </div>
          <span className="badge">
            {recorded}/{form.dishes.length} dishes recorded
          </span>
        </div>
        {form.dishes.map((dish, i) => {
          const source = plan.forecast.dishes.find(
            (d) => d.recipe_id === dish.recipe_id,
          )!;
          const unit = dish.entry_unit || "kg";
          const amount = unit === "kg" ? dish.unserved_kg : dish.entry_amount;
          return (
            <fieldset className="quick-dish" key={dish.recipe_id}>
              <legend>{source.name}</legend>
              <div className="quick-actions">
                <button
                  type="button"
                  className={
                    dish.unserved_kg === null && !editingAmounts[i] ? "selected-chip" : "secondary"
                  }
                  onClick={() => convert(i, "kg", null)}
                >
                  Not recorded
                </button>
                <button
                  type="button"
                  className={
                    dish.unserved_kg === 0 ? "selected-chip" : "secondary"
                  }
                  onClick={() => convert(i, "kg", 0)}
                >
                  None discarded
                </button>
                <button
                  type="button"
                  className={
                    (dish.unserved_kg ?? 0) > 0 ? "selected-chip" : "secondary"
                  }
                  onClick={() =>
                    convert(i, source.portion_weight_g ? "portion" : "kg", 1)
                  }
                >
                  Some discarded
                </button>
              </div>
              {(dish.unserved_kg !== null || editingAmounts[i]) && (
                <div className="quick-quantity">
                  <label>
                    Quantity
                    <input
                      aria-label={`${source.name} leftover quantity`}
                      required
                      min="0"
                      max="10000"
                      step="0.001"
                      type="number"
                      value={amount ?? ""}
                      onChange={(e) =>
                        convert(
                          i,
                          unit,
                          e.target.value === "" ? null : e.target.valueAsNumber,
                          true,
                        )
                      }
                    />
                  </label>
                  <label>
                    Unit
                    <select
                      aria-label={`${source.name} leftover unit`}
                      value={unit}
                      onChange={(e) =>
                        convert(i, e.target.value as typeof unit, amount ?? 0)
                      }
                    >
                      <option value="kg">Kilograms</option>
                      {source.portion_weight_g && (
                        <option value="portion">
                          {source.portion_label || "serving"}s
                        </option>
                      )}
                      {source.container_weight_g && (
                        <option value="container">
                          {source.container_label || "container"}s
                        </option>
                      )}
                    </select>
                  </label>
                  <span className="conversion">
                    {unit === "kg"
                      ? "Weighed or estimated"
                      : `≈ ${number(dish.unserved_kg, "kg")}`}
                    <small>
                      {unit === "kg"
                        ? "Set the method below."
                        : `1 ${unit === "portion" ? source.portion_label : source.container_label} ≈ ${unit === "portion" ? source.portion_weight_g : source.container_weight_g} g`}
                    </small>
                  </span>
                </div>
              )}
              <details className="measurement-details">
                <summary>
                  More detail <span className="muted">· optional weights</span>
                </summary>
                <div className="form-grid">
                  <label>
                    Prepared food (kg)
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="0.001"
                      value={dish.prepared_kg ?? ""}
                      placeholder="Not recorded"
                      onChange={(e) =>
                        patch(i, {
                          prepared_kg:
                            e.target.value === ""
                              ? null
                              : e.target.valueAsNumber,
                        })
                      }
                    />
                  </label>
                  <label>
                    Dish plate waste (kg)
                    <input
                      disabled={sharedBin}
                      type="number"
                      min="0"
                      max="10000"
                      step="0.001"
                      value={dish.plate_waste_kg ?? ""}
                      placeholder="Not recorded"
                      onChange={(e) =>
                        patch(i, {
                          plate_waste_kg:
                            e.target.value === ""
                              ? null
                              : e.target.valueAsNumber,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Measurement method
                  <select
                    aria-label={`${source.name} measurement method`}
                    value={dish.measurement_method}
                    disabled={unit !== "kg"}
                    onChange={(e) =>
                      patch(i, {
                        measurement_method: e.target.value as
                          | "weighed"
                          | "estimated",
                      })
                    }
                  >
                    <option value="estimated">Estimated</option>
                    <option value="weighed">Weighed</option>
                  </select>
                </label>
              </details>
            </fieldset>
          );
        })}
        <section className="bin-entry">
          <h3>One shared plate-waste bin</h3>
          <p>
            Mixed plate waste does not need sorting by dish. Enter the net food
            weight or an estimate once.
          </p>
          <label>
            Shared plate waste (kg, optional)
            <input
              type="number"
              min="0"
              max="10000"
              step="0.001"
              value={form.mixed_plate_waste_kg ?? ""}
              placeholder="Not recorded"
              onChange={(e) => {
                const value =
                  e.target.value === "" ? null : e.target.valueAsNumber;
                update({
                  ...form,
                  mixed_plate_waste_kg: value,
                  dishes:
                    value === null
                      ? form.dishes
                      : form.dishes.map((d) => ({
                          ...d,
                          plate_waste_kg: null,
                        })),
                });
              }}
            />
          </label>
          <small className="muted">
            Stored as estimated. Entering a shared total replaces individual
            dish plate-waste values to prevent double counting.
          </small>
        </section>
        <label>
          Service notes
          <textarea
            rows={2}
            maxLength={1000}
            value={form.notes}
            onChange={(e) => update({ ...form, notes: e.target.value })}
            placeholder="e.g. Students preferred chapati today"
          />
        </label>
        <p className="coverage-note">
          Unmeasured quantities stay unknown. Waste per diner appears only when
          all dishes and plate waste are recorded.
        </p>
        <button className="primary" type="submit">
          {busy ? "Saving…" : plan.result ? "Update results" : "Save results"}
        </button>
      </fieldset>
      <ErrorBox error={error} />
      {saved && (
        <div className="notice success" role="status">
          Results saved. Your kitchen overview is updated.
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
          Save a plan first, then record the outcome here after service.
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
