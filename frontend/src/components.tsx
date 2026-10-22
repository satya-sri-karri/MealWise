import type { ReactNode } from "react";
import { ApiError } from "./api";
import type { Forecast } from "./types";
import { number } from "./utils";
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <strong>
        {error instanceof Error
          ? error.message
          : "Something went wrong. Please retry."}
      </strong>
      {error instanceof ApiError && error.fields.length > 0 && (
        <ul>
          {error.fields.map((f, i) => (
            <li key={i}>
              {f.path}: {f.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden="true">
        ◌
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Stat({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <article className="stat">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}
export function ForecastView({ forecast }: { forecast: Forecast }) {
  return (
    <>
      <div className="forecast-number">
        <span>Prepare for</span>
        <strong>
          {number(forecast.planned_diners)} <small>diners</small>
        </strong>
        <span>
          Capacity {forecast.hostel_capacity} · buffer {forecast.buffer_percent}
          %
        </span>
      </div>
      <div className="mini-stats">
        <div>
          <span>Baseline estimate</span>
          <b>{number(forecast.estimated_diners)}</b>
        </div>
        <div>
          <span>After adjustment</span>
          <b>{number(forecast.adjusted_diners)}</b>
        </div>
      </div>
      <p className="explanation">{forecast.explanation}</p>
      <h3>Raw ingredients</h3>
      <ul className="ingredients">
        {forecast.ingredients.map((i) => (
          <li key={i.ingredient_id}>
            <span>{i.name}</span>
            <strong>{number(i.quantity_kg, "kg")}</strong>
          </li>
        ))}
      </ul>
      <small className="muted">
        Raw ingredient weights. Record cooked-food weights after service.
      </small>
    </>
  );
}
