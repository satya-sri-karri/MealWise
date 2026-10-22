import type { Plan } from "./types";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
export const number = (value: number | null, unit = "") =>
  value === null
    ? "Not available"
    : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value)}${unit ? ` ${unit}` : ""}`;
const order = { breakfast: 0, lunch: 1, dinner: 2 };
export const chronological = (a: Plan, b: Plan) =>
  a.forecast.date.localeCompare(b.forecast.date) ||
  order[a.forecast.meal_type] - order[b.forecast.meal_type];
