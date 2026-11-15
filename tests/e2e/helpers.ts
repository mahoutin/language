import { expect, type Page } from "@playwright/test";

export const STORAGE_KEY = "everyday-english-v1";

/** Mirrors ANSWER_GUARD_MS in the app: a human never answers twice this fast. */
const HUMAN_PAUSE_MS = 450;

type SpeechOptions = {
  /** Every line finishes by itself shortly after it starts. Default: playback stays "on" until the test ends it. */
  autoEnd?: boolean;
  /** Every line fails to play (e.g. no voice installed). */
  fail?: boolean;
  /** The browser has no speech synthesis at all. */
  absent?: boolean;
  /** Names of the English voices this "browser" offers (default: one). */
  voices?: string[];
};

export type Spoken = {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: string | null;
};

/**
 * Deterministic stand-in for the browser's speech synthesis. It records every
 * line that was asked to play (language, rate, pitch, voice), and lets a test
 * decide when playback ends. It says nothing about real voice quality; that
 * needs a manual check.
 */
export async function stubSpeech(page: Page, options: SpeechOptions = {}) {
  await page.addInitScript((opts) => {
    type Voice = { name: string; lang: string };
    class Utterance {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      voice: Voice | null = null;
      ended = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const names = opts.voices ?? ["Voice A"];
    const voices: Voice[] = names.map((name) => ({ name, lang: "en-US" }));
    const spoken: Record<string, unknown>[] = [];
    const utterances: Utterance[] = [];
    const fake = {
      cancel() {},
      getVoices: () => voices,
      addEventListener() {},
      removeEventListener() {},
      speak(u: Utterance) {
        spoken.push({
          text: u.text,
          lang: u.lang,
          rate: u.rate,
          pitch: u.pitch,
          voice: u.voice?.name ?? null,
        });
        utterances.push(u);
        if (opts.fail)
          setTimeout(() => u.onerror?.({ error: "synthesis-failed" }), 0);
        else {
          setTimeout(() => u.onstart?.(), 0);
          if (opts.autoEnd)
            setTimeout(() => {
              u.ended = true;
              u.onend?.();
            }, 20);
        }
      },
    };
    Object.assign(window, {
      __spoken: spoken,
      __utterances: utterances,
      SpeechSynthesisUtterance: Utterance,
    });
    if (opts.absent) {
      Reflect.deleteProperty(window, "speechSynthesis");
    } else
      Object.defineProperty(window, "speechSynthesis", {
        value: fake,
        configurable: true,
      });
  }, options);
}

export const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken);

/** Calls the end-of-playback callback of one recorded utterance (if it is still attached). */
export const endSpeech = (page: Page, index: number) =>
  page.evaluate((i) => {
    const u = (
      window as unknown as {
        __utterances: { ended: boolean; onend: (() => void) | null }[];
      }
    ).__utterances[i];
    if (!u) return;
    u.ended = true;
    u.onend?.();
  }, index);

/** Lets every queued line finish, one after the other, like a real voice would. */
export async function finishSpeech(page: Page) {
  for (let round = 0; round < 40; round++) {
    const before = await page.evaluate(
      () =>
        (window as unknown as { __utterances: { ended: boolean }[] })
          .__utterances.length,
    );
    const pending = await page.evaluate(() => {
      const list = (
        window as unknown as {
          __utterances: { ended: boolean; onend: (() => void) | null }[];
        }
      ).__utterances;
      const next = list.findIndex((u) => !u.ended);
      if (next === -1) return false;
      list[next].ended = true;
      list[next].onend?.();
      return true;
    });
    await page.waitForTimeout(25);
    const after = await page.evaluate(
      () =>
        (window as unknown as { __utterances: unknown[] }).__utterances.length,
    );
    if (!pending && after === before) return;
  }
}

export const spokenText = async (page: Page) =>
  (await spoken(page)).map((line) => line.text);

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

/** « Répondre » after the pause a person would take (see HUMAN_PAUSE_MS). */
export async function submitAnswer(page: Page) {
  await page.waitForTimeout(HUMAN_PAUSE_MS);
  await answer(page).click();
}

/**
 * « Passer sans évaluation » appears on its own once the learner struggles;
 * otherwise it lives inside Aide. This finds it either way.
 */
export async function skipStep(page: Page) {
  const skip = page.getByRole("button", { name: "Passer sans évaluation" });
  if (!(await skip.isVisible()))
    await page.getByRole("button", { name: "Aide", exact: true }).click();
  await skip.click();
}

/** « J’ai besoin d’un moment » lives inside Aide. */
export async function askForAMoment(page: Page) {
  const moment = page.getByRole("button", { name: "J’ai besoin d’un moment" });
  if (!(await moment.isVisible()))
    await page.getByRole("button", { name: "Aide", exact: true }).click();
  await moment.click();
}

/**
 * One tap on an option, after the pause a person would take (the app ignores a
 * second answer inside 400 ms on purpose, so a double tap cannot commit twice).
 */
export async function pickAndAnswer(page: Page, option: string) {
  await page.waitForTimeout(HUMAN_PAUSE_MS);
  await page.getByRole("button", { name: option, exact: true }).click();
}

/** Typed answer: fill, then press « Répondre » after a human pause. */
export async function typeAndAnswer(page: Page, text: string) {
  await page.getByLabel("Votre réponse en anglais").fill(text);
  await submitAnswer(page);
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
