export type MealType = "breakfast" | "lunch" | "dinner";
export interface Settings {
  hostel_capacity: number;
  default_fallback_diners: number;
  default_buffer_percent: number;
  timezone: string;
  is_demo: boolean;
}
export interface Ingredient {
  ingredient_id: string;
  name: string;
  quantity_kg: number;
}
export interface Recipe {
  id: string;
  name: string;
  ingredients: {
    ingredient_id: string;
    name: string;
    grams_per_diner: number;
  }[];
}
export interface Catalog {
  settings: Settings;
  recipes: Recipe[];
}
export interface ForecastRequest {
  date: string;
  meal_type: MealType;
  recipe_ids: string[];
  fallback_diners: number;
  adjustment: number;
  adjustment_reason: string;
  buffer_percent: number;
}
export interface Forecast extends ForecastRequest {
  forecast_id: string;
  created_at: string;
  hostel_capacity: number;
  estimated_diners: number;
  adjusted_diners: number;
  planned_diners: number;
  method: "same_weekday" | "recent_meals" | "fallback";
  history_count: number;
  history_plan_ids: string[];
  explanation: string;
  is_demo: boolean;
  dishes: {
    recipe_id: string;
    name: string;
    ingredients: (Ingredient & { grams_per_diner: number })[];
  }[];
  ingredients: Ingredient[];
}
export interface DishResult {
  recipe_id: string;
  prepared_kg: number;
  unserved_kg: number;
  plate_waste_kg: number;
  measurement_method: "weighed" | "estimated";
}
export interface ResultRequest {
  actual_diners: number;
  shortage_count: number;
  dishes: DishResult[];
  notes: string;
}
export interface MealResult extends ResultRequest {
  plan_id: string;
  updated_at: string;
}
export interface Metrics {
  total_prepared_kg: number;
  total_unserved_kg: number;
  total_plate_waste_kg: number;
  total_waste_kg: number;
  waste_per_diner_g: number | null;
  forecast_error_diners: number;
  has_estimated_measurements: boolean;
}
export interface Plan {
  id: string;
  created_at: string;
  status: "planned" | "completed";
  forecast: Forecast;
  result: MealResult | null;
  metrics: Metrics | null;
}
export interface Insights {
  completed_meals: number;
  total_actual_diners: number;
  total_shortage_count: number;
  total_prepared_kg: number;
  total_unserved_kg: number;
  total_plate_waste_kg: number;
  total_waste_kg: number;
  waste_per_diner_g: number | null;
  mean_forecast_error_diners: number | null;
  meals_with_estimated_measurements: number;
  demo_meals: number;
}
export interface FieldError {
  path: string;
  message: string;
}
