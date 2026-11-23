import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { chooseOption, maintenanceEnabled, requestMaintenance, signInForMaintenance } from "../support/maintenance-playwright";

type Equipment = { asset_id: string; display_id: string; name: string };
const photoUrl = "https://example.com/overview-asset.png";
const datasheetUrl = "https://example.com/overview-datasheet.pdf";
const dashboardCards = ["Certificate status", "Work Orders", "Operating hours", "Asset details"];

async function selectAsset(page: Page, asset: Equipment) {
  await page.getByRole("button", { name: /Select asset/ }).click();
  const picker = page.getByRole("dialog", { name: /Select asset/ });
  await picker.getByRole("combobox", { name: "Filter options" }).fill(asset.name);
  await picker.getByRole("option", { name: `${asset.display_id} - ${asset.name}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: asset.name, exact: true })).toBeVisible();
}

async function raiseRepairs(request: APIRequestContext, token: string, asset: Equipment, prefix: string) {
  for (let index = 1; index <= 6; index++) {
    await requestMaintenance(request, token, "/maintenance/work-orders", {
      method: "POST", status: 201,
      data: { asset_id: asset.asset_id, title: `${prefix} ${index}`, description: "Overview pagination fixture" },
    });
  }
}

test.describe("AMS Overview", () => {
  test.skip(!maintenanceEnabled, "Run against the isolated maintenance stack");

  test("shows the selected asset, accessible charts, service details, and certificate links", async ({ page, request }) => {
    const token = await signInForMaintenance(page);
    const suffix = Date.now();
    await page.route(photoUrl, (route) => route.fulfill({
      path: resolve(__dirname, "../fixtures/signature-sample.png"),
      contentType: "image/png",
    }));
    const project = await requestMaintenance<{ project_name: string }>(request, token, "/project", {
      method: "POST", status: 201, data: { project_name: `Overview project ${suffix}`, status: "ACTIVE" },
    });
    const equipmentType = await requestMaintenance<{ equipment_type_id: string }>(request, token, "/equipment-type", {
      method: "POST", status: 201,
      data: { equipment_type_name: `Overview equipment type ${suffix}`, sort_order: Math.floor(suffix / 1000) },
    });
    const testType = await requestMaintenance<{ test_id: string }>(request, token, "/test-type", {
      method: "POST", status: 201, data: { test_name: `Pending overview test ${suffix}`, validity_duration: 12 },
    });
    const asset = await requestMaintenance<Equipment>(request, token, "/asset", {
      method: "POST", status: 201,
      data: {
        name: `Overview compressor ${suffix}`, status: "ACTIVE", asset_kind: "SINGLE_EQUIPMENT",
        assigned_project: project.project_name, location: "Overview workshop", datasheet: datasheetUrl, photo: photoUrl,
        description: "Compressor on standby for workshop commissioning",
        single_equipment: { equipment_type_id: equipmentType.equipment_type_id, test_type_ids: [testType.test_id] },
      },
    });
    const pending = await requestMaintenance<{ data: { component_id: string }[] }>(
      request, token, `/certificates/dashboard?asset_id=${asset.asset_id}`,
    );
    const componentId = pending.data[0].component_id;
    const dayInDubai = (offset: number) => {
      const date = new Date(Date.now() + offset * 86_400_000);
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(date) + "T00:00:00Z";
    };
    const certificateIds: string[] = [];
    for (const [name, days] of [["Overview valid A", 90], ["Overview valid B", 120],
      ["Overview expiring", 20], ["Overview expired", -2]] as const) {
      const certificate = await requestMaintenance<{ certificate_id: string }>(request, token, "/certificate", {
        method: "POST", status: 201,
        data: {
          component_id: componentId, test_id: testType.test_id, certificate_name: name,
          issuing_authority: "Overview lab", issue_date: dayInDubai(-90), expiry_date: dayInDubai(days),
        },
      });
      certificateIds.push(certificate.certificate_id);
    }
    await requestMaintenance(request, token, "/maintenance/plans", {
      method: "POST", status: 201,
      data: {
        asset_id: asset.asset_id, title: "Compressor service", interval_hours: 100, next_due_hours: 100,
        interval_months: 12, next_due_date: "2099-10-30", active: true,
      },
    });
    await requestMaintenance(request, token, `/asset/${asset.asset_id}/working-hours`, {
      method: "PATCH", data: { working_hours: 40 },
    });
    await requestMaintenance(request, token, "/maintenance/quarantine", {
      method: "POST", status: 201, data: { asset_id: asset.asset_id, reason: "Isolation test awaiting sign-off" },
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await selectAsset(page, asset);
    await expect(page.getByText(`${asset.display_id} - Overview workshop`, { exact: true })).toBeVisible();

    const cards = page.locator(".ams-overview-grid > *");
    const assetPhoto = cards.nth(3).getByRole("img", { name: `Photo of ${asset.name}` });
    const availability = cards.nth(3).getByText("Availability", { exact: true });
    const updateHours = cards.nth(3).getByRole("button", { name: "Update working hours" });
    const nextService = cards.nth(3).getByText("Next service", { exact: true });
    const datasheet = cards.nth(3).getByRole("link", { name: "Open datasheet" });
    await assetPhoto.scrollIntoViewIfNeeded();
    await expect(assetPhoto).toHaveJSProperty("complete", true);
    expect(await assetPhoto.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    for (const width of [1440, 1024, 768, 360, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(cards).toHaveCount(4);
      for (const [index, name] of dashboardCards.entries()) {
        await expect(cards.nth(index).getByRole("heading", { name })).toBeVisible();
      }
      const positions = await cards.evaluateAll((elements) => elements.map((element) => {
        const { left, top, width, bottom } = element.getBoundingClientRect();
        return { left, top, width, bottom };
      }));
      const [status, orders, hours, details] = positions;
      if (width > 900) {
        expect(status.left).toBeLessThan(orders.left);
        expect(status.top).toBeCloseTo(orders.top);
        expect(hours.top).toBeCloseTo(details.top);
        expect(hours.left).toBeCloseTo(status.left);
        expect(details.left).toBeCloseTo(orders.left);
        expect(status.width).toBeCloseTo(orders.width, 0);
        expect(hours.top).toBeGreaterThanOrEqual(status.bottom);
      } else {
        for (let index = 1; index < positions.length; index++) {
          expect(positions[index].left).toBeCloseTo(status.left);
          expect(positions[index].top).toBeGreaterThanOrEqual(positions[index - 1].bottom);
        }
      }
      const photoBounds = (await assetPhoto.boundingBox())!;
      const availabilityBounds = (await availability.boundingBox())!;
      const updateHoursBounds = (await updateHours.boundingBox())!;
      const nextServiceBounds = (await nextService.boundingBox())!;
      const datasheetBounds = (await datasheet.boundingBox())!;
      expect(nextServiceBounds.x).toBeCloseTo(availabilityBounds.x, 0);
      expect(nextServiceBounds.y).toBeGreaterThanOrEqual(updateHoursBounds.y + updateHoursBounds.height);
      expect(datasheetBounds.x).toBeCloseTo(photoBounds.x, 0);
      expect(datasheetBounds.y).toBeGreaterThanOrEqual(photoBounds.y + photoBounds.height);
      if (width === 1440) expect(photoBounds.x).toBeGreaterThan(availabilityBounds.x);
      if (width === 320) expect(photoBounds.y).toBeGreaterThan(availabilityBounds.y);
      const workOrderTable = cards.nth(1).getByRole("table", { name: "Open work orders" });
      const workOrderHeaders = workOrderTable.getByRole("columnheader");
      await expect(workOrderHeaders).toHaveText(["Work order", "Equipment", "Due"]);
      const tableBounds = (await workOrderTable.boundingBox())!;
      expect(tableBounds.x + tableBounds.width).toBeLessThanOrEqual(orders.left + orders.width + 1);
      const certificatesHeading = page.getByRole("heading", { name: "Compliance Certificates Quick Navigation" });
      await expect(certificatesHeading).toBeVisible();
      expect((await certificatesHeading.boundingBox())!.y).toBeGreaterThan(details.bottom);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    const statusCard = cards.nth(0);
    const chart = statusCard.getByRole("application", { name: "Certificate status" });
    const validSegment = chart.getByRole("button", { name: "Valid (2)", exact: true });
    await expect(validSegment).toBeVisible();
    await expect.poll(async () => (await validSegment.boundingBox())!.height).toBeGreaterThan(260);
    await expect(chart.getByRole("button", { name: "Expiring soon (1)", exact: true })).toBeVisible();
    await expect(chart.getByRole("button", { name: "Expired (1)", exact: true })).toBeVisible();
    await expect(statusCard.getByText("Pending", { exact: true })).toHaveCount(0);
    const certificateLegend = statusCard.getByRole("list", { name: "Certificate status legend" });
    await expect(certificateLegend.getByRole("listitem")).toHaveText(["Valid", "Expiring soon", "Expired"]);
    await expect(chart.locator("line").first()).toBeVisible();
    await expect(chart.getByText("2 certificates, 50%", { exact: true }).filter({ visible: true })).toBeVisible();
    await validSegment.hover();
    await expect(statusCard.getByText("Count", { exact: true })).toBeVisible();
    await expect(statusCard.getByText("2", { exact: true })).toBeVisible();
    await expect(statusCard.getByText("50%", { exact: true })).toBeVisible();
    await expect(statusCard.getByText("4 certificates with a validity status")).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(statusCard.getByText("Count", { exact: true })).toBeHidden();
    await chart.focus();
    await page.keyboard.press("Enter");
    const keyboardDetails = statusCard.getByRole("tooltip");
    await expect(keyboardDetails.getByText("2", { exact: true })).toBeVisible();
    await expect(keyboardDetails.getByText("50%", { exact: true })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(statusCard.getByText("Count", { exact: true })).toBeVisible();
    await expect(statusCard.getByText("1", { exact: true })).toBeVisible();
    await expect(statusCard.getByText("25%", { exact: true })).toBeVisible();

    const hours = cards.nth(2);
    const details = cards.nth(3);
    const reading = hours.locator(".overview-hours-chart__reading");
    const threshold = hours.locator(".overview-hours-chart__threshold");
    await expect(reading).toHaveCSS("background-color", "rgb(206, 63, 49)");
    await expect(threshold).toHaveCSS("background-color", "rgb(9, 114, 211)");
    const readingBounds = (await reading.boundingBox())!;
    const thresholdBounds = (await threshold.boundingBox())!;
    expect(readingBounds.x + readingBounds.width / 2).toBeCloseTo(thresholdBounds.x + thresholdBounds.width / 2, 0);
    expect(readingBounds.y + readingBounds.height).toBeCloseTo(thresholdBounds.y + thresholdBounds.height, 0);
    expect(readingBounds.height / thresholdBounds.height).toBeCloseTo(0.4);
    const hoursLegend = hours.getByRole("list", { name: "Operating hours legend" });
    const hoursTooltip = hours.getByRole("tooltip");
    const hoursDetails = hours.getByRole("button", { name: "Operating hours details" });
    await expect(hoursLegend.getByRole("listitem")).toHaveText(["Current reading", "Next service"]);
    await expect(hours.getByText("40 h", { exact: true })).toBeHidden();
    await expect(hours.getByText(/60 h remaining/)).toBeHidden();
    await reading.hover();
    await expect(hoursTooltip.getByText("40 h", { exact: true })).toBeVisible();
    await expect(hoursTooltip.getByText("100 h", { exact: true })).toBeVisible();
    await expect(hoursTooltip.getByText(/Compressor service.*60 h remaining/)).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(hoursTooltip).toBeHidden();
    await threshold.hover({ position: { x: 8, y: 8 } });
    await expect(hoursTooltip.getByText("100 h", { exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    await hoursDetails.focus();
    await expect(hoursTooltip.getByText("40 h", { exact: true })).toBeVisible();
    await hoursDetails.press("Escape");
    await expect(hoursTooltip).toBeHidden();
    await expect(details.getByText("Quarantined", { exact: false })).toBeVisible();
    await expect(details.getByText("Isolation test awaiting sign-off")).toBeVisible();
    await expect(details.getByText(project.project_name, { exact: true })).toBeVisible();
    await expect(details.getByText("Compressor on standby for workshop commissioning")).toBeVisible();
    await expect(datasheet).toHaveAttribute("href", datasheetUrl);
    await expect(details.getByText(/Compressor service due at 100 h or/)).toHaveCount(1);
    await expect(details.getByText("Components", { exact: true })).toHaveCount(0);
    await expect(details.getByRole("link", { name: /View work orders|View routine plans/ })).toHaveCount(0);

    await updateHours.click();
    const editor = page.getByRole("dialog", { name: "Update working hours" });
    await editor.getByRole("textbox", { name: "Working hours" }).fill("120");
    await editor.getByRole("textbox", { name: "Meter note" }).fill("Workshop test reading");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(details.getByText("Workshop test reading")).toBeVisible();
    await hoursDetails.focus();
    await expect(hoursTooltip.getByText("120 h", { exact: true })).toBeVisible();
    await expect(hoursTooltip.getByText("100 h", { exact: true })).toBeVisible();
    await expect.poll(async () => (await reading.boundingBox())!.height).toBeGreaterThan(thresholdBounds.height * 0.9);
    expect((await reading.boundingBox())!.height).toBeGreaterThan((await threshold.boundingBox())!.height);
    await expect(hoursTooltip.getByText(/Threshold reached/)).toBeVisible();
    await hoursDetails.press("Escape");
    await expect(hoursTooltip).toBeHidden();

    const certificates = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Certificate", exact: true }) });
    await expect(certificates.getByRole("link", { name: "Overview valid A", exact: true })).toHaveAttribute(
      "href", `/assets/${asset.asset_id}/components/${componentId}/certificates/${certificateIds[0]}`,
    );
    await certificates.getByRole("link", { name: "Overview valid A", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/certificates/${certificateIds[0]}$`));
    await expect(page.getByRole("heading", { name: "Overview valid A", exact: true })).toBeVisible();
  });

  test("filters and paginates open orders and resets to page one for each asset", async ({ page, request }) => {
    const token = await signInForMaintenance(page);
    const suffix = Date.now();
    const active = await requestMaintenance<Equipment>(request, token, "/asset", {
      method: "POST", status: 201, data: { name: `Overview repairs ${suffix}`, status: "ACTIVE" },
    });
    const inactive = await requestMaintenance<Equipment>(request, token, "/asset", {
      method: "POST", status: 201, data: { name: `Overview inactive ${suffix}`, status: "INACTIVE" },
    });
    const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date(Date.now() - 86_400_000));
    await requestMaintenance(request, token, "/maintenance/plans", {
      method: "POST", status: 201, data: {
        asset_id: active.asset_id, title: "Overdue calendar service", interval_months: 12,
        next_due_date: yesterday, active: true,
      },
    });
    await requestMaintenance(request, token, "/maintenance/plans", {
      method: "POST", status: 201, data: {
        asset_id: active.asset_id, title: "Calendar service due today", interval_months: 12, active: true,
        next_due_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date()),
      },
    });
    await raiseRepairs(request, token, active, "Active asset repair");
    await raiseRepairs(request, token, inactive, "Inactive asset repair");

    await page.reload();
    await selectAsset(page, active);
    const cards = page.locator(".ams-overview-grid > *");
    const work = cards.nth(1);
    const orders = work.getByRole("table", { name: "Open work orders" });
    const rows = orders.locator("tbody").getByRole("row");
    const next = work.getByRole("button", { name: "Next page" });
    const filter = work.getByRole("button", { name: /Filter work orders/ });
    await expect(cards.nth(0).getByText("No certificates with a validity status")).toBeVisible();
    await expect(cards.nth(2).getByText("No hour-based service threshold")).toBeVisible();
    await expect(cards.nth(3).getByText("Available", { exact: false })).toBeVisible();
    await expect(cards.nth(3).getByText("Overdue calendar service due at", { exact: false })).toBeVisible();
    await expect(filter).toContainText("All");
    await expect(rows).toHaveCount(5);
    const dueRow = rows.filter({ has: page.getByRole("link", { name: "Overdue calendar service", exact: true }) });
    await expect(dueRow.getByRole("cell").nth(1)).toHaveText(active.name);
    await expect(dueRow.getByRole("cell").nth(2)).toHaveText(
      await page.evaluate((date) => new Intl.DateTimeFormat(undefined, {
        month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
      }).format(new Date(date)), yesterday),
    );
    await next.click();
    await expect(rows).toHaveCount(3);
    await expect(orders.getByRole("link", { name: "Overdue calendar service" })).toHaveCount(0);
    await chooseOption(page, filter, "Maintenance only");
    await expect(rows).toHaveCount(5);
    await expect(orders.getByRole("link", { name: "Overdue calendar service" })).toBeVisible();
    await chooseOption(page, filter, "Overdue");
    await expect(rows).toHaveCount(1);
    await expect(orders.getByRole("link", { name: "Overdue calendar service" })).toBeVisible();
    await chooseOption(page, filter, "Due soon");
    await expect(rows).toHaveCount(1);
    await expect(orders.getByRole("link", { name: "Calendar service due today" })).toBeVisible();
    await chooseOption(page, filter, "All");
    await expect(rows).toHaveCount(5);
    await next.click();
    await expect(rows).toHaveCount(3);

    await selectAsset(page, inactive);
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText("Inactive asset repair");
    await expect(work.getByRole("link", { name: "View all open work orders" })).toHaveAttribute(
      "href", `/work-orders?asset_id=${inactive.asset_id}&open_only=true`,
    );
    const details = cards.nth(3);
    await expect(details.getByText("Inactive", { exact: true })).toBeVisible();
    await expect(details.getByText("Unassigned", { exact: true })).toBeVisible();
    await expect(details.getByText("No upcoming service scheduled")).toBeVisible();
    await expect(details.getByText("Description", { exact: true })).toHaveCount(0);
    await expect(details.getByRole("link", { name: "Open datasheet" })).toHaveCount(0);
    await expect(details.getByRole("img", { name: `Photo of ${inactive.name}` })).toHaveCount(0);
    await expect(cards.nth(2).getByText("Next service", { exact: true })).toHaveCount(0);
    await expect(cards.nth(2).getByText("No hour-based service threshold")).toBeVisible();
    const hours = cards.nth(2);
    await hours.getByRole("button", { name: "Operating hours details" }).focus();
    await expect(hours.getByRole("tooltip").getByText("0 h", { exact: true })).toBeVisible();
    await expect(hours.getByRole("tooltip").getByText("Next service", { exact: true })).toHaveCount(0);
  });
});
