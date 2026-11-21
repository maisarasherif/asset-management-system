
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const maintenanceEnabled = process.env.PLAYWRIGHT_RUN_ROUTINE_MAINTENANCE_TRIGGER === "1";
const apiBase = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:8080/v1";

export async function signInForMaintenance(page: Page, credentials?: { email: string; password: string }) {
  const email = credentials?.email ?? process.env.PLAYWRIGHT_ADMIN_EMAIL;
  const password = credentials?.password ?? process.env.PLAYWRIGHT_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Isolated administrator credentials are required");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const login = page.waitForResponse((response) => response.url() === apiBase + "/login" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await login;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  return (await response.json() as { token: string }).token;
}

export async function requestMaintenance<T>(
  request: APIRequestContext, token: string, path: string,
  options: { method?: string; data?: object; status?: number } = {},
) {
  const response = await request.fetch(apiBase + path, {
    method: options.method ?? "GET",
    data: options.data,
    headers: { Authorization: "Bearer " + token },
  });
  expect(response.status(), path + " " + await response.text()).toBe(options.status ?? 200);
  return response.json() as Promise<T>;
}

export async function chooseOption(page: Page, control: Locator, name: string | RegExp) {
  await control.click();
  await page.getByRole("option", { name }).click();
}
