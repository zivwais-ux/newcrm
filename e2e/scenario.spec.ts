import { expect, test, type Page } from "@playwright/test";

// The Phase 1 "definition of done" scenario, end to end:
// sign up → service business → import customers_and_sales.xlsx → confirm mapping →
// recommendations → Add Recommended → live Components → "Why is revenue down?" →
// View affected customers → select → Create Follow-up Tasks → confirm → tasks exist.

const stamp = Date.now();
const email = `owner+${stamp}@businessos.test`;
const password = "correct-horse-battery";

async function signUp(page: Page, name: string, mail: string) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(mail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding");
}

test("new service business: import → components → AI → follow-up tasks", async ({ page }) => {
  await signUp(page, "Ziv", email);

  // Onboarding
  await expect(page.getByRole("heading", { name: "Welcome to your Business OS" })).toBeVisible();
  await page.getByLabel("Business name").fill("Sparkle Test Cleaning");
  await page.getByRole("button", { name: /Service Business/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Where is your business data today?" })).toBeVisible();
  await page.getByRole("button", { name: /^Excel/ }).click();
  await page.getByRole("button", { name: "Continue to import" }).click();
  await page.waitForURL("**/data/import**");

  // Upload → Analyze → Map
  await page.setInputFiles('input[type="file"]', "samples/customers_and_sales.xlsx");
  await expect(page.getByText("Confirm mapping")).toBeVisible({ timeout: 60_000 });
  for (const entity of ["Customers", "Transactions", "Services"]) await expect(page.getByText(entity, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Confirm mapping" }).click();

  // Validate → Import
  await expect(page.getByText("rows detected")).toBeVisible();
  await expect(page.getByText("missing customer name")).toBeVisible();
  await page.getByRole("button", { name: /Import .* valid records/ }).click();
  await expect(page.getByRole("heading", { name: "Your data is ready" })).toBeVisible({ timeout: 120_000 });

  // Recommendations
  await page.getByRole("link", { name: "See recommended Components" }).click();
  await expect(page.getByText("Recommended for your business")).toBeVisible();
  for (const name of ["Customer Hub", "Revenue Intelligence", "Repeat Customers", "Customer Risk", "AI Business Analyst"]) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  await page.getByRole("button", { name: /Add Recommended/ }).click();
  await page.waitForURL("**/home");

  // Live Components on Home
  for (const name of ["Revenue Intelligence", "Customer Hub", "Customer Risk", "Repeat Customers"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Customer Hub" }).getByText("Total customers")).toBeVisible();
  await expect(page.getByRole("region", { name: "AI Business Brief" })).toBeVisible();

  // Ask the AI Business Analyst
  await page.goto(`/ai?q=${encodeURIComponent("Why is revenue down?")}`);
  await expect(page.getByText("Based on your data")).toBeVisible({ timeout: 90_000 });
  const viewAffected = page.getByRole("link", { name: "View affected customers" });
  await expect(viewAffected).toBeVisible();
  await viewAffected.click();

  // Select customers → Create Follow-up Tasks → confirm
  await page.waitForURL("**/customers?ids=**");
  await page.getByLabel("Select all on this page").click();
  await page.getByRole("button", { name: "Create Follow-up Tasks" }).click();
  await expect(page.getByRole("heading", { name: "Create follow-up tasks" })).toBeVisible();
  await page.getByRole("button", { name: /^Create \d+ tasks?$/ }).click();
  await expect(page.getByText(/follow-up tasks? created/)).toBeVisible();

  await page.goto("/tasks");
  await expect(page.getByText(/Follow up — /).first()).toBeVisible();
});

test("organization isolation: another workspace cannot see this data", async ({ browser }) => {
  // Workspace A
  const a = await browser.newPage();
  await signUp(a, "Owner A", `a+${stamp}@businessos.test`);
  await a.getByLabel("Business name").fill("Workspace A");
  await a.getByRole("button", { name: /Service Business/ }).click();
  await a.getByRole("button", { name: "Continue" }).click();
  await a.getByRole("button", { name: /^Manual/ }).click();
  await a.getByRole("button", { name: "Go to my workspace" }).click();
  await a.waitForURL("**/home");
  await a.goto("/customers");
  await a.getByRole("button", { name: "New customer" }).first().click();
  await a.getByLabel(/^Name/).fill("Secret Customer A");
  await a.getByRole("button", { name: "Create customer" }).click();
  await expect(a.getByRole("link", { name: "Secret Customer A" })).toBeVisible();
  const href = await a.getByRole("link", { name: "Secret Customer A" }).getAttribute("href");

  // Workspace B tries to read it by search and by direct URL
  const b = await (await browser.newContext()).newPage();
  await signUp(b, "Owner B", `b+${stamp}@businessos.test`);
  await b.getByLabel("Business name").fill("Workspace B");
  await b.getByRole("button", { name: /Sales Business/ }).click();
  await b.getByRole("button", { name: "Continue" }).click();
  await b.getByRole("button", { name: /^Manual/ }).click();
  await b.getByRole("button", { name: "Go to my workspace" }).click();
  await b.waitForURL("**/home");
  await b.goto("/customers?q=Secret");
  await expect(b.getByText("Secret Customer A")).toHaveCount(0);
  await b.goto(href!);
  await expect(b.getByText("We couldn't find that")).toBeVisible();
});
