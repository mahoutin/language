import { activities, assess, type Activity } from "../curriculum";
import type {
  ConversationState,
  FeedbackKey,
  MediaState,
  NoticeKey,
  PedagogicalPhase,
  Step,
  Strategy,
} from "./types";
import { turnOpenPhases } from "./types";

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
 */

export type Speaker = "Daniel" | "Maria" | "Alex";

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
    help: "Daniel dit bonjour, puis donne son prénom. « My name is… » veut dire « Je m’appelle… ».",
    ack: "Oui, Daniel se présente. « My name is… » veut dire « Je m’appelle… ».",
  },
  "listen-question": {
    speaker: "Daniel",
    lead: "Daniel vous pose une question.",
    instruction: "Qu’est-ce que cette personne vous demande ?",
    help: "« What is your name? » veut dire « Comment vous appelez-vous ? ». On vous demande votre prénom.",
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
    help: "« I am Maria » veut dire « Je suis Maria ». « Nice to meet you » veut dire « Enchantée ».",
    ack: "Oui, c’est Maria. Voici maintenant une autre situation.",
  },
  transfer: {
    speaker: "Alex",
    lead: "Une nouvelle rencontre. Les mots changent, la situation reste la même.",
    instruction: "Présentez-vous en anglais sans recopier un exemple.",
    help: "Alex se présente, puis demande : « And you? », c’est-à-dire « Et vous ? ». Répondez avec votre prénom.",
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
      question: "Quelle phrase répond à « What is your name? » ?",
      options: [
        { label: "Goodbye!", correct: false },
        { label: "My name is Sam.", correct: true },
        { label: "Yes, please.", correct: false },
      ],
      explanation:
        "On répond à « What is your name? » avec son prénom : « My name is… » ou « I’m… ».",
    },
  },
  transfer: {
    example: { model: "I’m Alex.", frame: "I’m …" },
    probe: {
      question: "Alex demande « And you? ». Quelle phrase répond le mieux ?",
      options: [
        { label: "Nice weather.", correct: false },
        { label: "Yes, please.", correct: false },
        { label: "I’m Sam.", correct: true },
      ],
      explanation:
        "« And you? » veut dire « Et vous ? ». On répond avec son prénom : « I’m… » ou « My name is… ».",
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

export function feedbackText(key: FeedbackKey, activityIndex: number): string {
  const activity = activities[activityIndex];
  // The acknowledgement shown on a new station is about the activity just completed.
  const previous = activities[activityIndex - 1];
  const copy = previous ? stations[previous.id] : undefined;
  switch (key) {
    case "need_answer":
      return "Choisissez ou écrivez une réponse, ou demandez de l’aide.";
    case "unclear":
      return "Je n’ai pas bien compris. Vous pouvez réécouter, écrire autrement ou demander de l’aide.";
    case "partial":
      return "J’ai compris un mot, merci. Essayez avec une phrase courte, par exemple avec « I’m » ou « My name is ».";
    case "incorrect":
      return "Ce n’est pas encore ça, et ce n’est pas grave. Essayons autrement.";
    case "acknowledged":
      return copy?.ack ?? "Merci.";
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
  return labels[state.media];
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

/** Option indices (into the activity's options) the learner can currently pick. */
export function visibleOptionIndices(
  state: ConversationState,
): readonly number[] {
  const activity = activities[state.activityIndex];
  if (!activity || activity.type !== "choice") return [];
  return state.repair.strategy === "fewer_options"
    ? narrowedOptions(activity, reducedVariant(state))
    : activity.options.map((_, i) => i);
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
  return problems;
}
