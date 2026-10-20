import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("transformed image retains its source, layer effects save, and revision reopens settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/convert");
  await page
    .getByLabel("Browse image")
    .setInputFiles(path.resolve("tests/fixtures/gradient.png"));
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  await page.getByLabel("Visual preset").selectOption("Detailed portrait");
  await page.getByText("Crop source (percent)", { exact: true }).click();
  await page.getByLabel("Crop width", { exact: true }).fill("50");
  await page.getByLabel("Rotate source", { exact: true }).selectOption("90");
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const doc = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(doc.conversion.settings.rotation).toBe(90);
  expect(doc.conversion.settings.crop.width).toBe(0.5);
  expect(typeof doc.conversion.source.data).toBe("string");
  await page
    .getByRole("button", { name: "Edit in Studio", exact: true })
    .click();
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Add layer", exact: true }).click();
  await page.getByLabel("Layer blend mode").selectOption("multiply");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page.getByLabel("Layer group")).not.toHaveValue("");
  await page
    .getByRole("button", { name: "Revise original conversion", exact: true })
    .click();
  await expect(page).toHaveURL(/convert/);
  await expect(page.getByTestId("conversion-status")).toContainText("Ready");
  await expect(page.getByLabel("Rotate source")).toHaveValue("90");
  await page.getByText("Crop source (percent)", { exact: true }).click();
  await expect(page.getByLabel("Crop width", { exact: true })).toHaveValue(
    "50",
  );
});
