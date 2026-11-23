
import { expect, test } from "@playwright/test";
import { chooseOption, maintenanceEnabled, requestMaintenance, signInForMaintenance } from "../support/maintenance-playwright";

test.describe("Spare parts inventory", () => {
  test.skip(!maintenanceEnabled, "Run against the isolated maintenance stack");

  test("sets worksite stock, deducts usage, and retains the correction after reload", async ({ page, request }) => {
    const token = await signInForMaintenance(page);
    const suffix = Date.now();
    const projectName = `Inventory Worksite ${suffix}`;
    const partName = `Oil Filter ${suffix}`;
    const partNumber = `FLT-${suffix}`;
    await requestMaintenance(request, token, "/project", {
      method: "POST", status: 201, data: { project_name: projectName, status: "ACTIVE" },
    });
    const asset = await requestMaintenance<{ asset_id: string }>(request, token, "/asset", {
      method: "POST", status: 201, data: { name: "Stock compressor " + suffix, status: "ACTIVE", assigned_project: projectName },
    });
    const order = await requestMaintenance<{ work_order_id: string }>(request, token, "/maintenance/work-orders", {
      method: "POST", status: 201, data: { asset_id: asset.asset_id, title: "Replace filter", description: "Filter is clogged" },
    });

    await page.goto("/maintenance/inventory");
    await page.getByRole("button", { name: "Add worksite store" }).click();
    const newStore = page.getByRole("dialog", { name: "Add worksite store" });
    await chooseOption(page, newStore.getByRole("button", { name: /Project/ }), projectName);
    await newStore.getByRole("button", { name: "Save", exact: true }).click();
    await expect(newStore).toBeHidden();
    await chooseOption(page, page.getByRole("button", { name: /^Store/ }), projectName);

    await page.getByRole("button", { name: "Add spare part" }).click();
    const newPart = page.getByRole("dialog", { name: "Add spare part" });
    await newPart.getByRole("textbox", { name: "Part number" }).fill(partNumber);
    await newPart.getByRole("textbox", { name: "Part name" }).fill(partName);
    await newPart.getByRole("button", { name: "Save", exact: true }).click();
    await expect(newPart).toBeHidden();
    const balance = page.getByRole("row", { name: new RegExp(partNumber) });
    await balance.getByRole("button", { name: "Set count" }).click();
    const count = page.getByRole("dialog", { name: "Set count for " + partName });
    await count.getByRole("textbox", { name: "Quantity on hand" }).fill("2");
    await count.getByRole("textbox", { name: "Count reason" }).fill("Opening count");
    await count.getByRole("button", { name: "Save", exact: true }).click();
    await expect(count).toBeHidden();
    const inventoryUrl = page.url();

    await page.goto(`/work-orders/${order.work_order_id}`);
    await page.getByRole("button", { name: "Record parts usage" }).click();
    const log = page.getByRole("dialog", { name: "Record parts usage" });
    await chooseOption(page, log.getByRole("button", { name: /^Store/ }), projectName);
    await chooseOption(page, log.getByRole("button", { name: /^Spare part/ }), new RegExp(partNumber));
    await log.getByRole("textbox", { name: "Quantity used" }).fill("3");
    await expect(log.getByRole("button", { name: "Save usage" })).toBeDisabled();
    await log.getByRole("textbox", { name: "Quantity used" }).fill("2");
    await log.getByRole("button", { name: "Save usage" }).click();
    await expect(log).toBeHidden();
    await page.reload();
    const usage = page.getByRole("row", { name: new RegExp(partNumber) });
    await expect(usage.getByRole("cell", { name: "2", exact: true })).toBeVisible();
    await usage.getByRole("button", { name: "Correct usage" }).click();
    const correct = page.getByRole("dialog", { name: "Correct parts usage" });
    await correct.getByRole("textbox", { name: "Corrected quantity" }).fill("1");
    await correct.getByRole("textbox", { name: "Correction reason" }).fill("One filter installed");
    await correct.getByRole("button", { name: "Save correction" }).click();
    await expect(correct).toBeHidden();

    await page.goto(`/maintenance/usage?work_order_id=${order.work_order_id}`);
    await expect(page.getByRole("row", { name: new RegExp(partNumber) }).getByRole("cell", { name: "1", exact: true })).toBeVisible();
    await page.goto(inventoryUrl);
    await expect(balance.getByRole("cell", { name: "1", exact: true })).toBeVisible();
    await balance.getByRole("button", { name: "Count history" }).click();
    await expect(page.getByRole("dialog", { name: /Count history/ }).getByText("One filter installed", { exact: true })).toBeVisible();
  });
});
