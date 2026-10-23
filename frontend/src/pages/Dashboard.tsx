import { Empty, Stat } from "../components";
import type { Insights, Plan } from "../types";
import { chronological, dateLabel, number, today } from "../utils";
export default function Dashboard({
  plans,
  insights,
  navigate,
}: {
  plans: Plan[];
  insights: Insights;
  navigate: (page: "plan" | "results" | "history") => void;
}) {
  const next = [...plans]
    .filter((p) => p.status === "planned" && p.forecast.date >= today())
    .sort(chronological)[0];
  const recent = [...plans]
    .filter((p) => p.status === "completed")
    .sort((a, b) => -chronological(a, b));
  const latest = recent[0];
  return (
    <>
      <div className="action-strip">
        <div>
          <b>
            {
              plans.filter(
                (p) => p.status === "planned" && p.forecast.date <= today(),
              ).length
            }{" "}
            meals waiting for results
          </b>
          <span>Log attendance and leftovers in a few quick entries.</span>
        </div>
        <button className="primary" onClick={() => navigate("results")}>
          Log a meal →
        </button>
      </div>
      <section className="hero">
        <div>
          <span className="eyebrow">THOUGHTFUL MEALS, EVERY DAY</span>
          <h2>
            Good food.
            <br />
            Better planning.
          </h2>
          <p>
            A clearer picture of what to cook,
            <br />
            and what comes back.
          </p>
          <button className="light-button" onClick={() => navigate("plan")}>
            Plan a meal <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="plate" aria-hidden="true">
          <div className="food rice"></div>
          <div className="food dal"></div>
          <div className="food greens"></div>
          <span className="plate-leaf">✳</span>
        </div>
      </section>
      <div className="stats">
        <Stat
          label="Meals recorded"
          value={number(insights.completed_meals)}
          caption="Completed meals in your history"
        />
        <Stat
          label="Recorded waste"
          value={number(insights.total_waste_kg, "kg")}
          caption="Unserved food + plate waste"
        />
        <Stat
          label="Waste per diner"
          value={number(insights.waste_per_diner_g, "g")}
          caption="Complete waste records only"
        />
        <Stat
          label="People not served"
          value={number(insights.total_shortage_count)}
          caption="Keep availability in view"
        />
      </div>
      {(insights.partial_waste_meals || 0) > 0 && (
        <div className="notice">
          {insights.partial_waste_meals} meals have partial waste records.
          Recorded waste is a known subtotal; waste per diner uses only the{" "}
          {insights.complete_waste_meals || 0} complete records.
        </div>
      )}
      <div className="split">
        <section className="panel">
          <div className="section-title">
            <h2>Up next</h2>
            <span className="badge">Kitchen plan</span>
          </div>
          {next ? (
            <>
              <p className="capitalize muted">
                {dateLabel(next.forecast.date)} · {next.forecast.meal_type}
              </p>
              <p className="large-number">
                {next.forecast.planned_diners}
                <span> diners</span>
              </p>
              <p>{next.forecast.dishes.map((d) => d.name).join(" · ")}</p>
              <ul className="ingredients">
                {next.forecast.ingredients.map((i) => (
                  <li key={i.ingredient_id}>
                    <span>{i.name}</span>
                    <b>{number(i.quantity_kg, "kg")}</b>
                  </li>
                ))}
              </ul>
              <small className="muted">
                Raw ingredient quantities · approved snapshot
              </small>
            </>
          ) : (
            <Empty title="Your next meal starts here">
              No upcoming plan yet. Use Plan a Meal to prepare one.
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>Last service</h2>
            <button className="text-button" onClick={() => navigate("results")}>
              Record results →
            </button>
          </div>
          {latest ? (
            <>
              <p className="capitalize muted">
                {dateLabel(latest.forecast.date)} · {latest.forecast.meal_type}
              </p>
              <p className="large-number">
                {latest.result!.actual_diners}
                <span> diners served</span>
              </p>
              <div className="mini-stats">
                <div>
                  <span>Recorded waste</span>
                  <b>{number(latest.metrics!.total_waste_kg, "kg")}</b>
                </div>
                <div>
                  <span>People not served</span>
                  <b>{latest.result!.shortage_count}</b>
                </div>
              </div>
              <p className="explanation">
                {latest.result!.notes || "No notes recorded for this meal."}
              </p>
              {latest.metrics!.has_estimated_measurements && (
                <span className="badge">Includes estimated weights</span>
              )}
            </>
          ) : (
            <Empty title="Close the loop">
              Record a completed meal to see how your plan worked in practice.
            </Empty>
          )}
        </section>
      </div>
      {!!insights.dish_leftovers?.length && (
        <section className="panel waste-watch">
          <div className="section-title">
            <div>
              <h2>Where to look next</h2>
              <p>
                Dishes with the most recorded discarded leftovers. Compare
                similar menus before changing portions.
              </p>
            </div>
          </div>
          {insights.dish_leftovers.slice(0, 4).map((d, index) => (
            <div className="leftover-row" key={d.recipe_id}>
              <span className="rank">0{index + 1}</span>
              <div>
                <b>{d.name}</b>
                <small>{d.recorded_meals} recorded meals</small>
              </div>
              <strong>{number(d.unserved_kg, "kg")}</strong>
            </div>
          ))}
        </section>
      )}
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Recent meals</h2>
            <p>Small records. A more useful picture.</p>
          </div>
          <button className="text-button" onClick={() => navigate("history")}>
            View history →
          </button>
        </div>
        {recent.length ? (
          recent.slice(0, 4).map((p) => (
            <div className="meal-row" key={p.id}>
              <span className="meal-icon" aria-hidden="true">
                ◷
              </span>
              <div>
                <strong className="capitalize">{p.forecast.meal_type}</strong>
                <small>{dateLabel(p.forecast.date)}</small>
              </div>
              <div>
                <strong>{p.result!.actual_diners} diners</strong>
                <small>{number(p.metrics!.total_waste_kg, "kg")} waste</small>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">Completed meals will appear here.</p>
        )}
      </section>
    </>
  );
}
