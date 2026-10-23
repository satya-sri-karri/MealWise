import { useState } from "react";
import { Empty, ForecastView, Stat } from "../components";
import type { Insights, Plan } from "../types";
import { chronological, dateLabel, number } from "../utils";
export default function History({
  plans,
  insights,
}: {
  plans: Plan[];
  insights: Insights;
}) {
  const [filter, setFilter] = useState("all");
  const visible = [...plans]
    .filter((p) => filter === "all" || p.status === filter)
    .sort((a, b) => -chronological(a, b));
  return (
    <>
      <div className="stats three">
        <Stat
          label="Baseline forecast error"
          value={number(insights.mean_forecast_error_diners, "diners")}
          caption="Average absolute baseline error"
        />
        <Stat
          label="Waste per diner"
          value={number(insights.waste_per_diner_g, "g")}
          caption="Complete waste records only"
        />
        <Stat
          label="Estimated measurements"
          value={number(insights.meals_with_estimated_measurements)}
          caption="Meals containing estimated weights"
        />
      </div>
      <p className="muted">
        Baseline error compares the original estimate with diners served. Read
        it alongside shortages; it does not measure all unmet demand.
      </p>
      {(insights.partial_waste_meals || 0) > 0 && (
        <div className="notice">
          {insights.partial_waste_meals} meals have unmeasured waste. They are
          excluded from waste-per-diner averages, not treated as zero.
        </div>
      )}
      <section className="panel">
        <div className="section-title">
          <h2>Meal history</h2>
          <label className="inline-label">
            Show
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All meals</option>
              <option value="planned">Awaiting results</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>
        {!visible.length ? (
          <Empty title="No meals to show">
            Your saved plans and completed results will appear here.
          </Empty>
        ) : (
          visible.map((p) => (
            <details className="history-item" key={p.id}>
              <summary>
                <span>
                  <strong className="capitalize">
                    {p.forecast.meal_type} · {dateLabel(p.forecast.date)}
                  </strong>
                  <small>
                    {p.forecast.dishes.map((d) => d.name).join(", ")}
                  </small>
                </span>
                <span className="badge">
                  {p.status === "completed" ? "Completed" : "Awaiting results"}
                </span>
                <span>
                  {p.result
                    ? `${p.result.actual_diners} served`
                    : `${p.forecast.planned_diners} planned`}
                </span>
                <span aria-hidden="true">⌄</span>
              </summary>
              <div className="history-detail">
                <div>
                  <h3>Saved cooking plan</h3>
                  <ForecastView forecast={p.forecast} />
                </div>
                <div>
                  <h3>Service outcome</h3>
                  {p.metrics?.waste_record_complete === false && (
                    <div className="notice">
                      Partial record · {p.metrics.recorded_dishes}/
                      {p.metrics.total_dishes} dishes logged.{" "}
                      {p.metrics.plate_waste_recorded
                        ? "Plate waste recorded."
                        : "Plate waste not recorded."}
                    </div>
                  )}
                  {p.result && p.metrics ? (
                    <>
                      <dl className="detail-list">
                        <div>
                          <dt>Diners served</dt>
                          <dd>{p.result.actual_diners}</dd>
                        </div>
                        <div>
                          <dt>People not served</dt>
                          <dd>{p.result.shortage_count}</dd>
                        </div>
                        <div>
                          <dt>Recorded waste</dt>
                          <dd>{number(p.metrics.total_waste_kg, "kg")}</dd>
                        </div>
                        <div>
                          <dt>Waste per diner</dt>
                          <dd>{number(p.metrics.waste_per_diner_g, "g")}</dd>
                        </div>
                        <div>
                          <dt>Baseline forecast error</dt>
                          <dd>
                            {number(p.metrics.forecast_error_diners, "diners")}
                          </dd>
                        </div>
                      </dl>
                      {p.result.dishes.map((d) => (
                        <div className="dish-summary" key={d.recipe_id}>
                          <b>
                            {
                              p.forecast.dishes.find(
                                (r) => r.recipe_id === d.recipe_id,
                              )?.name
                            }
                          </b>
                          <small>{d.measurement_method} · cooked food</small>
                          <p>
                            Prepared {number(d.prepared_kg, "kg")} · Unserved{" "}
                            {number(d.unserved_kg, "kg")} · Plate waste{" "}
                            {number(d.plate_waste_kg, "kg")}
                          </p>
                        </div>
                      ))}
                      <p>{p.result.notes || "No service notes."}</p>
                      {p.result.mixed_plate_waste_kg != null && (
                        <p>
                          Shared plate-waste bin:{" "}
                          {number(p.result.mixed_plate_waste_kg, "kg")}{" "}
                          (estimated)
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="muted">Results have not been recorded yet.</p>
                  )}
                  {p.forecast.is_demo && (
                    <span className="badge">Demo data</span>
                  )}
                </div>
              </div>
            </details>
          ))
        )}
      </section>
    </>
  );
}
