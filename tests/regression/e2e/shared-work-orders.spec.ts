
import { expect, test } from "@playwright/test";
import { chooseOption, maintenanceEnabled, requestMaintenance, signInForMaintenance } from "../support/maintenance-playwright";

test("Dashboard and AMS sidebar open the shared inspection and maintenance register", async ({ page, request }) => {
  test.skip(!maintenanceEnabled, "Run against the isolated maintenance stack");
  const token = await signInForMaintenance(page);
  const suffix = Date.now();
  const testName = "Shared pressure inspection " + suffix;
  const equipmentType = await requestMaintenance<{ equipment_type_id: string }>(request, token, "/equipment-type", {
    method: "POST", status: 201, data: { equipment_type_name: "Pressure gauge " + suffix, sort_order: Math.floor(suffix / 1000) },
  });
  const testType = await requestMaintenance<{ test_id: string }>(request, token, "/test-type", {
    method: "POST", status: 201, data: { test_name: testName, validity_duration: 12 },
  });
  const equipment = await requestMaintenance<{ asset_id: string }>(request, token, "/asset", {
    method: "POST", status: 201, data: { name: "Shared equipment " + suffix, status: "ACTIVE",
      asset_kind: "SINGLE_EQUIPMENT", single_equipment: { equipment_type_id: equipmentType.equipment_type_id, test_type_ids: [testType.test_id] } },
  });
  await requestMaintenance(request, token, "/maintenance/work-orders", {
    method: "POST", status: 201, data: { asset_id: equipment.asset_id, title: "Repair gauge housing", description: "Replace damaged housing" },
  });

  await page.goto(`/assets/${equipment.asset_id}`);
  await expect(page.getByRole("heading", { name: "Shared equipment " + suffix })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Work Orders/ })).toBeVisible();
  await expect(page.getByRole("link", { name: testName, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Repair gauge housing", exact: true })).toBeVisible();
  await expect(page.getByText("Inspection and Maintenance", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Asset Directory", exact: true })).toHaveAttribute("href", "/assets");
  await page.getByRole("button", { name: "View work orders", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/work-orders\\?asset_id=" + equipment.asset_id));

  await chooseOption(page, page.getByRole("button", { name: /^Type/ }), "Inspection");
  await expect(page.getByRole("row", { name: new RegExp(testName) })).toBeVisible();
  await expect(page.getByRole("row", { name: /Repair gauge housing/ })).toHaveCount(0);
  await page.getByRole("link", { name: new RegExp(testName) }).click();
  await expect(page.getByRole("link", { name: "Open certificate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Complete work order" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start work" }).click();
  await page.getByRole("dialog", { name: "Start work" }).getByRole("button", { name: "Start work" }).click();
  await expect(page.getByText(/^In progress$/i)).toBeVisible();
  await page.getByRole("link", { name: "Open certificate" }).click();
  await expect(page).toHaveURL(/\/certificates\//);
});
