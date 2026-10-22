import type {
  Catalog,
  FieldError,
  Forecast,
  ForecastRequest,
  Insights,
  MealResult,
  Plan,
  ResultRequest,
} from "./types";
export const mockMode = import.meta.env.VITE_USE_MOCKS === "true";
export class ApiError extends Error {
  constructor(
    message: string,
    public fields: FieldError[] = [],
    public status = 0,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (mockMode)
    return (await import("./fixtures")).fixtureRequest(
      path,
      method,
      body,
    ) as Promise<T>;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api${path}`, {
      method,
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        data?.error?.message ||
          `The kitchen service returned an error (${response.status}). Please retry.`,
        data?.error?.fields || [],
        response.status,
      );
    if (data === null)
      throw new ApiError(
        "The kitchen service returned an unreadable response. Please retry.",
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Cannot reach the kitchen service. Check that the backend is running on port 8000, then retry. Your entries are still here.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
export const api = {
  health: () =>
    request<{ status: "ok"; api_version: "1"; database: "ok" }>("/health"),
  recipes: () => request<Catalog>("/recipes"),
  plans: () => request<{ plans: Plan[] }>("/plans"),
  insights: () => request<Insights>("/insights"),
  forecast: (input: ForecastRequest) =>
    request<Forecast>("/forecast", "POST", input),
  savePlan: (forecast_id: string) =>
    request<Plan>("/plans", "POST", { forecast_id }),
  saveResult: (id: string, input: ResultRequest) =>
    request<MealResult>(
      `/plans/${encodeURIComponent(id)}/result`,
      "PUT",
      input,
    ),
};
