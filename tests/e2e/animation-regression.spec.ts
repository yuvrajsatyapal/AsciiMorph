import { expect, test } from "@playwright/test";
test("switches saved animations without losing earlier work", async ({
  page,
}) => {
  await page.goto("/animate");
  await expect(
    page.getByRole("heading", { name: "Make your characters move." }),
  ).toBeVisible();
  await page
    .getByLabel("Animation name", { exact: true })
    .fill("Preserve this animation");
  await page
    .getByRole("button", { name: "New animation", exact: true })
    .click();
  await expect(page.getByLabel("Animation name", { exact: true })).toHaveValue(
    "Untitled animation",
  );
  const picker = page.getByRole("combobox", { name: "Saved animations" });
  await expect(
    picker.locator("option").filter({ hasText: "Preserve this animation" }),
  ).toHaveCount(1);
  const id = await picker
    .locator("option")
    .filter({ hasText: "Preserve this animation" })
    .getAttribute("value");
  await picker.selectOption(id!);
  await expect(page.getByLabel("Animation name", { exact: true })).toHaveValue(
    "Preserve this animation",
  );
});
test("keeps linked Studio frame and file actions inside the viewport", async ({
  page,
}) => {
  await page.goto("/animate");
  await page
    .getByRole("button", { name: "Edit selected frame in Studio" })
    .click();
  await expect(
    page.getByRole("button", { name: "Update animation frame", exact: true }),
  ).toBeVisible();
  const bounds = await page
    .locator(".editor-file-actions button")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: window.innerWidth };
      }),
    );
  for (const item of bounds) {
    expect(item.left).toBeGreaterThanOrEqual(0);
    expect(item.right).toBeLessThanOrEqual(item.width);
  }
  await page
    .getByRole("button", { name: "Update animation frame", exact: true })
    .click();
  await expect(page.locator(".editor-message")).toContainText(
    "Updated animation frame",
  );
  await page
    .getByRole("button", { name: "Back to animation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make your characters move." }),
  ).toBeVisible();
});
