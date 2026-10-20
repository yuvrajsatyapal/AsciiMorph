import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("library management and backup restoration preserve saved work", async ({
  page,
}) => {
  await page.goto("/studio?demo=orbit");
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace tools" })
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Projects & backups" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Orbit", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Organize", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("My saved orbit");
  await page.getByLabel("Folder", { exact: true }).last().fill("Space studies");
  await page.getByLabel("Tags (comma separated)").fill("space, gold");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My saved orbit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pin My saved orbit", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up entire library" }).click();
  const download = await pending;
  const file = (await download.path())!;
  const backup = JSON.parse(await readFile(file, "utf8"));
  expect(backup.kind).toBe("asciimorph-library");
  expect(backup.artworks[0].document.name).toBe("My saved orbit");
  expect(backup.artworks[0].snapshots.length).toBeGreaterThan(0);
  await page.getByLabel("Restore library backup").setInputFiles(file);
  await expect(page.getByRole("status")).toContainText("Restored 1 artworks");
  await expect(
    page.getByRole("heading", { name: "My saved orbit", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Delete", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My saved orbit", exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("global commands navigate and settings survive tool switches", async ({
  page,
}) => {
  await page.goto("/generate");
  await page.getByLabel("Seed", { exact: true }).fill("42");
  await page
    .getByRole("button", { name: "Search commands", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Search commands", exact: true })
    .fill("typography");
  // Search uses tool descriptions as well as labels.
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Search commands", exact: true })
    .fill("Type");
  await page.getByRole("dialog").getByRole("button", { name: /^Type/ }).click();
  await expect(page).toHaveURL(/\/type$/);
  await page
    .getByRole("navigation", { name: "Workspace tools" })
    .getByRole("link", { name: "Generate", exact: true })
    .click();
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("42");
});
test("mobile project dialogs expose errors and keep touch actions reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 390 });
  await page.goto("/studio?demo=orbit");
  await expect(page.getByTestId("ascii-canvas")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace tools" })
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await page.getByRole("button", { name: "Organize", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Organize project" });
  await dialog.getByLabel("Project name", { exact: true }).fill("   ");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Name must contain");
  const scroll = await dialog.evaluate((element) => ({
    client: element.clientHeight,
    scroll: element.scrollHeight,
    overflow: getComputedStyle(element).overflowY,
  }));
  expect(scroll.overflow).toBe("auto");
  await dialog.getByRole("button", { name: "Close settings" }).click();
  const targets = await page
    .locator(
      ".workspace-bar a,.workspace-bar button,.library-card-actions button",
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().height > 0)
        .map((element) => ({
          height: element.getBoundingClientRect().height,
          width: element.getBoundingClientRect().width,
        })),
    );
  expect(
    targets.every((target) => target.height >= 44 && target.width >= 44),
  ).toBe(true);
});
