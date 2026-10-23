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
  await page
    .getByRole("button", { name: "Idli breakfast", exact: true })
    .click();
  await page.getByLabel("Attendance adjustment").fill("-30");
  await page.getByLabel("Reason for adjustment").fill("Campus event");
  await page.getByRole("button", { name: "Generate meal plan" }).click();
  await expect(
    page.locator(".preview").getByText("158 diners", { exact: true }),
  ).toBeVisible();
}
test("quick portions, shared bin, correction and persistence", async ({
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
  await go(page, "Record Results");
  await page.getByLabel("Diners served", { exact: true }).fill("150");
  for (const b of await page
    .getByRole("button", { name: "None discarded", exact: true })
    .all())
    await b.click();
  const idli = page
    .locator(".quick-dish")
    .filter({ has: page.locator("legend").filter({ hasText: "Idli" }) });
  await idli
    .getByRole("button", { name: "Some discarded", exact: true })
    .click();
  await page.getByLabel("Idli leftover quantity").fill("");
  await expect(page.getByLabel("Idli leftover quantity")).toBeVisible();
  await page.getByLabel("Idli leftover quantity").fill("3");
  await expect(idli.locator(".conversion")).toContainText("≈ 0.12 kg");
  await page.getByLabel("Shared plate waste (kg, optional)").fill("1");
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
  await page.reload();
  await go(page, "History & Insights");
  await expect(page.getByText("140 served", { exact: true })).toBeVisible();
});
test("partial records preserve unknown weights", async ({ page }) => {
  await page.goto("/");
  await plan(page);
  await page
    .getByRole("button", { name: "Save meal plan", exact: true })
    .click();
  await expect(
    page.getByText("Meal plan saved.", { exact: false }),
  ).toBeVisible();
  await go(page, "Record Results");
  await page.getByLabel("Diners served", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Save results", exact: true }).click();
  await expect(
    page.getByText("Results saved.", { exact: false }),
  ).toBeVisible();
  await go(page, "History & Insights");
  await page.locator("summary").filter({ hasText: "Breakfast ·" }).click();
  await expect(
    page.getByText("Partial record ·", { exact: false }),
  ).toBeVisible();
});
test("custom menu, calibrated container and archive persist", async ({
  page,
}) => {
  await page.goto("/");
  await go(page, "Menu Library");
  await page.getByRole("button", { name: "+ Add a dish" }).click();
  await page.getByLabel("Dish name", { exact: true }).fill("Pesarattu");
  await page.getByLabel("One portion, cooked grams").fill("100");
  await page.getByLabel("Container name").fill("tray");
  await page.getByLabel("One full container, net food grams").fill("2000");
  await page.getByRole("button", { name: "Save dish", exact: true }).click();
  await expect(
    page.getByText("Pesarattu saved to your kitchen menu."),
  ).toBeVisible();
  await page.reload();
  await go(page, "Menu Library");
  await page.getByLabel("Search dishes").fill("Pesarattu");
  await expect(
    page.getByRole("heading", { name: "Pesarattu", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Pesarattu →" }).click();
  await page.getByLabel("Available for new meal plans").uncheck();
  await page.getByRole("button", { name: "Save dish", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await go(page, "Plan a Meal");
  await page.getByLabel("Find a dish").fill("Pesarattu");
  await expect(page.getByRole("checkbox", { name: "Pesarattu" })).toHaveCount(
    0,
  );
});
test("editing inputs invalidates preview and navigation preserves draft", async ({
  page,
}) => {
  await page.goto("/");
  await plan(page);
  await page.getByLabel("Attendance adjustment").fill("-40");
  await expect(
    page.getByRole("button", { name: "Save meal plan", exact: true }),
  ).toHaveCount(0);
  await go(page, "Menu Library");
  await go(page, "Plan a Meal");
  await expect(page.getByLabel("Attendance adjustment")).toHaveValue("-40");
});
test("duplicate plans and impossible weights show useful errors", async ({
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
  const d = page.locator(".quick-dish").first();
  await d.getByRole("button", { name: "Some discarded", exact: true }).click();
  await d.getByRole("combobox", { name: /leftover unit/ }).selectOption("kg");
  await d.getByRole("spinbutton", { name: /leftover quantity/ }).fill("8");
  await d.locator("summary").click();
  await d.getByLabel("Prepared food (kg)", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save results", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cannot exceed");
  await expect(
    d.getByRole("spinbutton", { name: /leftover quantity/ }),
  ).toHaveValue("8");
});
test("all screens fit phone and keyboard navigation works", async ({
  page,
}) => {
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
    "Menu Library",
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
test("real mode outage never enables fixtures", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("http://127.0.0.1:5174");
  await expect(page.getByRole("alert")).toContainText("Cannot reach");
  await expect(
    page.getByText("Fixture mode · fictional demo data"),
  ).toHaveCount(0);
});
