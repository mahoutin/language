import { test, expect } from "@playwright/test";
test("Pages export loads assets, preserves lessons and scopes offline support", async ({
  page,
  context,
  request,
}) => {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await page.goto("/language/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  for (const asset of [
    "tutor-portrait.webp",
    "tutor/self-view-head.svg",
    "tutor/self-view-shoulders.svg",
  ]) {
    expect((await request.get(`/language/assets/${asset}`)).ok()).toBe(true);
  }
  await expect(page.getByText("Portrait d’illustration")).toBeVisible();
  await expect(
    page.locator('img[src$="/tutor-portrait.webp"]'),
  ).toHaveJSProperty("complete", true);
  await page
    .getByRole("radio", { name: "Introducing himself", exact: true })
    .click();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Qu’est-ce que cette personne vous demande ?",
    }),
  ).toBeVisible();
  const manifest = await (
    await request.get("/language/manifest.webmanifest")
  ).json();
  expect(manifest.start_url).toBe("/language/");
  expect(manifest.scope).toBe("/language/");
  for (const icon of manifest.icons)
    expect((await request.get(icon.src)).ok()).toBe(true);
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  expect(new URL(scope).pathname).toBe("/language/");
  await page.reload();
  await page.getByRole("button", { name: "Continuer la leçon" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Qu’est-ce que cette personne vous demande ?",
    }),
  ).toBeVisible();
  expect(failures).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Vous êtes hors connexion." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Réessayer" })).toHaveAttribute(
    "href",
    "./",
  );
});
