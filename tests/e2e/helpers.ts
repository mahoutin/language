import { expect, type Page } from "@playwright/test";

export const STORAGE_KEY = "everyday-english-v1";

type SpeechOptions = {
  /** Playback finishes by itself shortly after it starts. Default: stays "playing" until the test ends it. */
  autoEnd?: boolean;
  /** Every line fails to play (e.g. no voice installed). */
  fail?: boolean;
  /** The browser has no speech synthesis at all. */
  absent?: boolean;
};

/**
 * Deterministic stand-in for the browser's speech synthesis. It records every
 * line that was asked to play, and lets a test decide when playback ends. It
 * says nothing about real voice quality; that needs a manual check.
 */
export async function stubSpeech(page: Page, options: SpeechOptions = {}) {
  await page.addInitScript((opts) => {
    type Handlers = {
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error: string }) => void) | null;
    };
    class Utterance implements Handlers {
      text: string;
      lang = "";
      rate = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const spoken: { text: string; lang: string; rate: number }[] = [];
    const utterances: Utterance[] = [];
    const fake = {
      cancel() {},
      speak(u: Utterance) {
        spoken.push({ text: u.text, lang: u.lang, rate: u.rate });
        utterances.push(u);
        if (opts.fail)
          setTimeout(() => u.onerror?.({ error: "synthesis-failed" }), 0);
        else {
          setTimeout(() => u.onstart?.(), 0);
          if (opts.autoEnd) setTimeout(() => u.onend?.(), 20);
        }
      },
    };
    Object.assign(window, {
      __spoken: spoken,
      __utterances: utterances,
      SpeechSynthesisUtterance: Utterance,
    });
    if (opts.absent) {
      try {
        // @ts-expect-error simulating a browser without speech synthesis
        delete window.speechSynthesis;
      } catch {
        /* ignore */
      }
      Object.defineProperty(window, "speechSynthesis", {
        value: undefined,
        configurable: true,
      });
      // `"speechSynthesis" in window` must be false for the app to detect absence.
      Reflect.deleteProperty(window, "speechSynthesis");
    } else
      Object.defineProperty(window, "speechSynthesis", {
        value: fake,
        configurable: true,
      });
  }, options);
}

export const spoken = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __spoken: { text: string; lang: string; rate: number }[];
        }
      ).__spoken,
  );

/** Calls the end-of-playback callback of one recorded utterance (if it is still attached). */
export const endSpeech = (page: Page, index: number) =>
  page.evaluate(
    (i) =>
      (
        window as unknown as {
          __utterances: { onend: (() => void) | null }[];
        }
      ).__utterances[i]?.onend?.(),
    index,
  );

export const storedRecord = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);

/** Home → lesson → orientation. Nothing has been requested from the browser yet. */
export async function openLesson(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer la leçon" }).click();
  await expect(
    page.getByRole("heading", { name: "Bonjour, je suis Daniel." }),
  ).toBeVisible();
}

/** Orientation → Daniel's model line. */
export async function beginConversation(page: Page) {
  await openLesson(page);
  await page.getByRole("button", { name: "Commencer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Écoutez Daniel se présenter." }),
  ).toBeVisible();
}

export const answer = (page: Page) =>
  page.getByRole("button", { name: "Répondre" });

export async function pickAndAnswer(page: Page, option: string) {
  await page.getByRole("radio", { name: option, exact: true }).check();
  await answer(page).click();
}

/** Model → meaning check → question → ... up to the learner's own turn. */
export async function toLearnerTurn(page: Page) {
  await beginConversation(page);
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await pickAndAnswer(page, "Introducing himself");
  await pickAndAnswer(page, "Your name");
  await expect(
    page.getByRole("heading", {
      name: "Présentez-vous en anglais, à l’oral ou à l’écrit.",
    }),
  ).toBeVisible();
}
