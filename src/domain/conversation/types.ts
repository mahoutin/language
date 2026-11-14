import type { LessonAction } from "../learner";

/**
 * Phase 1B conversation contracts.
 *
 * Three independent dimensions describe one moment of the session:
 *  - MediaState      what the audio / turn-taking channel is doing
 *  - PedagogicalPhase what the tutor is teaching
 *  - overlays        which instructional content is visible (derived, see selectors)
 * plus a Lifecycle (active / paused / ended) that is deliberately NOT a media state:
 * an explicit session pause is different from the learner thinking.
 *
 * Nothing here is authoritative for learner progress. The conversation only
 * proposes `commit` effects; src/domain/learner.ts decides what they mean.
 */

export type MediaState =
  | "idle" // nothing playing, no learner turn open (orientation, tutor-only steps, recap)
  | "tutor_speaking" // simulated tutor audio is actually playing (browser TTS)
  | "listening_open" // the learner's turn is open (any modality); NOT proof the mic is on
  | "learner_speaking" // browser speech recognition is actively listening
  | "thinking_pause" // the learner is taking time; carries no outcome
  | "processing" // an answer is being committed to the learning engine
  | "interrupted" // tutor audio was stopped by the learner
  | "recovering" // a device failed; the learner chooses how to continue
  | "ended";

export type PedagogicalPhase =
  | "orientation"
  | "model"
  | "guided_attempt"
  | "diagnostic_probe"
  | "scaffolded_retry"
  | "transfer_attempt"
  | "recap";

export type Lifecycle = "active" | "paused" | "ended";

export type Step = "present" | "attempt";

/** Deterministic repair methods. Each one differs from the previous in kind, not wording. */
export type Strategy =
  | "slow_with_french" // slower audio + French meaning of the line
  | "fewer_options" // choice activities: two options instead of three
  | "example_frame" // speak activities: a sentence frame with a gap
  | "visual_probe" // speak activities: a non-scored recognition choice
  | "probe_followup" // retry after the probe, with the frame and an explanation
  | "explain_and_offer_skip"; // explain in French; offer to continue without evaluation

export type DraftSource = "typed" | "recognition";

export type Draft = {
  text: string;
  choice: number | null;
  source: DraftSource;
};

export type FeedbackKey =
  | "need_answer"
  | "unclear"
  | "partial"
  | "incorrect"
  | "acknowledged"
  | "skipped"
  | "thinking"
  | "checkin"
  | "no_speech"
  | "interrupted"
  | "slow_with_french"
  | "fewer_options"
  | "example_frame"
  | "visual_probe"
  | "probe_correct"
  | "probe_incorrect"
  | "explain_and_offer_skip"
  | "offer_continue_again"
  | "resumed";

export type NoticeKey =
  | "audio_unavailable"
  | "microphone_denied"
  | "microphone_unavailable"
  | "commit_rejected";

export type ActivityProgress = {
  attempts: number; // answers submitted to the learning engine
  incorrect: number;
  unclear: number; // not submitted: nothing readable (symbols, a single letter)
  partial: number; // not submitted: a bare word such as a name; understandable, never an error
  helpRequests: number; // replay, slower, "I don't understand"; never counted as errors
  strategies: Strategy[];
  silenceCheckins: number;
  correct: boolean;
  skipped: boolean;
};

export type OutputRef = { id: string | null; rate: number };

export type ConversationState = {
  readonly sessionId: string;
  readonly turnId: number;
  readonly outputSeq: number;
  readonly lifecycle: Lifecycle;
  readonly pausedFrom: MediaState | null;
  readonly media: MediaState;
  readonly phase: PedagogicalPhase;
  /** -1 = orientation, activities.length = recap. */
  readonly activityIndex: number;
  readonly step: Step;
  readonly orientation: "fresh" | "resume" | "completed";
  readonly startIndex: number;
  readonly draft: Draft;
  readonly helpOpen: boolean;
  readonly prefs: { readonly captions: boolean };
  readonly feedback: FeedbackKey | null;
  readonly notice: NoticeKey | null;
  readonly repair: {
    readonly rung: number;
    readonly strategy: Strategy | null;
    readonly probeCorrect: boolean | null;
  };
  readonly unclearStreak: number;
  readonly output: OutputRef;
  readonly pending: {
    readonly activityId: string;
    readonly skip: boolean;
  } | null;
  readonly progress: Readonly<Record<string, ActivityProgress>>;
  readonly seen: readonly string[];
};

type Envelope = { eventId: string; sessionId: string; turnId: number };

export type ConversationEvent = Envelope &
  (
    | { type: "begin" }
    | { type: "restart" }
    | { type: "continue" }
    | {
        type: "draft_changed";
        text?: string;
        choice?: number | null;
        source?: DraftSource;
      }
    | { type: "submit" }
    | { type: "skip" }
    | {
        type: "commit_result";
        activityId: string;
        advanced: boolean;
        correct: boolean;
        rejected: boolean;
      }
    | { type: "replay"; slow: boolean }
    | { type: "stuck" }
    | { type: "help_opened" }
    | { type: "help_dismissed" }
    | { type: "captions_toggled" }
    | { type: "think_started" }
    | { type: "resume_turn" }
    | { type: "silence_checkin" }
    | { type: "interrupt" }
    | { type: "audio_started"; outputId: string }
    | { type: "audio_ended"; outputId: string }
    | { type: "audio_failed"; outputId: string }
    | { type: "recognition_started" }
    | { type: "recognition_ended" }
    | {
        type: "recognition_failed";
        reason: "denied" | "unavailable" | "no_speech" | "error";
      }
    | { type: "recover" }
    | { type: "notice_dismissed" }
    | { type: "pause" }
    | { type: "resume_session" }
    | { type: "exit" }
  );

export type EventType = ConversationEvent["type"];

export type Effect =
  | {
      type: "speak";
      outputId: string;
      text: string;
      lang: "en-US" | "fr-FR";
      rate: number;
    }
  | { type: "stop_audio" }
  | { type: "stop_recognition" }
  | { type: "commit"; action: LessonAction }
  | { type: "focus"; target: "heading" | "input" }
  | { type: "exit" };

export type IgnoredReason =
  | "stale_session"
  | "stale_turn"
  | "duplicate"
  | "ended"
  | "paused"
  | "invalid_in_state";

export type StepResult = {
  state: ConversationState;
  effects: Effect[];
  ignored?: IgnoredReason;
};

/** Events that belong to one specific turn and are dropped when the turn has moved on. */
export const turnScoped: ReadonlySet<EventType> = new Set<EventType>([
  "commit_result",
  "silence_checkin",
  "audio_started",
  "audio_ended",
  "audio_failed",
  "recognition_started",
  "recognition_ended",
  "recognition_failed",
]);

export const turnOpenPhases: ReadonlySet<PedagogicalPhase> = new Set([
  "guided_attempt",
  "diagnostic_probe",
  "scaffolded_retry",
  "transfer_attempt",
]);
