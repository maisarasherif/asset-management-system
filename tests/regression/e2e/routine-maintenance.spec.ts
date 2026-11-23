
import { expect, test } from "@playwright/test";
import { chooseOption, maintenanceEnabled, requestMaintenance, signInForMaintenance } from "../support/maintenance-playwright";

test.describe("Central routine and non-routine maintenance", () => {
  test.skip(!maintenanceEnabled, "Run against the isolated maintenance stack");

  test("records working hours, completes two jobs, and releases the red tag", async ({ page, request }) => {
    const token = await signInForMaintenance(page);
    await page.getByRole("link", { name: "Work Orders", exact: true }).click();
    await expect(page).toHaveURL(/\/work-orders$/);
    await expect(page.getByRole("heading", { name: "Work Orders" })).toBeVisible();
    for (const [label, path] of [
      ["Routine Maintenance Plans", "/maintenance/plans"],
      ["Quarantine Zone", "/maintenance/quarantine"],
      ["Spare parts inventory", "/maintenance/inventory"],
      ["Parts usage", "/maintenance/usage"],
    ]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", path);
    }
    await page.goto("/hr-admin");
    await expect(page.getByRole("link", { name: "HR/Admin overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Work Orders", exact: true })).toHaveCount(0);
    const suffix = Date.now();
    const equipment = `Service compressor ${suffix}`;
    const asset = await requestMaintenance<{ asset_id: string }>(request, token, "/asset", {
      method: "POST", status: 201, data: { name: equipment, status: "ACTIVE" },
    });

    await page.goto(`/maintenance/plans?asset_id=${asset.asset_id}`);
    await page.getByRole("button", { name: "Add routine plan" }).click();
    const plan = page.getByRole("dialog", { name: "Add routine plan" });
    await plan.getByRole("textbox", { name: "Plan name" }).fill("Oil service");
    await plan.getByRole("textbox", { name: "Interval in hours" }).fill("100");
    await plan.getByText("Red-tag equipment when due", { exact: true }).click();
    await plan.getByRole("button", { name: "Save", exact: true }).click();
    await expect(plan).toBeHidden();
    await expect(page.getByRole("row", { name: /Oil service/ })).toContainText("100 h");

    await page.goto(`/assets/${asset.asset_id}`);
    await page.getByRole("button", { name: "Update working hours" }).click();
    const meter = page.getByRole("dialog", { name: "Update working hours" });
    await meter.getByRole("textbox", { name: "Working hours" }).fill("125");
    await meter.getByRole("button", { name: "Save", exact: true }).click();
    await expect(meter).toBeHidden();
    await expect(page.getByText("Red tag · Quarantined", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View work orders" }).click();
    await expect(page).toHaveURL(new RegExp("/work-orders\\?asset_id=" + asset.asset_id));
    await expect(page.getByRole("row", { name: /Oil service/ })).toBeVisible();

    await page.getByRole("button", { name: "Raise maintenance work order", exact: true }).click();
    const raise = page.getByRole("dialog", { name: "Raise non-routine work order" });
    await raise.getByRole("textbox", { name: "Title" }).fill("Air leak");
    await raise.getByRole("textbox", { name: "Fault or work required" }).fill("Air hose leaked during inspection");
    await raise.getByText("Red-tag and block deployment", { exact: true }).click();
    await raise.getByRole("button", { name: "Raise work order" }).click();
    await expect(page.getByRole("heading", { name: "Air leak" })).toBeVisible();
    await page.getByRole("button", { name: "Complete work order" }).click();
    const fault = page.getByRole("dialog", { name: "Complete work order" });
    await fault.getByRole("textbox", { name: "Work performed" }).fill("Replaced the air hose");
    await fault.getByRole("button", { name: "Complete work order" }).click();
    await expect(fault).toBeHidden();
    await expect(page.getByText("Replaced the air hose", { exact: true })).toBeVisible();

    await page.goto(`/maintenance/quarantine?asset_id=${asset.asset_id}`);
    await page.getByRole("button", { name: /1 blocking work order/ }).click();
    const hold = page.getByRole("dialog", { name: "Quarantine details" });
    await expect(hold.getByRole("button", { name: "Green-tag equipment" })).toBeDisabled();
    await hold.getByRole("link", { name: /Oil service/ }).click();
    await page.getByRole("button", { name: "Complete work order" }).click();
    const routine = page.getByRole("dialog", { name: "Complete work order" });
    await routine.getByRole("textbox", { name: "Work performed" }).fill("Changed the service oil");
    await routine.getByRole("button", { name: "Complete work order" }).click();
    await expect(routine).toBeHidden();

    await page.goto(`/maintenance/quarantine?asset_id=${asset.asset_id}`);
    await page.getByRole("button", { name: "Release equipment" }).click();
    const release = page.getByRole("dialog", { name: "Release equipment" });
    await release.getByRole("textbox", { name: "Release notes" }).fill("Verified service and leak repair");
    await release.getByRole("button", { name: "Green-tag equipment" }).click();
    await expect(release).toBeHidden();
    await page.goto(`/assets/${asset.asset_id}`);
    await expect(page.getByText("Green tag · Available", { exact: true })).toBeVisible();
    await expect(page.getByText(/Oil service due at 225 h/)).toBeVisible();
  });

  test("shows a filtered equipment register across supported viewport widths", async ({ page, request }) => {
    const token = await signInForMaintenance(page);
    const asset = await requestMaintenance<{ asset_id: string }>(request, token, "/asset", {
      method: "POST", status: 201, data: { name: "Maintenance viewport fixture " + Date.now(), status: "ACTIVE" },
    });
    await page.goto(`/work-orders?asset_id=${asset.asset_id}`);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { name: "Work Orders" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Raise maintenance work order", exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Raise maintenance work order", exact: true }).click();
    const raise = page.getByRole("dialog", { name: "Raise non-routine work order" });
    await chooseOption(page, raise.getByRole("button", { name: /Equipment/ }), /Maintenance viewport fixture/);
    await expect(raise.getByRole("textbox", { name: "Fault or work required" })).toBeVisible();
  });
  test("a technician can red-tag equipment and only an admin can release it", async ({ page, request, browser, baseURL }) => {
    const token = await signInForMaintenance(page);
    const equipment = "Technician quarantine fixture " + Date.now();
    const asset = await requestMaintenance<{ asset_id: string }>(request, token, "/asset", {
      method: "POST", status: 201, data: { name: equipment, status: "ACTIVE" },
    });
    const credentials = { email: `maint-${Date.now()}@example.test`, password: "Maintenance-Test-2026" };
    await requestMaintenance(request, token, "/user", {
      method: "POST", status: 201, data: { ...credentials, first_name: "Test", last_name: "Technician", role: "USER" },
    });
    const staffContext = await browser.newContext({ baseURL });
    try {
      const staff = await staffContext.newPage();
      await signInForMaintenance(staff, credentials);
      await staff.getByRole("link", { name: "Quarantine Zone", exact: true }).click();
      await expect(staff).toHaveURL(/\/maintenance\/quarantine$/);
      await staff.goto(`/maintenance/quarantine?asset_id=${asset.asset_id}`);
      await staff.getByRole("button", { name: "Red-tag equipment" }).click();
      const tag = staff.getByRole("dialog", { name: "Red-tag equipment" });
      await tag.getByRole("textbox", { name: "Quarantine reason" }).fill("Inspection requested");
      await tag.getByRole("button", { name: "Red-tag equipment" }).click();
      await expect(tag).toBeHidden();
      await staff.getByRole("button", { name: "View hold" }).click();
      await expect(staff.getByRole("button", { name: "Green-tag equipment" })).toBeDisabled();
    } finally {
      await staffContext.close();
    }
    await page.goto(`/maintenance/quarantine?asset_id=${asset.asset_id}`);
    await expect(page.getByRole("button", { name: "Release equipment" })).toBeVisible();
    await page.goto(`/assets/${asset.asset_id}/routine-maintenance`);
    await expect(page.getByRole("heading", { name: "Page error" })).toBeVisible();
    await expect(page.getByText("Not Found", { exact: true })).toBeVisible();
  });

});
