import { expect, test, type Page } from "@playwright/test";
async function go(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function plan(page: Page) {
  await go(page, "Plan a Meal");
  await page.getByLabel("Meal", { exact: true }).selectOption("breakfast");
  await page.getByLabel("Attendance adjustment").fill("-30");
  await page.getByLabel("Reason for adjustment").fill("Campus event");
  await page.getByRole("button", { name: "Generate meal plan" }).click();
  await expect(page.getByText("158 diners", { exact: true })).toBeVisible();
}
test("plan, save, record, correct and persist a full meal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Fixture mode · fictional demo data"),
  ).toBeVisible();
  await plan(page);
  await expect(page.getByText("15.8 kg", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Save meal plan", exact: true })
    .click();
  await expect(
    page.getByText("Meal plan saved.", { exact: false }),
  ).toBeVisible();
  await go(page, "Record Results");
  await page.getByLabel("Diners served", { exact: true }).fill("150");
  await page.getByLabel("People unable to be served").fill("2");
  for (const field of await page
    .getByLabel("Prepared (kg)", { exact: true })
    .all())
    await field.fill("40");
  for (const field of await page
    .getByLabel("Unserved (kg)", { exact: true })
    .all())
    await field.fill("2");
  for (const field of await page
    .getByLabel("Plate waste (kg)", { exact: true })
    .all())
    await field.fill("1");
  await page.getByRole("button", { name: "Save results", exact: true }).click();
  await expect(
    page.getByText("Results saved.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Diners served", { exact: true }).fill("140");
  await page
    .getByRole("button", { name: "Update results", exact: true })
    .click();
  await expect(
    page.getByText("Results saved.", { exact: false }),
  ).toBeVisible();
  await go(page, "History & Insights");
  await page.locator("summary").filter({ hasText: "Breakfast ·" }).click();
  await expect(page.getByText("140 served", { exact: true })).toBeVisible();
  await expect(
    page.locator("details[open]").getByText("9 kg", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await go(page, "History & Insights");
  await expect(page.getByText("140 served", { exact: true })).toBeVisible();
});
test("editing input invalidates preview and preserves draft across navigation", async ({
  page,
}) => {
  await page.goto("/");
  await plan(page);
  await page.getByLabel("Attendance adjustment").fill("-40");
  await expect(
    page.getByRole("button", { name: "Save meal plan", exact: true }),
  ).toHaveCount(0);
  await go(page, "Overview");
  await go(page, "Plan a Meal");
  await expect(page.getByLabel("Attendance adjustment")).toHaveValue("-40");
});
test("waste validation protects values and duplicate plans show an error", async ({
  page,
}) => {
  await page.goto("/");
  await plan(page);
  await page
    .getByRole("button", { name: "Save meal plan", exact: true })
    .click();
  await expect(
    page.getByText("Meal plan saved.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Attendance adjustment").fill("-20");
  await page.getByRole("button", { name: "Generate meal plan" }).click();
  await page
    .getByRole("button", { name: "Save meal plan", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await go(page, "Record Results");
  await page.getByLabel("Diners served", { exact: true }).fill("100");
  await page.getByLabel("Prepared (kg)", { exact: true }).first().fill("10");
  await page.getByLabel("Unserved (kg)", { exact: true }).first().fill("8");
  await page.getByLabel("Plate waste (kg)", { exact: true }).first().fill("3");
  await page.getByRole("button", { name: "Save results", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cannot exceed");
  await expect(
    page.getByLabel("Unserved (kg)", { exact: true }).first(),
  ).toHaveValue("8");
});
test("future results disabled and zero attendance is supported", async ({
  page,
}) => {
  await page.goto("/");
  await go(page, "Plan a Meal");
  await page.getByLabel("Meal date").fill("2099-01-01");
  await page.getByLabel("Meal", { exact: true }).selectOption("breakfast");
  await page.getByLabel("Fallback attendance").fill("0");
  await page.getByRole("button", { name: "Generate meal plan" }).click();
  await expect(
    page.locator(".preview").getByText("0 diners", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save meal plan", exact: true })
    .click();
  await expect(
    page.getByText("Meal plan saved.", { exact: false }),
  ).toBeVisible();
  await go(page, "Record Results");
  await expect(
    page.getByRole("button", { name: "Save results", exact: true }),
  ).toBeDisabled();
});
test("all screens fit viewport and keyboard focus works", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good food. Better planning." }),
  ).toBeVisible();
  for (const name of [
    "Overview",
    "Plan a Meal",
    "Record Results",
    "History & Insights",
  ]) {
    await go(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByText("Skip to content")).toBeFocused();
  expect(errors).toEqual([]);
});
test("real mode reports outages without silently enabling fixtures", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("http://127.0.0.1:5174");
  await expect(page.getByRole("alert")).toContainText("Cannot reach");
  await expect(
    page.getByText("Fixture mode · fictional demo data"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry connection" }),
  ).toBeVisible();
});
test("real API requests follow contract and a failed save keeps inputs", async ({
  page,
}) => {
  const input = {
    date: "2026-10-20",
    meal_type: "breakfast",
    recipe_ids: ["rice"],
    fallback_diners: 180,
    adjustment: -30,
    adjustment_reason: "Event",
    buffer_percent: 5,
  };
  const forecast = {
    ...input,
    forecast_id: "c475ef05-75bb-4c37-a10d-5da649cf4b36",
    created_at: "2026-10-20T00:00:00Z",
    hostel_capacity: 250,
    estimated_diners: 180,
    adjusted_diners: 150,
    planned_diners: 158,
    method: "fallback",
    history_count: 0,
    history_plan_ids: [],
    explanation: "Fallback 180; adjustment -30; buffer 5%; planned 158.",
    is_demo: true,
    dishes: [
      {
        recipe_id: "rice",
        name: "Rice",
        ingredients: [
          {
            ingredient_id: "raw-rice",
            name: "Raw rice",
            grams_per_diner: 100,
            quantity_kg: 15.8,
          },
        ],
      },
    ],
    ingredients: [
      { ingredient_id: "raw-rice", name: "Raw rice", quantity_kg: 15.8 },
    ],
  };
  let posted = false;
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === "/api/recipes")
      return route.fulfill({
        json: {
          settings: {
            hostel_capacity: 250,
            default_fallback_diners: 180,
            default_buffer_percent: 5,
            timezone: "Asia/Kolkata",
            is_demo: true,
          },
          recipes: [
            {
              id: "rice",
              name: "Rice",
              ingredients: [
                {
                  ingredient_id: "raw-rice",
                  name: "Raw rice",
                  grams_per_diner: 100,
                },
              ],
            },
          ],
        },
      });
    if (path === "/api/insights")
      return route.fulfill({
        json: {
          completed_meals: 0,
          total_actual_diners: 0,
          total_shortage_count: 0,
          total_prepared_kg: 0,
          total_unserved_kg: 0,
          total_plate_waste_kg: 0,
          total_waste_kg: 0,
          waste_per_diner_g: null,
          mean_forecast_error_diners: null,
          meals_with_estimated_measurements: 0,
          demo_meals: 0,
        },
      });
    if (path === "/api/plans" && req.method() === "GET")
      return route.fulfill({ json: { plans: [] } });
    if (path === "/api/forecast") {
      expect(req.postDataJSON()).toEqual(input);
      posted = true;
      return route.fulfill({ json: forecast });
    }
    if (path === "/api/plans" && req.method() === "POST") {
      expect(req.postDataJSON()).toEqual({ forecast_id: forecast.forecast_id });
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "STORAGE_UNAVAILABLE",
            message: "Database temporarily unavailable.",
            fields: [],
          },
        },
      });
    }
    return route.abort();
  });
  await page.goto("http://127.0.0.1:5174");
  await expect(
    page.getByText("Not available", { exact: true }).first(),
  ).toBeVisible();
  await go(page, "Plan a Meal");
  await page.getByLabel("Meal date").fill(input.date);
  await page.getByLabel("Meal", { exact: true }).selectOption("breakfast");
  await page.getByLabel("Attendance adjustment").fill("-30");
  await page.getByLabel("Reason for adjustment").fill("Event");
  await page.getByRole("button", { name: "Generate meal plan" }).click();
  await page
    .getByRole("button", { name: "Save meal plan", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Database temporarily unavailable",
  );
  await expect(page.getByLabel("Reason for adjustment")).toHaveValue("Event");
  await expect(
    page.getByRole("button", { name: "Save meal plan", exact: true }),
  ).toBeEnabled();
  expect(posted).toBe(true);
});
