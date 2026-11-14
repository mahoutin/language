import { test, expect } from "@playwright/test";
const key = "everyday-english-v1";
test("full lesson, resumption, export, repeat and erasure", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  await page
    .getByRole("radio", { name: "Introducing himself", exact: true })
    .click();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Continuer la leçon" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Qu’est-ce que cette personne vous demande ?",
    }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Your name", exact: true }).click();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await page.getByLabel("Votre réponse en anglais").fill("I'm Alex");
  await page.getByRole("button", { name: "Aide" }).click();
  await expect(page.getByLabel("Votre réponse en anglais")).toHaveValue(
    "I'm Alex",
  );
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await page.getByRole("radio", { name: "Maria", exact: true }).click();
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
    page.getByRole("heading", { name: "Qu’est-ce que cette personne fait ?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quitter" }).click();
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
  await expect(
    page.getByText("Aide en français", { exact: true }),
  ).toBeHidden();
  await page.getByRole("radio", { name: "Ordering food", exact: true }).click();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Essayez encore" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await expect(
    page.getByText("Aide en français", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Passer sans évaluation" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Qu’est-ce que cette personne vous demande ?",
    }),
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
  await page.getByRole("button", { name: "Caméra" }).click();
  await page.getByRole("button", { name: "Quitter" }).click();
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
  await page.getByRole("button", { name: "Micro", exact: true }).click();
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
  await page.getByRole("button", { name: "Quitter" }).click();
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
    page.getByRole("heading", {
      name: "Qu’est-ce que cette personne vous demande ?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Espace de stockage indisponible.", { exact: false }),
  ).toBeVisible();
});

test("bilingual guidance, captions, help and explicit pause stay independent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  const captions = page.getByRole("button", { name: "Sous-titres" });
  const help = page.getByRole("button", { name: "Aide", exact: true });
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  const english = page.getByText("Hello! My name is Daniel.", { exact: true });
  const french = page.getByText("Bonjour ! Je m’appelle Daniel.", {
    exact: true,
  });
  const context = page.getByText("Aide en français", { exact: true });
  await expect(english).toBeVisible();
  await expect(french).toBeVisible();
  await expect(context).toBeHidden();
  await captions.click();
  await expect(english).toBeHidden();
  await expect(french).toBeVisible();
  await help.click();
  await expect(context).toBeVisible();
  await expect(captions).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Portrait d’illustration")).toBeVisible();
  await expect(page.getByRole("button", { name: "Quitter" })).toBeInViewport();

  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(
    page.getByRole("heading", { name: "Séance en pause" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Qu’est-ce que cette personne fait ?" }),
  ).toBeVisible();
  await expect(page.getByText(/Essayez encore/)).toHaveCount(0);

  await page.getByRole("radio", { name: "Introducing himself" }).check();
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Séance en pause" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Caméra" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reprendre" })).toBeFocused();
  expect(
    await page.evaluate((storageKey) => localStorage.getItem(storageKey), key),
  ).toBeNull();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("radio", { name: "Introducing himself" }),
  ).toBeChecked();
  await expect(context).toBeVisible();
  await expect(english).toBeHidden();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Qu’est-ce que cette personne vous demande ?",
    }),
  ).toBeFocused();
  await expect(captions).toHaveAttribute("aria-pressed", "false");
});

test("camera denial leaves the guided lesson usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        Object.assign(window, { cameraRequested: true });
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  const camera = page.getByRole("button", { name: "Caméra", exact: true });
  await expect(camera).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("La caméra est éteinte.")).toBeVisible();
  expect(await page.evaluate(() => "cameraRequested" in window)).toBe(false);
  await camera.click();
  await expect(
    page.getByText(/Vous pouvez continuer sans caméra/),
  ).toBeVisible();
  await expect(camera).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("radio", { name: "Introducing himself" }).check();
  await page.getByRole("button", { name: "Vérifier ma réponse" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Qu’est-ce que cette personne vous demande ?",
    }),
  ).toBeVisible();
});

test("video-first shell and review screenshots at the two laptop sizes", async ({
  page,
}, testInfo) => {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Commencer la leçon" }).click();
    const portrait = page.locator('img[src$="/tutor-portrait.webp"]');
    await expect
      .poll(() =>
        portrait.evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(page.getByText("La caméra est éteinte.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Quitter" }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const overview = testInfo.outputPath(`tutor-${width}x${height}.png`);
    await page.screenshot({ path: overview, animations: "disabled" });
    await testInfo.attach(`Tutor ${width}×${height}`, {
      path: overview,
      contentType: "image/png",
    });
    if (width === 1280) {
      await page.getByRole("button", { name: "Aide", exact: true }).click();
      await expect(
        page.getByText("Aide en français", { exact: true }),
      ).toBeVisible();
      const help = testInfo.outputPath("tutor-french-help.png");
      await page.screenshot({ path: help, animations: "disabled" });
      await testInfo.attach("Tutor French help", {
        path: help,
        contentType: "image/png",
      });
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const paused = testInfo.outputPath("tutor-paused.png");
      await page.screenshot({ path: paused, animations: "disabled" });
      await testInfo.attach("Tutor paused", {
        path: paused,
        contentType: "image/png",
      });
    }
  }
});
