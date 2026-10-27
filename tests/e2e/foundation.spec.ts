import { expect, test } from "@playwright/test";
test("home opens the rebuilt effects Studio with a real rendered preview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("main", { name: "AsciiMorph Studio" })).toBeVisible();
  const preview = page.getByLabel("Rendered Characters preview", { exact: true });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    return canvas.width > 0 && canvas.height > 0 &&
      !!context?.getImageData(0, 0, canvas.width, canvas.height).data.some((v) => v !== 0);
  })).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
