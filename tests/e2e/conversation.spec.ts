import { test, expect, type Page } from "@playwright/test";
import {
  answer,
  beginConversation,
  endSpeech,
  openLesson,
  pickAndAnswer,
  spoken,
  storedRecord,
  stubSpeech,
  toLearnerTurn,
  STORAGE_KEY,
} from "./helpers";

const status = (page: Page, text: string | RegExp) =>
  page.getByRole("status").filter({ hasText: text });
const field = (page: Page) => page.getByLabel("Votre réponse en anglais");
const evidenceCount = async (page: Page) =>
  ((await storedRecord(page))?.evidence ?? []).length as number;

/** Counts every request for a camera or microphone so "nothing on load" is provable. */
async function watchDevices(page: Page) {
  await page.addInitScript(() => {
    const counts = { camera: 0, speech: 0 };
    Object.assign(window, { __devices: counts });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => {
        counts.camera++;
        return Promise.reject(new DOMException("Denied", "NotAllowedError"));
      },
    });
    class Recognition {
      start() {
        counts.speech++;
      }
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: Recognition });
  });
}
const devices = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __devices: { camera: number; speech: number } })
        .__devices,
  );

test.describe("arrival and orientation", () => {
  test("the French welcome appears without any device prompt or automatic audio", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await watchDevices(page);
    await openLesson(page);
    await expect(
      page.getByText("le micro et la caméra restent éteints", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(status(page, "Prêt quand vous l’êtes")).toBeVisible();
    await expect(page.getByRole("button", { name: "Aide" })).toBeDisabled();
    expect(await spoken(page)).toEqual([]);
    expect(await devices(page)).toEqual({ camera: 0, speech: 0 });
    // The learner can ask to hear the welcome, in French.
    await page.getByRole("button", { name: "Écouter le message" }).click();
    expect((await spoken(page))[0]).toMatchObject({ lang: "fr-FR" });
    expect((await spoken(page))[0].text).toContain("Bonjour, je suis Daniel.");
    expect(await devices(page)).toEqual({ camera: 0, speech: 0 });
  });

  test("the simulation is labelled honestly", async ({ page }) => {
    await openLesson(page);
    await expect(page.getByText("Séance guidée · simulation")).toBeVisible();
    await expect(page.getByText("Portrait d’illustration")).toBeVisible();
    await expect(page.getByText("dialogue préparé")).toBeVisible();
  });
});

test.describe("one scripted conversation", () => {
  test("welcome → model → meaning checks → repair → learner turn → transfer → recap", async ({
    page,
  }, testInfo) => {
    await stubSpeech(page);
    await beginConversation(page);

    // Model: English + French + context from the start; Daniel's line plays.
    await expect(page.getByText("Hello! My name is Daniel.")).toBeVisible();
    await expect(
      page.getByText("Bonjour ! Je m’appelle Daniel."),
    ).toBeVisible();
    await expect(page.getByText("Daniel rencontre quelqu’un")).toBeVisible();
    await expect(
      status(page, "Daniel parle (voix simulée du navigateur)"),
    ).toBeVisible();
    expect((await spoken(page)).at(-1)).toMatchObject({
      text: "Hello! My name is Daniel.",
      lang: "en-US",
    });
    await page.getByRole("button", { name: "Continuer", exact: true }).click();

    // First meaning check: one miss, then the right answer.
    await pickAndAnswer(page, "Ordering food");
    await expect(page.getByText("Écoutons plus lentement")).toBeVisible();
    expect((await spoken(page)).at(-1)).toMatchObject({ rate: 0.65 });
    await pickAndAnswer(page, "Introducing himself");

    // Daniel asks the question, with an acknowledgement of the previous step.
    await expect(
      page.getByText("Oui, Daniel se présente.", { exact: false }),
    ).toBeVisible();
    expect((await spoken(page)).at(-1)).toMatchObject({
      text: "What is your name?",
    });
    await pickAndAnswer(page, "Your name");
    // Daniel's line finishes; the turn is then open for the learner.
    await endSpeech(page, (await spoken(page)).length - 1);

    // The learner's turn.
    await expect(
      page.getByRole("heading", {
        name: "Présentez-vous en anglais, à l’oral ou à l’écrit.",
      }),
    ).toBeVisible();
    await expect(status(page, "À vous. Prenez votre temps.")).toBeVisible();
    await expect(page.getByText("My name is …")).toHaveCount(0); // no answer on display

    // Repair ladder: three genuinely different methods.
    await field(page).fill("Yes please");
    await answer(page).click();
    await expect(page.getByText("Écoutons plus lentement")).toBeVisible();
    await expect(
      page.getByText("Aide en français", { exact: true }),
    ).toBeVisible();
    await answer(page).click();
    await expect(
      page.getByText("Essayons autrement avec un exemple à compléter."),
    ).toBeVisible();
    await expect(page.getByText("My name is …")).toBeVisible();
    await answer(page).click();
    await expect(
      page.getByRole("heading", { name: /Quelle phrase répond à/ }),
    ).toBeVisible();
    const probe = testInfo.outputPath("tutor-probe.png");
    await page.screenshot({ path: probe, animations: "disabled" });
    await testInfo.attach("Diagnostic probe", {
      path: probe,
      contentType: "image/png",
    });
    const evidenceBeforeProbe = await evidenceCount(page);
    await pickAndAnswer(page, "My name is Sam.");
    expect(await evidenceCount(page)).toBe(evidenceBeforeProbe); // the probe is not an attempt
    await expect(page.getByText("Bien vu.", { exact: false })).toBeVisible();
    await field(page).fill("My name is Alex");
    await answer(page).click();

    // Transfer: a new speaker and wording, no example on display, empty field.
    await expect(
      page.getByText("Je vous présente Maria", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Hello, I am Maria. Nice to meet you."),
    ).toBeVisible();
    await pickAndAnswer(page, "Maria");
    await expect(
      page.getByText("Une nouvelle rencontre.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Présentez-vous en anglais sans recopier un exemple.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Hi there! I’m Alex. And you?")).toBeVisible();
    await expect(field(page)).toHaveValue("");
    await expect(page.getByText("My name is …")).toHaveCount(0);
    await field(page).fill("I'm Alex");
    await answer(page).click();

    // Natural conclusion: careful recap, no mastery claim.
    await expect(
      page.getByRole("heading", { name: "Merci pour cette séance !" }),
    ).toBeVisible();
    await expect(page.getByText("Nous avons pratiqué")).toBeVisible();
    await expect(
      page.getByText("Plus difficile : vous présenter"),
    ).toBeVisible();
    await expect(
      page.getByText("pas une preuve de maîtrise", { exact: false }),
    ).toBeVisible();
    const recap = testInfo.outputPath("tutor-recap.png");
    await page.screenshot({ path: recap, animations: "disabled" });
    await testInfo.attach("Recap", { path: recap, contentType: "image/png" });

    // The learner record is the existing five-activity record, extended only by observations.
    const record = await storedRecord(page);
    expect(record.completed).toBe(true);
    expect(record.attempts["say-name"]).toBe(4); // 3 misses + 1 success; the probe is not counted
    expect(
      record.evidence.map((e: { activityId: string }) => e.activityId),
    ).toEqual([
      "listen-greeting",
      "listen-greeting",
      "listen-question",
      "say-name",
      "say-name",
      "say-name",
      "say-name",
      "read-intro",
      "transfer",
    ]);
    expect(
      record.evidence.every((e: { assisted: boolean }) => e.assisted),
    ).toBe(true);
    expect(JSON.stringify(record)).not.toContain("Alex");
    await page.getByRole("button", { name: "Terminer la séance" }).click();
    await expect(
      page.getByRole("heading", { name: /Bonjour !/ }),
    ).toBeVisible();
  });

  test("a bare name or an unclear reply is acknowledged, not recorded as an error", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    const before = await evidenceCount(page);
    await field(page).fill("Alex");
    await answer(page).click();
    await expect(
      page.getByText("J’ai compris un mot", { exact: false }),
    ).toBeVisible();
    await field(page).fill("12 !!");
    await answer(page).click();
    // A second non-answer changes the method instead of repeating the same message.
    await expect(page.getByText("Écoutons plus lentement")).toBeVisible();
    expect(await evidenceCount(page)).toBe(before);
    // An actual wrong answer IS an observation; a skip is its own outcome.
    await field(page).fill("Yes please");
    await answer(page).click();
    expect(await evidenceCount(page)).toBe(before + 1);
    await page.getByRole("button", { name: "Passer sans évaluation" }).click();
    const last = (await storedRecord(page)).evidence.at(-1);
    expect(last).toMatchObject({
      activityId: "say-name",
      confidence: "none",
      reason: "Skipped without assessment",
    });
  });

  test("shorter functional answers the curriculum accepts finish the turn", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await field(page).fill("I'm Alex");
    await answer(page).click();
    await expect(
      page.getByText("Hello, I am Maria. Nice to meet you."),
    ).toBeVisible();
  });
});

test.describe("thinking time and explicit pause", () => {
  test("silence is never an outcome: a quiet check-in only offers help", async ({
    page,
  }) => {
    await stubSpeech(page); // Daniel's line plays until the test ends it
    await page.clock.install();
    await toLearnerTurn(page);
    const before = await storedRecord(page);
    await expect(status(page, "Daniel parle")).toBeVisible();
    await endSpeech(page, (await spoken(page)).length - 1);
    // The turn is now open and the 30 s check-in timer is armed.
    await expect(status(page, "À vous. Prenez votre temps.")).toBeVisible();
    await page.clock.fastForward(29_000);
    await expect(status(page, "À vous. Prenez votre temps.")).toBeVisible();
    await page.clock.fastForward(2_000);
    await expect(
      status(page, "Vous réfléchissez : pas de souci"),
    ).toBeVisible();
    await expect(
      page.getByText("Je suis toujours là.", { exact: false }),
    ).toBeVisible();
    await page.clock.fastForward(10 * 60_000);
    // Still the same turn; no error, no repair, no pause, nothing recorded.
    await expect(
      page.getByRole("heading", {
        name: "Présentez-vous en anglais, à l’oral ou à l’écrit.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Essayons autrement|Ce n’est pas encore/),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Séance en pause" }),
    ).toHaveCount(0);
    expect(await storedRecord(page)).toEqual(before);
    // Typing resumes the turn on its own.
    await field(page).fill("My name");
    await expect(status(page, "À vous. Prenez votre temps.")).toBeVisible();
  });

  test("asking for a moment is distinct from the explicit pause", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await field(page).fill("My na");
    await page.getByRole("button", { name: "J’ai besoin d’un moment" }).click();
    await expect(
      status(page, "Vous réfléchissez : pas de souci"),
    ).toBeVisible();
    await expect(field(page)).toBeVisible(); // thinking leaves the surface in place
    await page.getByRole("button", { name: "Je suis prêt" }).click();
    await expect(status(page, "À vous. Prenez votre temps.")).toBeVisible();

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Séance en pause" }),
    ).toBeVisible();
    await expect(field(page)).toHaveCount(0); // pause replaces the surface; devices are off
    await expect(
      page.getByRole("button", { name: "Micro", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Reprendre" }).click();
    await expect(field(page)).toHaveValue("My na"); // context preserved
    expect((await storedRecord(page)).evidence).toHaveLength(2);
  });
});

test.describe("interruption, replay and help", () => {
  test("interrupting stops the tutor and late audio callbacks cannot change anything", async ({
    page,
  }) => {
    await stubSpeech(page);
    await beginConversation(page);
    await expect(status(page, "Daniel parle")).toBeVisible();
    await page.getByRole("button", { name: "Arrêter la voix" }).click();
    await expect(status(page, "J’ai arrêté de parler")).toBeVisible();
    await expect(
      page.getByText("D’accord, je m’arrête.", { exact: false }),
    ).toBeVisible();
    await endSpeech(page, 0); // the interrupted line reports its end late
    await expect(status(page, "J’ai arrêté de parler")).toBeVisible();

    // Slower, then normal: each is a new output; an old one cannot end the new one.
    await page.getByRole("button", { name: "Plus lentement" }).click();
    await expect(status(page, "Daniel parle")).toBeVisible();
    await page.getByRole("button", { name: "Écouter", exact: true }).click();
    const lines = await spoken(page);
    expect(lines.slice(-2).map((l) => l.rate)).toEqual([0.65, 0.83]);
    await endSpeech(page, 1); // the slow line's late end
    await expect(status(page, "Daniel parle")).toBeVisible();
    await endSpeech(page, 2);
    await expect(status(page, "Daniel vous attend")).toBeVisible();
  });

  test("stopping the voice shows the French explanation; closing it keeps the draft", async ({
    page,
  }) => {
    await stubSpeech(page);
    await toLearnerTurn(page);
    await field(page).fill("My name is Al");
    await page.getByRole("button", { name: "Écouter", exact: true }).click();
    await expect(status(page, "Daniel parle")).toBeVisible();
    await page.getByRole("button", { name: "Arrêter la voix" }).click();
    // Interruption offers the explanation (Figma 13:86 → 13:99) and keeps the turn.
    await expect(
      page.getByText("Aide en français", { exact: true }),
    ).toBeVisible();
    await expect(field(page)).toHaveValue("My name is Al");
    await page.getByRole("button", { name: "Aide", exact: true }).click();
    await expect(
      page.getByText("Aide en français", { exact: true }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Aide", exact: true }).click();
    await expect(
      page.getByText("Aide en français", { exact: true }),
    ).toBeVisible();
    await expect(field(page)).toHaveValue("My name is Al");
    // Help and replay are not answers.
    expect(await evidenceCount(page)).toBe(2);
    await expect(page.getByText(/Ce n’est pas encore/)).toHaveCount(0);
  });

  test("“Je ne comprends pas” changes the method without recording an error", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await page.getByRole("button", { name: "Je ne comprends pas" }).click();
    await expect(page.getByText("Écoutons plus lentement")).toBeVisible();
    await page.getByRole("button", { name: "Je ne comprends pas" }).click();
    await expect(page.getByText("My name is …")).toBeVisible();
    expect(await evidenceCount(page)).toBe(2);
  });

  test("Captions and Help are separate and French is never hidden", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await beginConversation(page);
    await page.getByRole("button", { name: "Sous-titres" }).click();
    await expect(
      page.getByText("Hello! My name is Daniel.", { exact: true }),
    ).toBeHidden();
    await expect(
      page.getByText("Bonjour ! Je m’appelle Daniel."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Aide", exact: true }).click();
    await expect(
      page.getByText("Aide en français", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Bonjour ! Je m’appelle Daniel."),
    ).toBeVisible();
  });
});

test.describe("devices and fallbacks", () => {
  test("no speech synthesis, or a failing voice, leaves a readable text path", async ({
    browser,
  }) => {
    for (const options of [{ absent: true }, { fail: true }]) {
      const page = await browser.newPage();
      await stubSpeech(page, options);
      await beginConversation(page);
      await expect(
        page.getByText("La lecture audio est indisponible.", { exact: false }),
      ).toBeVisible();
      await expect(status(page, "Daniel vous attend")).toBeVisible();
      await page
        .getByRole("button", { name: "Continuer", exact: true })
        .click();
      await pickAndAnswer(page, "Introducing himself");
      await expect(
        page.getByRole("heading", {
          name: "Qu’est-ce que cette personne vous demande ?",
        }),
      ).toBeVisible();
      await page.close();
    }
  });

  test("microphone unavailable: the lesson continues by typing", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, "SpeechRecognition");
      Reflect.deleteProperty(window, "webkitSpeechRecognition");
    });
    await toLearnerTurn(page);
    await page.getByRole("button", { name: "Micro", exact: true }).click();
    await page
      .getByLabel(
        "J’accepte la reconnaissance vocale du navigateur pour cet exercice.",
      )
      .check();
    await page.getByRole("button", { name: "Parler en anglais" }).click();
    await expect(
      page.getByText("Reconnaissance vocale indisponible", { exact: false }),
    ).toBeVisible();
    await field(page).fill("My name is Alex");
    await answer(page).click();
    await expect(
      page.getByText("Hello, I am Maria. Nice to meet you."),
    ).toBeVisible();
  });

  test("microphone permission denied: one clear message, typing focused, nothing recorded", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await page.addInitScript(() => {
      class Recognition {
        onerror: ((event: { error: string }) => void) | null = null;
        start() {
          setTimeout(() => this.onerror?.({ error: "not-allowed" }), 0);
        }
        abort() {}
      }
      Object.assign(window, { SpeechRecognition: Recognition });
    });
    await toLearnerTurn(page);
    const before = await evidenceCount(page);
    await page.getByRole("button", { name: "Micro", exact: true }).click();
    await page
      .getByLabel(
        "J’accepte la reconnaissance vocale du navigateur pour cet exercice.",
      )
      .check();
    await page.getByRole("button", { name: "Parler en anglais" }).click();
    await expect(status(page, "Un petit souci")).toBeVisible();
    await expect(
      page.getByText("Le microphone n’est pas autorisé.", { exact: false }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Écrire ma réponse" }).click();
    await expect(field(page)).toBeFocused();
    expect(await evidenceCount(page)).toBe(before);
    await field(page).fill("I'm Alex");
    await answer(page).click();
    await expect(
      page.getByText("Hello, I am Maria. Nice to meet you."),
    ).toBeVisible();
  });

  test("typed and recognised answers are different observations", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await page.addInitScript(() => {
      class Recognition {
        onresult:
          | ((event: {
              results: { [i: number]: { [j: number]: { transcript: string } } };
            }) => void)
          | null = null;
        onend: (() => void) | null = null;
        start() {
          setTimeout(() => {
            this.onresult?.({
              results: { 0: { 0: { transcript: "My name is Alex" } } },
            });
            this.onend?.();
          }, 0);
        }
        abort() {}
      }
      Object.assign(window, { SpeechRecognition: Recognition });
    });
    await toLearnerTurn(page);
    await page.getByRole("button", { name: "Micro", exact: true }).click();
    await page
      .getByLabel(
        "J’accepte la reconnaissance vocale du navigateur pour cet exercice.",
      )
      .check();
    await page.getByRole("button", { name: "Parler en anglais" }).click();
    await expect(field(page)).toHaveValue("My name is Alex");
    await expect(
      page.getByText("Vérifiez le texte reconnu", { exact: false }),
    ).toBeVisible();
    await answer(page).click();
    await pickAndAnswer(page, "Maria");
    await field(page).fill("I'm Alex");
    await answer(page).click();
    const speak = (await storedRecord(page)).evidence.filter(
      (e: { responseType: string }) => e.responseType === "speak",
    );
    expect(speak.map((e: { modality: string }) => e.modality)).toEqual([
      "browser-recognition",
      "typed",
    ]);
  });

  test("camera denial never blocks the conversation", async ({ page }) => {
    await stubSpeech(page, { autoEnd: true });
    await watchDevices(page);
    await toLearnerTurn(page);
    expect((await devices(page)).camera).toBe(0);
    await page.getByRole("button", { name: "Caméra", exact: true }).click();
    await expect(
      page.getByText(/Vous pouvez continuer sans caméra/),
    ).toBeVisible();
    await field(page).fill("My name is Alex");
    await answer(page).click();
    await expect(
      page.getByText("Hello, I am Maria. Nice to meet you."),
    ).toBeVisible();
  });
});

test.describe("learner records and curriculum are protected", () => {
  test("a saved original record resumes at the right step and is only extended", async ({
    page,
  }) => {
    const original = {
      version: "prea1-introductions-1.0",
      index: 3,
      attempts: { "listen-greeting": 1, "listen-question": 1, "say-name": 1 },
      evidence: [
        ["listen-greeting", "listening-greetings", "choice"],
        ["listen-question", "listening-name-question", "choice"],
        ["say-name", "speaking-introduction", "speak"],
      ].map(([activityId, skill, responseType]) => ({
        activityId,
        skill,
        correct: true,
        confidence: responseType === "speak" ? "low" : "medium",
        reason: "kept",
        assisted: true,
        at: "2026-11-13T12:00:00.000Z",
        responseType,
      })),
      completed: false,
      updated: "2026-11-13T12:00:00.000Z",
    };
    await stubSpeech(page, { autoEnd: true });
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify(original)],
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Continuer la leçon" }).click();
    await expect(
      page.getByRole("heading", { name: "Content de vous revoir !" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Commencer", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Qui se présente ?" }),
    ).toBeVisible();
    await pickAndAnswer(page, "Maria");
    const record = await storedRecord(page);
    expect(record.evidence.slice(0, 3)).toEqual(original.evidence);
    expect(record.evidence).toHaveLength(4);
    expect(record.index).toBe(4);
  });

  test("a completed record offers to practise again and keeps its history", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await field(page).fill("I'm Alex");
    await answer(page).click();
    await pickAndAnswer(page, "Maria");
    await field(page).fill("I'm Alex");
    await answer(page).click();
    const done = await storedRecord(page);
    await page.getByRole("button", { name: "Terminer la séance" }).click();
    await page.getByRole("button", { name: /Revoir la séance/ }).click();
    await expect(
      page.getByRole("heading", {
        name: "Vous avez déjà terminé cette séance.",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pratiquer à nouveau" }).click();
    await expect(
      page.getByRole("heading", { name: "Écoutez Daniel se présenter." }),
    ).toBeVisible();
    const again = await storedRecord(page);
    expect(again.index).toBe(0);
    expect(again.evidence).toEqual(done.evidence);
  });
});

test.describe("keyboard and accessible names", () => {
  test("a meaning check can be answered with the keyboard alone", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await beginConversation(page);
    await page.getByRole("button", { name: "Continuer", exact: true }).focus();
    await page.keyboard.press("Enter");
    // The new step takes focus on its heading; the learner then tabs onward.
    await expect(
      page.getByRole("heading", {
        name: "Qu’est-ce que cette personne fait ?",
      }),
    ).toBeFocused();
    await page.getByRole("radio", { name: "Introducing himself" }).focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("radio", { name: "Introducing himself" }),
    ).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(answer(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", {
        name: "Qu’est-ce que cette personne vous demande ?",
      }),
    ).toBeFocused();
  });

  test("every control has an accessible name and a visible focus ring", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    const unnamed = await page
      .locator("main button")
      .evaluateAll(
        (els) =>
          els.filter(
            (el) =>
              !(el.textContent ?? "").trim() && !el.getAttribute("aria-label"),
          ).length,
      );
    expect(unnamed).toBe(0);
    for (const name of [
      "Micro",
      "Caméra",
      "Sous-titres",
      "Aide",
      "Pause",
      "Quitter",
    ])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return {
        width: parseFloat(style.outlineWidth),
        style: style.outlineStyle,
      };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
    // English phrases are marked up as English inside the French interface.
    expect(await page.locator("[lang='en']").count()).toBeGreaterThan(0);
  });
});

test.describe("layout and review screenshots", () => {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [390, 844],
  ] as const) {
    test(`every state fits and keeps the controls reachable at ${width}×${height}`, async ({
      page,
    }, testInfo) => {
      await stubSpeech(page);
      await page.setViewportSize({ width, height });
      const shot = async (name: string) => {
        const path = testInfo.outputPath(
          `tutor-${width}x${height}-${name}.png`,
        );
        await page.screenshot({ path, animations: "disabled" });
        await testInfo.attach(`${name} ${width}×${height}`, {
          path,
          contentType: "image/png",
        });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(width);
        await expect(
          page.getByRole("button", { name: "Quitter" }),
        ).toBeInViewport();
        await expect(
          page.getByRole("button", { name: /Pause|Reprendre/ }),
        ).toBeInViewport();
        if (width >= 1280)
          expect(
            await page.evaluate(() => document.documentElement.scrollHeight),
          ).toBe(height);
      };
      await openLesson(page);
      await shot("01-orientation");
      await page
        .getByRole("button", { name: "Commencer", exact: true })
        .click();
      await shot("02-model");
      await page.getByRole("button", { name: "Aide", exact: true }).click();
      await shot("03-model-help");
      await page.getByRole("button", { name: "Aide", exact: true }).click();
      await page
        .getByRole("button", { name: "Continuer", exact: true })
        .click();
      await pickAndAnswer(page, "Ordering food");
      await shot("04-repair-slow-french");
      await pickAndAnswer(page, "Ordering food");
      await shot("05-repair-two-options");
      await pickAndAnswer(page, "Introducing himself");
      await pickAndAnswer(page, "Your name");
      await shot("06-learner-turn");
      await page
        .getByRole("button", { name: "J’ai besoin d’un moment" })
        .click();
      await shot("07-thinking-pause");
      for (let i = 0; i < 3; i++) {
        await field(page).fill("Yes please");
        await answer(page).click();
      }
      await shot("08-diagnostic-probe");
      await pickAndAnswer(page, "My name is Sam.");
      await shot("09-supported-retry-with-help");
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await shot("10-explicit-pause");
      await page.getByRole("button", { name: "Reprendre" }).click();
      await field(page).fill("My name is Alex");
      await answer(page).click();
      await pickAndAnswer(page, "Maria");
      await shot("11-transfer");
      await field(page).fill("I'm Alex");
      await answer(page).click();
      await shot("12-recap");
    });
  }
});
