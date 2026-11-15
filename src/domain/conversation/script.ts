import { activities, assess, type Activity } from "../curriculum";
import { buildRecap, type Recap } from "./summary";
import type {
  ConversationState,
  FeedbackKey,
  MediaState,
  NoticeKey,
  PedagogicalPhase,
  Segment,
  Speaker,
  Step,
  Strategy,
} from "./types";
import { turnOpenPhases } from "./types";

export type { Speaker } from "./types";

/**
 * Scripted (non-AI) tutoring content for the Phase 1B simulation.
 * The five curriculum activities and their ids are untouched; this file only
 * adds the conversational layer around them (French leads, repair content).
 *
 *   index  activity         conversation beat
 *   -1     (none)           orientation: French welcome
 *    0     listen-greeting  model (Daniel says hello) → meaning check
 *    1     listen-question  Daniel asks "What is your name?" → meaning check
 *    2     say-name         learner's turn: introduce yourself
 *    3     read-intro       Daniel introduces Maria → reading check
 *    4     transfer         Alex ("And you?") → introduce yourself in a changed situation
 *    5     (none)           recap
 *
 * Copy marks English phrases inside French text with <en>…</en>. One source
 * then drives three things that must agree: the on-screen lang="en" markup, the
 * spoken segments (so a French voice never reads English words), and the plain
 * text used for tests. Everything Daniel says aloud is also on screen.
 */

// ---------- marked text ----------

export type Span = { lang: "fr" | "en"; text: string };

export function parseMarked(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(/<en>([\s\S]*?)<\/en>/g)) {
    if (match.index > last)
      spans.push({ lang: "fr", text: text.slice(last, match.index) });
    spans.push({ lang: "en", text: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) spans.push({ lang: "fr", text: text.slice(last) });
  return spans;
}

export const plainText = (text: string): string =>
  parseMarked(text)
    .map((span) => span.text)
    .join("");

// ---------- speech ----------

export const EN_RATE = 0.83;
export const EN_SLOW_RATE = 0.65;
export const FR_RATE = 0.9;
export const FR_SLOW_RATE = 0.75;

const speakable = (text: string) =>
  text.replace(/[«»]/g, " ").replace(/\s+/g, " ").trim();

/** Marked text → spoken segments, each in its own language. English parts take `enRate`. */
export function toSegments(
  text: string,
  speaker: Speaker = "Daniel",
  enRate = EN_RATE,
  frRate = FR_RATE,
): Segment[] {
  const out: Segment[] = [];
  for (const span of parseMarked(text)) {
    const spoken = speakable(span.text);
    if (!/[\p{L}\p{N}]/u.test(spoken)) continue;
    out.push(
      span.lang === "en"
        ? { text: spoken, lang: "en-US", rate: enRate, speaker }
        : { text: spoken, lang: "fr-FR", rate: frRate, speaker: "Daniel" },
    );
  }
  return out;
}

const englishLine = (
  activity: Activity,
  speaker: Speaker,
  rate: number,
): Segment => ({ text: activity.prompt, lang: "en-US", rate, speaker });

// ---------- station copy ----------

type StationCopy = {
  speaker: Speaker;
  lead: string;
  instruction: string;
  context?: string;
  help: string;
  ack: string;
};

export const stations: Record<string, StationCopy> = {
  "listen-greeting": {
    speaker: "Daniel",
    lead: "Écoutez Daniel se présenter.",
    instruction: "Qu’est-ce que cette personne fait ?",
    context: "Contexte : Daniel rencontre quelqu’un pour la première fois.",
    help: "Daniel dit bonjour, puis donne son prénom. « <en>My name is…</en> » veut dire « Je m’appelle… ».",
    ack: "Oui, Daniel se présente. « <en>My name is…</en> » veut dire « Je m’appelle… ».",
  },
  "listen-question": {
    speaker: "Daniel",
    lead: "Daniel vous pose une question.",
    instruction: "Qu’est-ce que cette personne vous demande ?",
    help: "« <en>What is your name?</en> » veut dire « Comment vous appelez-vous ? ». On vous demande votre prénom.",
    ack: "Oui, il vous demande votre prénom. C’est bientôt à vous de répondre.",
  },
  "say-name": {
    speaker: "Daniel",
    lead: "C’est à vous.",
    instruction: "Présentez-vous en anglais, à l’oral ou à l’écrit.",
    help: "Répondez à la question avec votre prénom. Une phrase courte suffit. Vous pouvez écrire ou utiliser le micro.",
    ack: "Merci ! Je suis content de faire votre connaissance.",
  },
  "read-intro": {
    speaker: "Maria",
    lead: "Je vous présente Maria, une nouvelle personne. Lisez ce qu’elle dit.",
    instruction: "Qui se présente ?",
    help: "« <en>I am Maria</en> » veut dire « Je suis Maria ». « <en>Nice to meet you</en> » veut dire « Enchantée ».",
    ack: "Oui, c’est Maria. Voici maintenant une autre situation.",
  },
  transfer: {
    speaker: "Alex",
    lead: "Une nouvelle rencontre. Les mots changent, la situation reste la même.",
    instruction: "Présentez-vous en anglais sans recopier un exemple.",
    help: "Alex se présente, puis demande : « <en>And you?</en> », c’est-à-dire « Et vous ? ». Répondez avec votre prénom.",
    ack: "Merci ! C’était une situation différente.",
  },
};

export const welcomeCopy = {
  fresh: {
    title: "Bonjour, je suis Daniel.",
    body: "Aujourd’hui, nous allons apprendre à nous présenter en anglais, doucement et à votre rythme. Vous verrez l’anglais et le français. Vous pouvez demander de l’aide à tout moment. Rien ne démarre sans vous : le micro et la caméra restent éteints.",
  },
  resume: {
    title: "Content de vous revoir !",
    body: "Nous reprenons là où nous nous étions arrêtés. Vous verrez l’anglais et le français. Vous pouvez demander de l’aide à tout moment. Le micro et la caméra restent éteints.",
  },
  completed: {
    title: "Vous avez déjà terminé cette séance.",
    body: "Vous pouvez la refaire à votre rythme. Vos observations précédentes sont conservées.",
  },
} as const;

export const welcomeSpoken = (mode: "fresh" | "resume" | "completed") =>
  `${welcomeCopy[mode].title} ${welcomeCopy[mode].body}`;

// ---------- repair content ----------

type RepairContent = {
  example?: { model: string; frame: string };
  probe?: {
    question: string;
    options: readonly { label: string; correct: boolean }[];
    explanation: string;
  };
};

export const repairContent: Record<string, RepairContent> = {
  "say-name": {
    example: { model: "My name is Daniel.", frame: "My name is …" },
    probe: {
      question: "Quelle phrase répond à « <en>What is your name?</en> » ?",
      options: [
        { label: "Goodbye!", correct: false },
        { label: "My name is Sam.", correct: true },
        { label: "Yes, please.", correct: false },
      ],
      explanation:
        "On répond à « <en>What is your name?</en> » avec son prénom : « <en>My name is…</en> » ou « <en>I’m…</en> ».",
    },
  },
  transfer: {
    example: { model: "I’m Alex.", frame: "I’m …" },
    probe: {
      question:
        "Alex demande « <en>And you?</en> ». Quelle phrase répond le mieux ?",
      options: [
        { label: "Nice weather.", correct: false },
        { label: "Yes, please.", correct: false },
        { label: "I’m Sam.", correct: true },
      ],
      explanation:
        "« <en>And you?</en> » veut dire « Et vous ? ». On répond avec son prénom : « <en>I’m…</en> » ou « <en>My name is…</en> ».",
    },
  },
};

export type Ladder = readonly Strategy[];
const choiceLadder: Ladder = ["slow_with_french", "fewer_options"];
const speakLadder: Ladder = [
  "slow_with_french",
  "example_frame",
  "visual_probe",
];
export const ladderFor = (activity: Activity): Ladder =>
  activity.type === "choice" ? choiceLadder : speakLadder;

// ---------- option order (display only) ----------

function hash(text: string): number {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/**
 * Which "variant" of the reduced choice this is. It is deterministic (so it is
 * testable and stable while a turn is on screen) but not constant: it advances
 * with every earlier reduced-choice presentation in the session, starting from a
 * per-session offset. The correct answer therefore never sits in the same slot
 * in consecutive reduced-choice attempts.
 */
export function reducedVariant(state: ConversationState): number {
  const current = activities[state.activityIndex]?.id;
  let earlier = 0;
  for (const [id, progress] of Object.entries(state.progress))
    if (id !== current)
      earlier += progress.strategies.filter(
        (x) => x === "fewer_options",
      ).length;
  return earlier + hash(state.sessionId);
}

/**
 * Two options: the correct one plus one distractor. Both the slot of the correct
 * answer (parity of `variant`) and which distractor stays (rotating) vary.
 */
export function narrowedOptions(
  activity: Activity,
  variant: number,
): readonly number[] {
  if (activity.type !== "choice") return [];
  const correct = activity.options.findIndex((o) => o.correct);
  const distractors = activity.options.flatMap((o, i) =>
    o.correct ? [] : [i],
  );
  const distractor = distractors[Math.floor(variant / 2) % distractors.length];
  return variant % 2 === 0 ? [distractor, correct] : [correct, distractor];
}

/**
 * All options in a display order where the correct one is NOT always first (the
 * curriculum lists it first in every item, which is itself an answer cue). Only
 * the order on screen changes: responses are still the original option indices,
 * so `assess()` and the meaning of stored evidence are untouched.
 */
export function displayOrder(
  activity: Activity,
  activityIndex: number,
  sessionId: string,
): readonly number[] {
  if (activity.type !== "choice") return [];
  const correct = activity.options.findIndex((o) => o.correct);
  const others = activity.options.flatMap((o, i) => (o.correct ? [] : [i]));
  const ordinal = activities
    .slice(0, activityIndex)
    .filter((a) => a.type === "choice").length;
  const slot = (hash(sessionId) + ordinal) % activity.options.length;
  const order = [...others];
  order.splice(slot, 0, correct);
  return order;
}

// ---------- the learner's first name (session memory only) ----------

const notNames = new Set(
  (
    "fine good well ok okay happy sad tired sorry hungry ready here lost new " +
    "from not very a an the yes no hello hi thanks thank you me so sick late " +
    "cold hot afraid angry lucky back home great bad nice french english american"
  ).split(" "),
);

/**
 * A first name from a complete introduction ("I'm Alex", "My name is Marie").
 * Returns null when it is not clearly a name (for example "I am fine"). The
 * result lives in conversation state only: it is never written to learner
 * records, and it is cleared on exit and restart.
 */
export function extractName(raw: string): string | null {
  const text = raw.trim().replace(/’/g, "'");
  const match =
    /\b(?:my name is|i am|i'm|im)\s+([\p{L}][\p{L}\p{M}'-]*(?:\s+[\p{L}][\p{L}\p{M}'-]*)?)[.!?]?$/iu.exec(
      text,
    );
  if (!match) return null;
  const words = match[1].split(/\s+/);
  if (words.some((w) => notNames.has(w.toLowerCase()))) return null;
  const name = words
    .map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1))
    .join(" ");
  return name.length <= 30 ? name : null;
}

// ---------- response classification ----------

export type ResponseKind = "correct" | "incorrect" | "unclear" | "partial";

/**
 * Conversation-level reading of a typed/recognised reply. It reuses the
 * curriculum's own `assess` for "correct" so the meaning of existing evidence
 * does not change. A bare single word is `partial` (it may be a name): the tutor
 * acknowledges it and invites a short sentence. Partial and unclear replies are
 * NOT submitted to the learning engine, so they are never recorded as errors.
 */
export function classifyText(activity: Activity, raw: string): ResponseKind {
  const text = raw.trim();
  if (activity.type !== "speak") return "unclear";
  if (!/\p{L}{2,}/u.test(text)) return "unclear";
  if (assess(activity, text).correct) return "correct";
  if (!/\s/.test(text)) return "partial";
  return "incorrect";
}

// ---------- copy catalogue ----------

const withName = (name: string | null) => (name ? `, ${name}` : "");

/** Marked French (and English where quoted) text shown on screen. */
export function feedbackText(
  key: FeedbackKey,
  activityIndex: number,
  name: string | null = null,
): string {
  const activity = activities[activityIndex];
  // The acknowledgement shown on a new station is about the activity just completed.
  const previous = activities[activityIndex - 1];
  switch (key) {
    case "need_answer":
      return "Choisissez ou écrivez une réponse, ou demandez de l’aide.";
    case "unclear":
      return "Je n’ai pas bien compris. Vous pouvez réécouter, écrire autrement ou demander de l’aide.";
    case "partial":
      return "J’ai compris un mot, merci. Essayez avec une phrase courte, par exemple avec « <en>I’m</en> » ou « <en>My name is</en> ».";
    case "incorrect":
      return "Ce n’est pas encore ça, et ce n’est pas grave. Essayons autrement.";
    case "acknowledged":
      if (previous?.id === "say-name" && name)
        return `<en>Nice to meet you, ${name}.</en> Très bien, merci !`;
      if (previous?.id === "transfer")
        return `Merci${withName(name)} ! C’était une situation différente.`;
      return previous ? stations[previous.id].ack : "Merci.";
    case "skipped":
      return "D’accord, on continue. Cette étape est enregistrée sans évaluation.";
    case "thinking":
      return "Prenez votre temps. Je vous attends, sans chronomètre.";
    case "checkin":
      return "Je suis toujours là. Prenez votre temps. Vous pouvez réécouter ou demander de l’aide quand vous voulez.";
    case "no_speech":
      return "Je n’ai rien entendu, ce n’est pas un problème. Réessayez quand vous êtes prêt, ou écrivez votre réponse.";
    case "interrupted":
      return "D’accord, je m’arrête. Dites-moi ce dont vous avez besoin.";
    case "slow_with_french":
      return `Écoutons plus lentement. En français : « ${activity?.french ?? ""} »`;
    case "fewer_options":
      return "Essayons autrement : il ne reste que deux choix.";
    case "example_frame":
      return "Essayons autrement avec un exemple à compléter.";
    case "visual_probe":
      return "Essayons autrement : trouvez la bonne phrase. Ce n’est pas évalué.";
    case "probe_correct":
      return "Bien vu. Maintenant, essayez avec votre prénom.";
    case "probe_incorrect":
      return `Ce n’était pas celle-ci. ${activity ? (repairContent[activity.id]?.probe?.explanation ?? "") : ""} Essayez avec votre prénom.`;
    case "explain_and_offer_skip":
      return "Prenons ce moment pour comprendre, puis vous choisirez : réessayer, ou continuer sans évaluation.";
    case "offer_continue_again":
      return "Vous pouvez réessayer à votre rythme, ou continuer sans évaluation.";
    case "resumed":
      return "On reprend. Votre réponse est conservée.";
  }
}

/**
 * What Daniel says aloud for a feedback message. It is always the on-screen text
 * (or a shorter excerpt of it); a few messages stay text-only.
 */
export function feedbackSegments(
  key: FeedbackKey,
  activityIndex: number,
  name: string | null = null,
): Segment[] {
  const activity = activities[activityIndex];
  const speaker = activity ? stations[activity.id].speaker : "Daniel";
  switch (key) {
    case "need_answer":
    case "no_speech":
    case "interrupted":
    case "resumed":
      return [];
    case "checkin":
      return toSegments("Je suis toujours là. Prenez votre temps.");
    case "thinking":
      return toSegments("Prenez votre temps. Je vous attends.");
    case "slow_with_french":
      return activity
        ? [
            ...toSegments("Écoutons plus lentement."),
            englishLine(activity, speaker, EN_SLOW_RATE),
            ...toSegments(`En français : ${activity.french}`),
          ]
        : [];
    case "example_frame": {
      const example = activity
        ? repairContent[activity.id]?.example
        : undefined;
      return [
        ...toSegments(feedbackText(key, activityIndex, name)),
        ...(example
          ? [
              {
                text: example.model,
                lang: "en-US" as const,
                rate: EN_RATE,
                speaker: "Daniel" as const,
              },
            ]
          : []),
      ];
    }
    default:
      return toSegments(feedbackText(key, activityIndex, name));
  }
}

export const recapHeading = (name: string | null) =>
  `Merci pour cette séance${withName(name)} !`;

export function recapSegments(recap: Recap, name: string | null): Segment[] {
  const parts: string[] = [recapHeading(name)];
  if (recap.practised.length)
    parts.push(`Nous avons pratiqué : ${recap.practised.join(" ; ")}.`);
  if (recap.observed.length)
    parts.push(`Ce que j’ai observé : ${recap.observed.join(" ")}`);
  if (recap.next) parts.push(recap.next);
  parts.push(recap.caveat);
  return parts.flatMap((part) => toSegments(part));
}

/**
 * Everything Daniel says when a new step begins: the reaction to the previous
 * answer, a French lead-in, the English line (spoken by its own character), then
 * the French instruction. Nothing here plays before the learner has acted.
 */
export function entrySegments(
  state: ConversationState,
  feedback: FeedbackKey | null,
): Segment[] {
  const index = state.activityIndex;
  const out: Segment[] = feedback
    ? feedbackSegments(feedback, index, state.learnerName)
    : [];
  if (state.phase === "recap")
    return [...out, ...recapSegments(buildRecap(state), state.learnerName)];
  const activity = activities[index];
  const station = activity ? stations[activity.id] : undefined;
  if (!activity || !station) return out;
  out.push(...toSegments(station.lead));
  out.push(englishLine(activity, station.speaker, EN_RATE));
  if (state.phase !== "model") out.push(...toSegments(station.instruction));
  return out;
}

/** The single line "Écouter" / "Plus lentement" repeats. */
export function lineSegments(
  state: ConversationState,
  slow: boolean,
): Segment[] {
  if (state.phase === "orientation")
    return toSegments(
      welcomeSpoken(state.orientation),
      "Daniel",
      EN_RATE,
      slow ? FR_SLOW_RATE : FR_RATE,
    );
  if (state.phase === "recap")
    return recapSegments(buildRecap(state), state.learnerName);
  const activity = activities[state.activityIndex];
  if (!activity) return [];
  return [
    englishLine(
      activity,
      stations[activity.id].speaker,
      slow ? EN_SLOW_RATE : EN_RATE,
    ),
  ];
}

export function noticeText(key: NoticeKey): string {
  switch (key) {
    case "audio_unavailable":
      return "La lecture audio est indisponible. Vous pouvez lire le texte.";
    case "microphone_denied":
      return "Le microphone n’est pas autorisé. Vous pouvez écrire votre réponse.";
    case "microphone_unavailable":
      return "La reconnaissance vocale est indisponible. Vous pouvez écrire votre réponse.";
    case "commit_rejected":
      return "Votre réponse n’a pas pu être enregistrée. Réessayez, ou continuez.";
  }
}

export function statusText(state: ConversationState): string {
  if (state.lifecycle === "paused") return "Séance en pause";
  const labels: Record<MediaState, string> = {
    idle:
      state.phase === "orientation"
        ? "Prêt quand vous l’êtes"
        : "Daniel vous attend",
    tutor_speaking: "Daniel parle (voix simulée du navigateur)",
    listening_open: "À vous. Prenez votre temps.",
    learner_speaking: "Le micro écoute…",
    thinking_pause: "Vous réfléchissez : pas de souci",
    processing: "Je regarde votre réponse…",
    interrupted: "J’ai arrêté de parler",
    recovering: "Un petit souci : continuons autrement",
    ended: "Séance terminée",
  };
  const base = labels[state.media];
  return !state.prefs.voice && state.media !== "ended"
    ? `${base} · voix coupée`
    : base;
}

// ---------- structure helpers (pure) ----------

export const recapIndex = activities.length;

export function derivePhase(
  activityIndex: number,
  step: Step,
  strategy: ConversationState["repair"]["strategy"],
): PedagogicalPhase {
  if (activityIndex < 0) return "orientation";
  if (activityIndex >= recapIndex) return "recap";
  if (strategy === "visual_probe") return "diagnostic_probe";
  if (strategy) return "scaffolded_retry";
  if (activityIndex === 0 && step === "present") return "model";
  return activities[activityIndex].id === "transfer"
    ? "transfer_attempt"
    : "guided_attempt";
}

/** Media state when nothing is playing and nobody is mid-recovery. */
export function restingMedia(
  state: Pick<ConversationState, "phase">,
): MediaState {
  return turnOpenPhases.has(state.phase) ? "listening_open" : "idle";
}

export type OverlayKind =
  | "english_caption"
  | "french_support"
  | "context_note"
  | "replay_controls"
  | "visual_choice"
  | "french_help"
  | "feedback"
  | "device_notice";

/**
 * Only the instructional content relevant to the current moment. French support
 * is always present in Phase 1B (automatic fading belongs to a later phase).
 */
export function visibleOverlays(state: ConversationState): OverlayKind[] {
  const out: OverlayKind[] = [];
  if (state.lifecycle !== "active") return out;
  const activity = activities[state.activityIndex];
  out.push("french_support");
  if (
    state.phase !== "orientation" &&
    state.phase !== "recap" &&
    state.phase !== "diagnostic_probe"
  ) {
    if (state.prefs.captions) out.push("english_caption");
  }
  if (state.phase === "model" && stations[activity?.id ?? ""]?.context)
    out.push("context_note");
  if (state.phase !== "recap") out.push("replay_controls");
  if (
    state.phase === "diagnostic_probe" ||
    (activity?.type === "choice" && turnOpenPhases.has(state.phase))
  )
    out.push("visual_choice");
  if (
    state.helpOpen &&
    state.phase !== "orientation" &&
    state.phase !== "recap"
  )
    out.push("french_help");
  if (state.feedback) out.push("feedback");
  if (state.notice) out.push("device_notice");
  return out;
}

/** Option indices (into the activity's options) the learner can pick, in display order. */
export function visibleOptionIndices(
  state: ConversationState,
): readonly number[] {
  const activity = activities[state.activityIndex];
  if (!activity || activity.type !== "choice") return [];
  return state.repair.strategy === "fewer_options"
    ? narrowedOptions(activity, reducedVariant(state))
    : displayOrder(activity, state.activityIndex, state.sessionId);
}

/** Checks that no impossible combination of the three dimensions can exist. */
export function invariantViolations(state: ConversationState): string[] {
  const problems: string[] = [];
  const turnOpen = turnOpenPhases.has(state.phase);
  if ((state.media === "ended") !== (state.lifecycle === "ended"))
    problems.push("media ended must match lifecycle ended");
  if (state.lifecycle === "paused" && state.media !== "idle")
    problems.push("a paused session has no active media");
  if (state.media === "tutor_speaking" && state.output.id === null)
    problems.push("tutor_speaking needs a current output id");
  if (
    ["listening_open", "learner_speaking", "thinking_pause"].includes(
      state.media,
    ) &&
    !turnOpen
  )
    problems.push(`${state.media} requires an open learner turn`);
  if (state.media === "processing" && state.pending === null)
    problems.push("processing requires a pending commit");
  if (
    state.pending !== null &&
    state.media !== "processing" &&
    state.lifecycle === "active"
  )
    problems.push("a pending commit implies processing");
  if (
    state.phase !==
    derivePhase(state.activityIndex, state.step, state.repair.strategy)
  )
    problems.push("phase disagrees with activity/step/strategy");
  if (
    state.phase === "diagnostic_probe" &&
    state.repair.strategy !== "visual_probe"
  )
    problems.push("probe phase needs the probe strategy");
  if (state.activityIndex < -1 || state.activityIndex > recapIndex)
    problems.push("activity index out of range");
  if (
    state.phase !== "orientation" &&
    state.phase !== "recap" &&
    state.activityIndex < 0
  )
    problems.push("teaching phase without an activity");
  if (state.draft.choice !== null && state.draft.choice < 0)
    problems.push("negative choice");
  if (state.lifecycle === "ended" && state.learnerName !== null)
    problems.push("session-only name must be cleared when the session ends");
  if (!state.prefs.voice && state.output.id !== null)
    problems.push("muted voice cannot have a current output");
  return problems;
}
