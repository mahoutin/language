import { test, expect } from "@playwright/test";
const key = "everyday-english-v1";
test("full lesson, resumption, export, repeat and erasure", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  await page
    .getByRole("button", { name: "Introducing himself", exact: true })
    .click();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Continuer la leçon" }).click();
  await expect(
    page.getByRole("heading", { name: "Understand a question" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Your name", exact: true }).click();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await page.getByLabel("Votre réponse en anglais").fill("I'm Alex");
  await page.getByRole("button", { name: "J’ai besoin d’aide" }).click();
  await expect(page.getByLabel("Votre réponse en anglais")).toHaveValue(
    "I'm Alex",
  );
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await page.getByRole("button", { name: "Maria", exact: true }).click();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await page
    .getByLabel("Votre réponse en anglais")
    .fill("Hello, my name is Alex");
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await expect(
    page.getByRole("heading", { name: "Première séance terminée !" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pratiquer à nouveau" }).click();
  await expect(
    page.getByRole("heading", { name: "Listen to a greeting" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mes progrès", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Télécharger mes progrès", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "english-learning-record.json",
  );
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(stored.evidence).toHaveLength(5);
  expect(JSON.stringify(stored)).not.toContain("Alex");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Effacer mes progrès" }).click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
});
test("scaffolding, skip and invalid saved record protection", async ({
  page,
}) => {
  await page.addInitScript((key) => localStorage.setItem(key, "{broken"), key);
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "Les données enregistrées" }),
  ).toContainText("ne seront pas écrasées");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  await page.getByLabel("Traduction française").uncheck();
  await page
    .getByRole("button", { name: "Ordering food", exact: true })
    .click();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await expect(page.getByRole("status")).toContainText([
    "Essayez encore",
    "La caméra est éteinte.",
  ]);
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await expect(page.getByLabel("Traduction française")).toBeChecked();
  await page.getByRole("button", { name: "Passer sans évaluation" }).click();
  await expect(
    page.getByRole("heading", { name: "Understand a question" }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    "{broken",
  );
});
test("camera permission resolving after navigation stops every track", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        new Promise((resolve) => {
          Object.assign(window, {
            resolveCamera: () =>
              resolve({
                getTracks: () => [
                  {
                    stop: () => {
                      Object.assign(window, { trackStopped: true });
                    },
                  },
                ],
              }),
          });
        }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  await page.getByRole("button", { name: "Activer la caméra" }).click();
  await page.getByRole("button", { name: "Mon parcours" }).click();
  await page.evaluate(() =>
    (window as unknown as { resolveCamera: () => void }).resolveCamera(),
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { trackStopped: boolean }).trackStopped,
    ),
  ).toBe(true);
});
test("manifest, privacy headers, offline fallback and cache allowlist", async ({
  page,
  context,
  request,
}) => {
  const response = await request.get("/");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.icons).toHaveLength(2);
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    await fetch("/api/private-example");
  });
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("everyday-english-public-v2");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cached.sort()).toEqual(
    [
      "/assets/icon-192.png",
      "/assets/icon-512.png",
      "/assets/icon.svg",
      "/offline.html",
    ].sort(),
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Vous êtes hors connexion." }),
  ).toBeVisible();
});
test("mobile navigation stays labeled and fits the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Pratiquer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pratiquer", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("microphone requires consent and aborts when leaving an exercise", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class Recognition {
      start() {
        Object.assign(window, { micStarted: true });
      }
      abort() {
        Object.assign(window, { micStopped: true });
      }
    }
    Object.assign(window, { SpeechRecognition: Recognition });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  await page.getByRole("button", { name: "Passer sans évaluation" }).click();
  await page.getByRole("button", { name: "Passer sans évaluation" }).click();
  await expect(
    page.getByRole("button", { name: "Parler en anglais" }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "J’accepte la reconnaissance vocale du navigateur pour cet exercice.",
    )
    .check();
  await page.getByRole("button", { name: "Parler en anglais" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { micStarted: boolean }).micStarted,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Mon parcours" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { micStopped: boolean }).micStopped,
    ),
  ).toBe(true);
});

test("storage failure permits practice without a crash", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  await page.getByRole("button", { name: "Passer sans évaluation" }).click();
  await expect(
    page.getByRole("heading", { name: "Understand a question" }),
  ).toBeVisible();
  await expect(
    page.getByText("Espace de stockage indisponible.", { exact: false }),
  ).toBeVisible();
});
