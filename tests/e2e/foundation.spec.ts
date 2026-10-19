import { expect, test } from "@playwright/test";
test("homepage is healthy, responsive, and leads into the studio", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Your Imagination. In Characters." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole("link", { name: "Launch Studio", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(
    page.getByText("AsciiMorph", { exact: true }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
