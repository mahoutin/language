import { test, expect, type Page } from "@playwright/test";
import {
  beginConversation,
  endSpeech,
  finishSpeech,
  openLesson,
  pickAndAnswer,
  spoken,
  storedRecord,
  stubSpeech,
  submitAnswer,
  toLearnerTurn,
  typeAndAnswer,
} from "./helpers";

const status = (page: Page, text: string | RegExp) =>
  page.getByRole("status").filter({ hasText: text });
const field = (page: Page) => page.getByLabel("Votre réponse en anglais");
const dock = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const evidenceCount = async (page: Page) =>
  ((await storedRecord(page))?.evidence ?? []).length as number;

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Waits until Daniel has said everything he is going to say for the current step. */
async function settle(page: Page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const now = (await spoken(page)).length;
    if (now === last) return;
    last = now;
    await page.waitForTimeout(120);
  }
}

/** Every line spoken since `from` must be readable on screen (the text equivalent). */
async function expectSpokenIsOnScreen(page: Page, from: number) {
  await settle(page);
  const heard = (await spoken(page)).slice(from);
  const screen = normalise(await page.locator("body").innerText());
  for (const line of heard)
    expect(
      screen.includes(normalise(line.text)),
      `spoken but not on screen: “${line.text}”`,
    ).toBe(true);
  return (await spoken(page)).length;
}

test.describe("Daniel speaks French as well as English, and everything is also readable", () => {
  test("the whole conversation: every spoken line has a text equivalent, in the right language", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await openLesson(page);
    expect(await spoken(page)).toEqual([]); // nothing before the learner acts

    let mark = 0;
    await page.getByRole("button", { name: "Écouter le message" }).click();
    mark = await expectSpokenIsOnScreen(page, mark);
    await page.getByRole("button", { name: "Commencer", exact: true }).click();
    mark = await expectSpokenIsOnScreen(page, mark);
    await page.getByRole("button", { name: "Continuer", exact: true }).click();

    await pickAndAnswer(page, "Ordering food"); // repair 1: slower + French
    mark = await expectSpokenIsOnScreen(page, mark);
    await pickAndAnswer(page, "Ordering food"); // repair 2: two options
    mark = await expectSpokenIsOnScreen(page, mark);
    await pickAndAnswer(page, "Introducing himself"); // acknowledgement + next step
    mark = await expectSpokenIsOnScreen(page, mark);
    await pickAndAnswer(page, "Your name");
    mark = await expectSpokenIsOnScreen(page, mark);

    await typeAndAnswer(page, "Alex"); // a bare name: acknowledged aloud, not an error
    mark = await expectSpokenIsOnScreen(page, mark);
    for (let i = 0; i < 3; i++) {
      await typeAndAnswer(page, "Yes please"); // slower+French, frame, probe
      mark = await expectSpokenIsOnScreen(page, mark);
    }
    await pickAndAnswer(page, "Goodbye!"); // wrong probe: explained aloud
    mark = await expectSpokenIsOnScreen(page, mark);
    await typeAndAnswer(page, "My name is Alex");
    mark = await expectSpokenIsOnScreen(page, mark);
    await pickAndAnswer(page, "Maria");
    mark = await expectSpokenIsOnScreen(page, mark);
    await typeAndAnswer(page, "I'm Alex");
    await expect(
      page.getByRole("heading", { name: "Merci pour cette séance, Alex !" }),
    ).toBeVisible();
    mark = await expectSpokenIsOnScreen(page, mark);

    const heard = await spoken(page);
    // French is spoken by a French voice, English by an English one, never mixed.
    for (const line of heard) {
      if (line.lang === "en-US")
        expect(line.text).not.toMatch(
          /[éèêàçôûîï]|\b(votre|vous|nous|pour)\b/i,
        );
      else
        expect(line.text).not.toMatch(
          /Hello|What is|My name is|Nice to meet|Goodbye/,
        );
    }
    const french = heard.filter((l) => l.lang === "fr-FR").length;
    const english = heard.filter((l) => l.lang === "en-US").length;
    expect(french).toBeGreaterThan(15);
    expect(english).toBeGreaterThan(8);
    // The recap was spoken, in full.
    expect(heard.map((l) => l.text).join(" ")).toContain(
      "pas une preuve de maîtrise",
    );
  });

  test("the first name is used naturally, in English and in French", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await settle(page);
    const before = (await spoken(page)).length;
    await typeAndAnswer(page, "My name is zoltan");
    await expect(
      page.getByText("Nice to meet you, Zoltan.", { exact: false }),
    ).toBeVisible();
    await settle(page);
    const heard = (await spoken(page)).slice(before);
    expect(heard[0]).toMatchObject({
      text: "Nice to meet you, Zoltan.",
      lang: "en-US",
    });
    expect(heard[1]).toMatchObject({
      text: "Très bien, merci !",
      lang: "fr-FR",
    });
  });

  test("the first name is not stored, and is gone after exit and after reload", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await typeAndAnswer(page, "My name is Zoltan");
    await expect(page.getByText("Nice to meet you, Zoltan.")).toBeVisible();
    const everything = async () =>
      JSON.stringify([
        await storedRecord(page),
        await page.evaluate(() => ({ ...localStorage })),
        await page.evaluate(() => ({ ...sessionStorage })),
        await page.evaluate(() => document.cookie),
      ]);
    expect(await everything()).not.toContain("Zoltan");
    expect((await storedRecord(page)).evidence.at(-1)).not.toHaveProperty(
      "name",
    );

    // Exit → back in the lesson: a new session that knows nothing.
    await page.getByRole("button", { name: "Quitter" }).click();
    await page.getByRole("button", { name: /Continuer la leçon/ }).click();
    await page.getByRole("button", { name: "Commencer", exact: true }).click();
    await pickAndAnswer(page, "Maria");
    await typeAndAnswer(page, "I'm Sam");
    await expect(
      page.getByRole("heading", { name: "Merci pour cette séance, Sam !" }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain("Zoltan");

    // Reload → same: a new session (the one the learner typed last is not remembered).
    await page.reload();
    await page.getByRole("button", { name: /Revoir la séance/ }).click();
    await page.getByRole("button", { name: "Pratiquer à nouveau" }).click();
    expect(await page.locator("body").innerText()).not.toMatch(/Zoltan|Sam\b/);
    expect(await everything()).not.toMatch(/Zoltan|"Sam"/);
  });

  test("nothing that is not clearly a name is used as one", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await typeAndAnswer(page, "I am fine"); // accepted by the existing rubric, but not a name
    await expect(page.getByText(/Nice to meet you, Fine/)).toHaveCount(0);
    await expect(
      page.getByText("Oui, c’est Maria", { exact: false }),
    ).toHaveCount(0); // we are on Maria's step...
    await expect(page.getByText("Hello, I am Maria.")).toBeVisible();
    await expect(
      page.getByText("Merci ! Je suis content de faire votre connaissance."),
    ).toBeVisible();
  });
});

test.describe("mute, pause and interruption", () => {
  test("Voix: muting silences everything, keeps the text, and unmuting speaks again", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await openLesson(page);
    const voice = dock(page, "Voix");
    await expect(voice).toHaveAttribute("aria-pressed", "true");
    await voice.click();
    await expect(voice).toHaveAttribute("aria-pressed", "false");
    await expect(status(page, "voix coupée")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Écouter le message" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Commencer", exact: true }).click();
    await expect(page.getByText("Hello! My name is Daniel.")).toBeVisible(); // text equivalent stays
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await pickAndAnswer(page, "Ordering food"); // a repair: written, not spoken
    await expect(page.getByText("Écoutons plus lentement")).toBeVisible();
    await expect(page.getByRole("button", { name: "Écouter" })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Plus lentement" }),
    ).toBeDisabled();
    await page.waitForTimeout(300);
    expect(await spoken(page)).toEqual([]);

    await voice.click();
    await expect(voice).toHaveAttribute("aria-pressed", "true");
    expect(await spoken(page)).toEqual([]); // unmuting never speaks by itself
    await page.getByRole("button", { name: "Écouter" }).click();
    await settle(page);
    expect((await spoken(page)).at(-1)).toMatchObject({
      text: "Hello! My name is Daniel.",
    });
  });

  test("muting while Daniel is speaking stops him at once; the late end of that speech changes nothing", async ({
    page,
  }) => {
    await stubSpeech(page);
    await beginConversation(page);
    await expect(status(page, "Daniel parle")).toBeVisible();
    await dock(page, "Voix").click();
    await expect(status(page, "voix coupée")).toBeVisible();
    await expect(status(page, "Daniel parle")).toHaveCount(0);
    const count = (await spoken(page)).length;
    await endSpeech(page, 0); // the cancelled line reports late: ignored
    await finishSpeech(page);
    expect((await spoken(page)).length).toBe(count);
  });

  test("Pause stops the voice mid-sequence; Reprendre does not speak or restart anything", async ({
    page,
  }) => {
    await stubSpeech(page);
    await beginConversation(page);
    await expect(status(page, "Daniel parle")).toBeVisible();
    const count = (await spoken(page)).length;
    await dock(page, "Pause").click();
    await expect(
      page.getByRole("heading", { name: "Séance en pause" }),
    ).toBeVisible();
    await finishSpeech(page); // the cancelled queue must not continue with the English line
    await page.waitForTimeout(200);
    expect((await spoken(page)).length).toBe(count);
    await dock(page, "Reprendre").click();
    await page.waitForTimeout(200);
    expect((await spoken(page)).length).toBe(count);
    await expect(status(page, "Daniel vous attend")).toBeVisible();
  });

  test("interrupting during the French lead-in cancels the rest of the sequence", async ({
    page,
  }) => {
    await stubSpeech(page);
    await beginConversation(page);
    expect((await spoken(page)).map((l) => l.lang)).toEqual(["fr-FR"]);
    await page.getByRole("button", { name: "Arrêter la voix" }).click();
    await endSpeech(page, 0); // late callback of the interrupted line
    await finishSpeech(page);
    await page.waitForTimeout(150);
    expect((await spoken(page)).length).toBe(1); // the English line never played
    await expect(status(page, "J’ai arrêté de parler")).toBeVisible();
  });

  test("the quiet check-in is spoken once, then thinking time continues", async ({
    page,
  }) => {
    await stubSpeech(page);
    await page.clock.install();
    await toLearnerTurn(page);
    await finishSpeech(page);
    await expect(status(page, "À vous. Prenez votre temps.")).toBeVisible();
    await page.clock.fastForward(31_000);
    await expect(status(page, "Daniel parle")).toBeVisible();
    await finishSpeech(page);
    await expect(status(page, "Vous réfléchissez")).toBeVisible();
    const count = (await spoken(page)).length;
    await page.clock.fastForward(5 * 60_000);
    await finishSpeech(page);
    expect((await spoken(page)).length).toBe(count); // never repeated
    expect(await evidenceCount(page)).toBe(2); // and still no outcome
  });
});

test.describe("rapid actions cannot corrupt the conversation", () => {
  test("a double click on an option commits exactly one answer", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await beginConversation(page);
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await page.waitForTimeout(450);
    await page
      .getByRole("button", { name: "Introducing himself", exact: true })
      .dblclick();
    await expect(
      page.getByRole("heading", {
        name: "Qu’est-ce que cette personne vous demande ?",
      }),
    ).toBeVisible();
    await page.waitForTimeout(300);
    expect(await evidenceCount(page)).toBe(1);
    expect((await storedRecord(page)).index).toBe(1);
  });

  test("three fast clicks or a held Enter on Répondre record a single miss", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await field(page).fill("Yes please");
    await page.waitForTimeout(450);
    await page
      .getByRole("button", { name: "Répondre" })
      .click({ clickCount: 3 });
    await expect(page.getByText("Écoutons plus lentement")).toBeVisible();
    await page.waitForTimeout(300);
    expect(await evidenceCount(page)).toBe(3); // 2 earlier answers + exactly 1 miss
    // The extra clicks did not land on the help panel that opened under the pointer.
    await expect(status(page, "Vous réfléchissez")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Je suis prêt" }),
    ).toHaveCount(0);

    await page.waitForTimeout(450);
    await field(page).press("Enter");
    await field(page).press("Enter");
    await field(page).press("Enter");
    await page.waitForTimeout(300);
    expect(await evidenceCount(page)).toBe(4); // one more miss, not three
  });

  test("the very first answer is never mistaken for a repeat, even right after load", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await beginConversation(page);
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    // No human pause at all: nothing has been answered yet, so nothing can be a repeat.
    await page
      .getByRole("button", { name: "Introducing himself", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Qu’est-ce que cette personne vous demande ?",
      }),
    ).toBeVisible();
    expect(await evidenceCount(page)).toBe(1);
  });

  test("a double click on a flow button acts once, not on whatever moves under the pointer", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await beginConversation(page);
    // « Continuer » → the first option of the next step appears right under the pointer.
    await page
      .getByRole("button", { name: "Continuer", exact: true })
      .dblclick();
    await expect(
      page.getByRole("heading", {
        name: "Qu’est-ce que cette personne fait ?",
      }),
    ).toBeVisible();
    await page.waitForTimeout(300);
    expect(await evidenceCount(page)).toBe(0); // nothing was answered by the second click
  });

  test("a double click on « Je ne comprends pas » changes method once; on skip, skips once", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await page.getByRole("button", { name: "Je ne comprends pas" }).dblclick();
    await expect(page.getByText("Écoutons plus lentement")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(
      page.getByText("Essayons autrement avec un exemple à compléter."),
    ).toHaveCount(0); // not two methods in a row
    expect(await evidenceCount(page)).toBe(2);

    await page
      .getByRole("button", { name: "Passer sans évaluation" })
      .dblclick();
    await expect(page.getByText("Hello, I am Maria.")).toBeVisible();
    await page.waitForTimeout(300);
    // One skip recorded for « say-name »; the next step was not skipped as well.
    const record = await storedRecord(page);
    expect(record.evidence).toHaveLength(3);
    expect(record.evidence.at(-1)).toMatchObject({
      activityId: "say-name",
      reason: "Skipped without assessment",
    });
    expect(record.index).toBe(3);
  });

  test("holding Enter in the answer field answers once", async ({ page }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    // The new step moves focus to its heading; only then does the learner go to the field.
    await expect(
      page.getByRole("heading", {
        name: "Présentez-vous en anglais, à l’oral ou à l’écrit.",
      }),
    ).toBeFocused();
    await field(page).fill("Yes please");
    await field(page).focus();
    await page.waitForTimeout(450); // a person takes longer than the answer guard
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter"); // auto-repeat: ignored
    await page.keyboard.down("Enter");
    await page.keyboard.up("Enter");
    await page.waitForTimeout(400);
    expect(await evidenceCount(page)).toBe(3); // 2 earlier + exactly one miss
  });

  test("hammering replay, slower, Aide, Voix and Pause leaves a coherent session", async ({
    page,
  }) => {
    await stubSpeech(page);
    await toLearnerTurn(page);
    await field(page).fill("My name");
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Écouter", exact: true }).click();
      await page.getByRole("button", { name: "Plus lentement" }).click();
      await dock(page, "Aide").click();
    }
    await dock(page, "Pause").click();
    await dock(page, "Reprendre").click();
    await dock(page, "Voix").click();
    await dock(page, "Voix").click();
    await expect(field(page)).toHaveValue("My name");
    await finishSpeech(page);
    await expect(status(page, "À vous. Prenez votre temps.")).toBeVisible();
    expect(await evidenceCount(page)).toBe(2); // nothing here is an answer
    // And the conversation still works afterwards.
    await typeAndAnswer(page, "I'm Sam");
    await expect(page.getByText("Hello, I am Maria.")).toBeVisible();
  });
});

test.describe("Daniel, Maria and Alex", () => {
  test("with a single browser voice, nothing claims distinct voices", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true, voices: ["Only voice"] });
    await toLearnerTurn(page);
    await typeAndAnswer(page, "I'm Sam");
    await expect(page.getByText("Hello, I am Maria.")).toBeVisible();
    await expect(page.getByText("(même voix que Daniel)")).toBeVisible();
    await expect(page.getByText(/autre voix/)).toHaveCount(0);
    await settle(page);
    const maria = (await spoken(page)).find((l) =>
      l.text.startsWith("Hello, I am Maria"),
    )!;
    const daniel = (await spoken(page)).find((l) =>
      l.text.startsWith("Hello! What is your name"),
    )!;
    expect(maria.voice).toBe("Only voice");
    expect(maria.voice).toBe(daniel.voice); // honest: same voice
    expect(daniel.pitch).toBe(1);
    expect(maria.pitch).not.toBe(1); // only a pitch change is attempted
  });

  test("with several browser voices, each character gets its own and the interface says so", async ({
    page,
  }) => {
    await stubSpeech(page, {
      autoEnd: true,
      voices: ["Voice 1", "Voice 2", "Voice 3"],
    });
    await toLearnerTurn(page);
    await typeAndAnswer(page, "I'm Sam");
    await pickAndAnswer(page, "Maria");
    await expect(page.getByText("Hi there! I’m Alex. And you?")).toBeVisible();
    await expect(page.getByText("(autre voix du navigateur)")).toBeVisible();
    await settle(page);
    const heard = await spoken(page);
    const voiceOf = (start: string) =>
      heard.find((l) => l.text.startsWith(start))!.voice;
    expect(voiceOf("Hello! What is your name")).toBe("Voice 1");
    expect(voiceOf("Hello, I am Maria")).toBe("Voice 2");
    expect(voiceOf("Hi there")).toBe("Voice 3");
    expect(
      heard.filter((l) => l.lang === "fr-FR").every((l) => l.voice === null),
    ).toBe(true); // French is chosen by language, not by character
  });
});

test.describe("less dense, one tap, still fully reachable", () => {
  test("a meaning check shows the options and only the essential help", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await beginConversation(page);
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    const card = page.locator("section[aria-labelledby='tutor-activity']");
    await expect(card.getByRole("button")).toHaveCount(6); // 3 options + Écouter + Plus lentement + Je ne comprends pas
    await expect(card.getByRole("button", { name: "Répondre" })).toHaveCount(0);
    for (const hidden of ["Passer sans évaluation", "J’ai besoin d’un moment"])
      await expect(card.getByRole("button", { name: hidden })).toHaveCount(0);
    // Everything essential is still one click away, in Aide.
    await dock(page, "Aide").click();
    await expect(
      card.getByRole("button", { name: "J’ai besoin d’un moment" }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Passer sans évaluation" }),
    ).toBeVisible();
    await expect(card.getByText("Aide en français")).toBeVisible();
    // French and English support are still on screen.
    await expect(
      card.getByText("Bonjour ! Je m’appelle Daniel."),
    ).toBeVisible();
    await expect(card.getByText("Hello! My name is Daniel.")).toBeVisible();
  });

  test("skip appears on its own once the learner struggles", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    const skip = page.getByRole("button", { name: "Passer sans évaluation" });
    await expect(skip).toHaveCount(0);
    await typeAndAnswer(page, "Yes please");
    await expect(skip).toBeVisible();
  });

  test("an answer needs one tap on a choice step and a deliberate « Répondre » on a typed one", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await beginConversation(page);
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await pickAndAnswer(page, "Introducing himself");
    await expect(
      page.getByRole("heading", {
        name: "Qu’est-ce que cette personne vous demande ?",
      }),
    ).toBeFocused();
    await pickAndAnswer(page, "Your name");
    await field(page).fill("I'm Sam");
    expect(await evidenceCount(page)).toBe(2); // typing alone submits nothing
    await submitAnswer(page);
    await expect(page.getByText("Hello, I am Maria.")).toBeVisible();
  });

  test("the correct option is not always in the same place", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await beginConversation(page);
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    const slots: number[] = [];
    const slotOf = async (correct: string) => {
      const labels = await page
        .getByRole("group", { name: /Votre réponse/ })
        .getByRole("button")
        .allTextContents();
      slots.push(labels.indexOf(correct));
    };
    await slotOf("Introducing himself");
    await pickAndAnswer(page, "Introducing himself");
    await slotOf("Your name");
    await pickAndAnswer(page, "Your name");
    await typeAndAnswer(page, "I'm Sam");
    await slotOf("Maria");
    expect(slots).toHaveLength(3);
    expect(new Set(slots).size).toBe(3); // a different slot at each of the three checks
  });

  test("English inside French text is marked lang=en, and options are announced as English", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    await typeAndAnswer(page, "Alex"); // « J’ai compris un mot… “I’m” ou “My name is” »
    const feedback = page.locator("p", { hasText: "J’ai compris un mot" });
    await expect(feedback.locator("[lang='en']")).toHaveText([
      "I’m",
      "My name is",
    ]);
    for (let i = 0; i < 3; i++) await typeAndAnswer(page, "Yes please");
    await expect(
      page
        .getByRole("heading", { name: /Quelle phrase répond à/ })
        .locator("[lang='en']"),
    ).toHaveText("What is your name?");
    for (const option of ["Goodbye!", "My name is Sam.", "Yes, please."])
      await expect(
        page.getByRole("button", { name: option, exact: true }),
      ).toHaveAttribute("lang", "en");
  });

  test("everything is reachable and visibly focused with the keyboard alone", async ({
    page,
  }) => {
    await stubSpeech(page, { autoEnd: true });
    await toLearnerTurn(page);
    // Walk the whole tab order once: every stop has a name and a visible focus ring.
    const stops: string[] = [];
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          name: (
            el.getAttribute("aria-label") ||
            (el as HTMLInputElement).labels?.[0]?.textContent ||
            el.textContent ||
            ""
          ).trim(),
          outline: parseFloat(style.outlineWidth),
          outlineStyle: style.outlineStyle,
        };
      });
      if (!info) continue;
      expect(info.name, "focus stop without a name").not.toBe("");
      expect(info.outlineStyle).not.toBe("none");
      expect(info.outline).toBeGreaterThanOrEqual(2);
      stops.push(info.name);
    }
    const all = stops.join(" | ");
    for (const must of [
      "Voix",
      "Aide",
      "Pause",
      "Quitter",
      "Répondre",
      "Écouter",
    ])
      expect(all).toContain(must);
  });
});
