import { activities } from "../curriculum";
import {
  classifyText,
  derivePhase,
  entrySegments,
  extractName,
  feedbackSegments,
  ladderFor,
  lineSegments,
  recapIndex,
  repairContent,
  restingMedia,
  visibleOptionIndices,
} from "./script";
import {
  turnOpenPhases,
  turnScoped,
  type ActivityProgress,
  type ConversationEvent,
  type ConversationState,
  type Draft,
  type Effect,
  type FeedbackKey,
  type Segment,
  type MediaState,
  type Step,
  type StepResult,
  type Strategy,
} from "./types";

/**
 * Deterministic conversation driver (Phase 1B).
 *
 *   step(state, event) -> { state, effects, ignored? }
 *
 * Pure: no timers, audio, storage or React. The caller executes `effects` and
 * feeds results back as events stamped with the session/turn they belong to.
 * The model of the future ("a model proposes") plugs in as another event
 * source; nothing here lets any event write learner progress directly. The
 * only path to evidence is the `commit` effect, executed by the learning
 * engine in src/domain/learner.ts, whose result comes back as `commit_result`.
 */

export const NORMAL_RATE = 0.83;
const MAX_SEEN = 64;
const emptyDraft: Draft = { text: "", choice: null, source: "typed" };
const transientFeedback: ReadonlySet<FeedbackKey> = new Set([
  "need_answer",
  "thinking",
  "checkin",
  "no_speech",
  "interrupted",
  "resumed",
]);

export function createConversation(
  sessionId: string,
  learner: { index: number; completed: boolean },
): ConversationState {
  const completed = learner.completed || learner.index >= recapIndex;
  const startIndex = completed ? 0 : Math.max(0, learner.index);
  return {
    sessionId,
    turnId: 1,
    outputSeq: 0,
    lifecycle: "active",
    pausedFrom: null,
    media: "idle",
    phase: "orientation",
    activityIndex: -1,
    step: "present",
    orientation: completed ? "completed" : startIndex > 0 ? "resume" : "fresh",
    startIndex,
    draft: emptyDraft,
    helpOpen: false,
    prefs: { captions: true, voice: true },
    learnerName: null,
    checkinTurn: null,
    speechFrom: null,
    feedback: null,
    notice: null,
    repair: { rung: 0, strategy: null, probeCorrect: null },
    unclearStreak: 0,
    output: { id: null, rate: NORMAL_RATE },
    pending: null,
    progress: {},
    seen: [],
  };
}

// ---------- small pure helpers ----------

type Patch = Partial<ConversationState>;

function withPatch(state: ConversationState, patch: Patch): ConversationState {
  const next = { ...state, ...patch };
  return {
    ...next,
    phase: derivePhase(next.activityIndex, next.step, next.repair.strategy),
  };
}

function blankProgress(): ActivityProgress {
  return {
    attempts: 0,
    incorrect: 0,
    unclear: 0,
    partial: 0,
    helpRequests: 0,
    strategies: [],
    silenceCheckins: 0,
    correct: false,
    skipped: false,
  };
}

function bump(
  state: ConversationState,
  update: (p: ActivityProgress) => ActivityProgress,
): ConversationState["progress"] {
  const activity = activities[state.activityIndex];
  if (!activity) return state.progress;
  const current = state.progress[activity.id] ?? blankProgress();
  return { ...state.progress, [activity.id]: update(current) };
}

/**
 * Starts a new output (new id) for a sequence of segments; the previous output
 * is invalidated. A muted voice emits no speech at all (text stays on screen).
 */
function speak(
  state: ConversationState,
  segments: Segment[],
): { state: ConversationState; effects: Effect[] } {
  if (segments.length === 0 || !state.prefs.voice)
    return {
      state: { ...state, output: { id: null, rate: NORMAL_RATE } },
      effects: [{ type: "stop_audio" }],
    };
  const outputSeq = state.outputSeq + 1;
  const outputId = `${state.sessionId}:t${state.turnId}:o${outputSeq}`;
  return {
    state: {
      ...state,
      outputSeq,
      output: { id: outputId, rate: segments[0].rate },
      speechFrom: null,
    },
    effects: [{ type: "stop_audio" }, { type: "speak", outputId, segments }],
  };
}

function leaveTransient(state: ConversationState): ConversationState {
  const transient: MediaState[] = [
    "interrupted",
    "thinking_pause",
    "recovering",
  ];
  if (!transient.includes(state.media)) return state;
  return {
    ...state,
    media: restingMedia(state),
    feedback:
      state.feedback && transientFeedback.has(state.feedback)
        ? null
        : state.feedback,
    notice: state.media === "recovering" ? null : state.notice,
  };
}

function enterStation(
  state: ConversationState,
  index: number,
  step: Step,
  feedback: FeedbackKey | null,
): StepResult {
  const base = withPatch(state, {
    turnId: state.turnId + 1,
    activityIndex: index,
    step,
    repair: { rung: 0, strategy: null, probeCorrect: null },
    draft: emptyDraft,
    helpOpen: false,
    feedback,
    notice: null,
    unclearStreak: 0,
    pending: null,
    output: { id: null, rate: NORMAL_RATE },
  });
  const ready = { ...base, media: restingMedia(base) };
  const spoken = speak(ready, entrySegments(ready, feedback));
  return {
    state: spoken.state,
    effects: [...spoken.effects, { type: "focus", target: "heading" }],
  };
}

function nextStation(
  state: ConversationState,
  feedback: FeedbackKey,
): StepResult {
  return enterStation(state, state.activityIndex + 1, "attempt", feedback);
}

/** Changes method (never repeats the previous one) and opens a fresh turn. */
function escalate(state: ConversationState): StepResult {
  const activity = activities[state.activityIndex];
  const rung = state.repair.rung + 1;
  const ladder = ladderFor(activity);
  const previous = state.repair.strategy;
  const strategy: Strategy =
    previous === "visual_probe"
      ? "probe_followup"
      : (ladder[rung - 1] ?? "explain_and_offer_skip");
  const feedback: FeedbackKey =
    strategy === "explain_and_offer_skip" &&
    previous === "explain_and_offer_skip"
      ? "offer_continue_again"
      : strategy === "probe_followup"
        ? "probe_incorrect"
        : strategy;
  const opensFrench =
    strategy === "slow_with_french" ||
    strategy === "explain_and_offer_skip" ||
    strategy === "probe_followup";
  let next = withPatch(state, {
    turnId: state.turnId + 1,
    repair: { rung, strategy, probeCorrect: state.repair.probeCorrect },
    draft: { ...state.draft, choice: null },
    helpOpen: opensFrench ? true : state.helpOpen,
    feedback,
    unclearStreak: 0,
    pending: null,
    output: { id: null, rate: NORMAL_RATE },
    progress: bump(state, (p) => ({
      ...p,
      strategies: [...p.strategies, strategy],
    })),
  });
  next = { ...next, media: restingMedia(next) };
  // Every repair is explained aloud as well as on screen (muted: text only).
  const spoken = speak(
    next,
    feedbackSegments(feedback, next.activityIndex, next.learnerName),
  );
  return { state: spoken.state, effects: spoken.effects };
}

const unchanged = (
  state: ConversationState,
  effects: Effect[] = [],
): StepResult => ({
  state,
  effects,
});

// ---------- the reducer ----------

export function step(
  state: ConversationState,
  event: ConversationEvent,
): StepResult {
  const ignore = (ignored: StepResult["ignored"]): StepResult => ({
    state,
    effects: [],
    ignored,
  });
  if (event.sessionId !== state.sessionId) return ignore("stale_session");
  if (state.seen.includes(event.eventId)) return ignore("duplicate");
  if (state.lifecycle === "ended") return ignore("ended");
  if (
    state.lifecycle === "paused" &&
    event.type !== "resume_session" &&
    event.type !== "exit"
  )
    return ignore("paused");
  if (turnScoped.has(event.type) && event.turnId !== state.turnId)
    return ignore("stale_turn");

  const seen = [...state.seen, event.eventId].slice(-MAX_SEEN);
  const result = handle({ ...state, seen }, event);
  if (!result) return ignore("invalid_in_state");
  return result;
}

function handle(
  s: ConversationState,
  event: ConversationEvent,
): StepResult | null {
  const activity = activities[s.activityIndex];
  const turnOpen = turnOpenPhases.has(s.phase);

  switch (event.type) {
    case "begin": {
      if (s.phase !== "orientation" || s.orientation === "completed")
        return null;
      return enterStation(
        s,
        s.startIndex,
        s.startIndex === 0 ? "present" : "attempt",
        null,
      );
    }

    case "restart": {
      if (
        !(s.phase === "orientation" && s.orientation === "completed") &&
        s.phase !== "recap"
      )
        return null;
      const fresh = enterStation(
        {
          ...s,
          progress: {},
          learnerName: null,
          orientation: "fresh",
          startIndex: 0,
        },
        0,
        "present",
        null,
      );
      return {
        state: fresh.state,
        effects: [
          { type: "commit", action: { type: "restart" } },
          ...fresh.effects,
        ],
      };
    }

    case "continue": {
      if (s.phase !== "model") return null;
      const next = withPatch(s, {
        step: "attempt",
        turnId: s.turnId + 1,
        feedback: null,
      });
      return {
        state: { ...next, media: restingMedia(next) },
        effects: [{ type: "focus", target: "heading" }],
      };
    }

    case "draft_changed": {
      if (!turnOpen || s.media === "processing") return null;
      // Recognised text belongs to the turn in which listening began.
      if (event.source === "recognition" && event.turnId !== s.turnId)
        return null;
      const draft: Draft = {
        text: event.text ?? s.draft.text,
        choice: event.choice === undefined ? s.draft.choice : event.choice,
        source: event.source ?? s.draft.source,
      };
      if (draft.text.length > 500) return null;
      if (draft.choice !== null) {
        const allowed =
          s.phase === "diagnostic_probe"
            ? (repairContent[activity?.id ?? ""]?.probe?.options.map(
                (_, i) => i,
              ) ?? [])
            : visibleOptionIndices(s);
        if (!allowed.includes(draft.choice)) return null;
      }
      const left = leaveTransient(s);
      return unchanged({
        ...left,
        draft,
        speechFrom: null,
        feedback:
          left.feedback && transientFeedback.has(left.feedback)
            ? null
            : left.feedback,
      });
    }

    case "choose": {
      // One tap = one answer. Validated here, then handled exactly like a submit
      // (so a second tap while processing, or from an earlier turn, is dropped).
      if (!turnOpen || s.media === "processing" || !activity) return null;
      const allowed =
        s.phase === "diagnostic_probe"
          ? (repairContent[activity.id]?.probe?.options.map((_, i) => i) ?? [])
          : visibleOptionIndices(s);
      if (!allowed.includes(event.choice)) return null;
      return handle(
        { ...s, draft: { ...s.draft, choice: event.choice } },
        {
          type: "submit",
          eventId: event.eventId,
          sessionId: event.sessionId,
          turnId: event.turnId,
        },
      );
    }

    case "submit": {
      if (!turnOpen || s.media === "processing" || !activity) return null;
      const stop: Effect[] = [
        { type: "stop_audio" },
        { type: "stop_recognition" },
      ];
      const open = {
        ...leaveTransient(s),
        output: { id: null, rate: s.output.rate },
      };

      if (s.phase === "diagnostic_probe") {
        const probe = repairContent[activity.id]?.probe;
        const choice = s.draft.choice;
        if (!probe || choice === null || !probe.options[choice])
          return unchanged({ ...open, feedback: "need_answer" }, stop);
        const correct = probe.options[choice].correct;
        const next = withPatch(open, {
          turnId: s.turnId + 1,
          repair: {
            rung: s.repair.rung + 1,
            strategy: "probe_followup",
            probeCorrect: correct,
          },
          draft: { ...s.draft, choice: null },
          helpOpen: correct ? s.helpOpen : true,
          feedback: correct ? "probe_correct" : "probe_incorrect",
          progress: bump(s, (p) => ({
            ...p,
            strategies: [...p.strategies, "probe_followup"],
          })),
        });
        const ready = { ...next, media: restingMedia(next) };
        const spoken = speak(
          ready,
          feedbackSegments(
            ready.feedback!,
            ready.activityIndex,
            ready.learnerName,
          ),
        );
        return { state: spoken.state, effects: [...stop, ...spoken.effects] };
      }

      let name: string | null = null;
      let response: string | number;
      if (activity.type === "choice") {
        const choice = s.draft.choice;
        if (choice === null || !visibleOptionIndices(s).includes(choice))
          return unchanged({ ...open, feedback: "need_answer" }, stop);
        response = choice;
      } else {
        const kind = classifyText(activity, s.draft.text);
        if (kind === "unclear" || kind === "partial") {
          const streak = s.unclearStreak + 1;
          const counted = {
            ...open,
            unclearStreak: streak,
            progress: bump(s, (p) =>
              kind === "partial"
                ? { ...p, partial: p.partial + 1 }
                : { ...p, unclear: p.unclear + 1 },
            ),
          };
          if (streak >= 2) {
            const repaired = escalate(counted);
            return {
              state: repaired.state,
              effects: [...stop, ...repaired.effects],
            };
          }
          const ready = {
            ...counted,
            media: restingMedia(counted),
            feedback: kind,
          };
          const spoken = speak(
            ready,
            feedbackSegments(kind, ready.activityIndex, ready.learnerName),
          );
          return { state: spoken.state, effects: [...stop, ...spoken.effects] };
        }
        response = s.draft.text.trim();
        // Session-only: used to greet the learner, never stored.
        name = kind === "correct" ? extractName(response) : null;
      }
      const modality =
        activity.type === "speak"
          ? s.draft.source === "recognition"
            ? ("browser-recognition" as const)
            : ("typed" as const)
          : undefined;
      return {
        state: {
          ...open,
          media: "processing",
          feedback: null,
          unclearStreak: 0,
          pending: { activityId: activity.id, skip: false, name },
          progress: bump(s, (p) => ({ ...p, attempts: p.attempts + 1 })),
        },
        effects: [
          ...stop,
          {
            type: "commit",
            // Bilingual aids are visible from the start of Phase 1B, so every answer is assisted.
            action: {
              type: "answer",
              activityId: activity.id,
              response,
              assisted: true,
              modality,
            },
          },
        ],
      };
    }

    case "skip": {
      if (!turnOpen || s.media === "processing" || !activity) return null;
      return {
        state: {
          ...leaveTransient(s),
          media: "processing",
          feedback: null,
          output: { id: null, rate: s.output.rate },
          pending: { activityId: activity.id, skip: true, name: null },
        },
        effects: [
          { type: "stop_audio" },
          { type: "stop_recognition" },
          { type: "commit", action: { type: "skip", activityId: activity.id } },
        ],
      };
    }

    case "commit_result": {
      if (
        s.media !== "processing" ||
        !s.pending ||
        s.pending.activityId !== event.activityId
      )
        return null;
      const skip = s.pending.skip;
      if (event.rejected)
        return unchanged({
          ...s,
          pending: null,
          media: "recovering",
          notice: "commit_rejected",
        });
      if (event.advanced) {
        const recorded = {
          ...s,
          learnerName:
            !skip && event.correct && s.pending.name
              ? s.pending.name
              : s.learnerName,
          pending: null,
          progress: bump(s, (p) => ({
            ...p,
            correct: !skip && event.correct,
            skipped: skip,
          })),
        };
        return nextStation(recorded, skip ? "skipped" : "acknowledged");
      }
      const missed = {
        ...s,
        pending: null,
        media: restingMedia(s),
        progress: bump(s, (p) => ({ ...p, incorrect: p.incorrect + 1 })),
      };
      return escalate(missed);
    }

    case "replay": {
      if (s.media === "processing" || !s.prefs.voice) return null;
      const segments = lineSegments(s, event.slow);
      if (segments.length === 0) return null;
      const left = leaveTransient(s);
      const counted = {
        ...left,
        progress: bump(left, (p) => ({
          ...p,
          helpRequests: p.helpRequests + 1,
        })),
      };
      return speak(counted, segments);
    }

    case "stuck": {
      if (s.media === "processing" || !activity) return null;
      const counted = {
        ...leaveTransient(s),
        progress: bump(s, (p) => ({ ...p, helpRequests: p.helpRequests + 1 })),
      };
      if (!turnOpen) {
        // Tutor-only step: slower audio plus the French explanation, no state change.
        const open = { ...counted, helpOpen: true };
        return speak(open, lineSegments(open, true));
      }
      return escalate(counted);
    }

    case "help_opened": {
      if (s.phase === "orientation" || s.phase === "recap") return null;
      return unchanged({
        ...s,
        helpOpen: true,
        progress: s.helpOpen
          ? s.progress
          : bump(s, (p) => ({ ...p, helpRequests: p.helpRequests + 1 })),
      });
    }

    case "help_dismissed":
      return unchanged({ ...s, helpOpen: false });

    case "captions_toggled":
      return unchanged({
        ...s,
        prefs: { ...s.prefs, captions: !s.prefs.captions },
      });

    case "voice_toggled": {
      const voice = !s.prefs.voice;
      if (voice) return unchanged({ ...s, prefs: { ...s.prefs, voice } });
      // Muting silences everything at once and cancels the current output.
      return unchanged(
        {
          ...s,
          prefs: { ...s.prefs, voice },
          output: { id: null, rate: s.output.rate },
          speechFrom: null,
          media: s.media === "tutor_speaking" ? restingMedia(s) : s.media,
        },
        [{ type: "stop_audio" }],
      );
    }

    case "think_started": {
      if (!turnOpen) return null;
      if (
        ![
          "listening_open",
          "learner_speaking",
          "interrupted",
          "tutor_speaking",
        ].includes(s.media)
      )
        return null;
      // Asking for a moment while the tutor talks simply stops the voice.
      const thinking = {
        ...s,
        media: "thinking_pause" as const,
        feedback: "thinking" as const,
      };
      const spoken = speak(
        thinking,
        feedbackSegments("thinking", s.activityIndex, s.learnerName),
      );
      return {
        state: spoken.state,
        effects: [
          ...(s.media === "learner_speaking"
            ? [{ type: "stop_recognition" as const }]
            : []),
          ...spoken.effects,
        ],
      };
    }

    case "resume_turn": {
      if (!turnOpen && s.media !== "interrupted") return null;
      if (s.media !== "thinking_pause" && s.media !== "interrupted")
        return null;
      return unchanged(leaveTransient(s));
    }

    case "silence_checkin": {
      // A pause is never an outcome: no attempt, no evidence, no progression, no new strategy.
      // The quiet offer of help is made once per turn, never repeatedly.
      if (s.media !== "listening_open" || s.checkinTurn === s.turnId)
        return null;
      const quiet = {
        ...s,
        media: "thinking_pause" as const,
        feedback: "checkin" as const,
        checkinTurn: s.turnId,
        progress: bump(s, (p) => ({
          ...p,
          silenceCheckins: p.silenceCheckins + 1,
        })),
      };
      return speak(
        quiet,
        feedbackSegments("checkin", s.activityIndex, s.learnerName),
      );
    }

    case "interrupt": {
      if (s.media !== "tutor_speaking") return null;
      return unchanged(
        {
          ...s,
          media: "interrupted",
          output: { id: null, rate: s.output.rate },
          speechFrom: null,
          feedback: "interrupted",
          helpOpen:
            s.phase === "orientation" || s.phase === "recap" ? false : true,
        },
        [{ type: "stop_audio" }],
      );
    }

    case "audio_started": {
      if (event.outputId !== s.output.id) return null;
      if (!["idle", "listening_open", "thinking_pause"].includes(s.media))
        return null;
      return unchanged({
        ...s,
        media: "tutor_speaking",
        // A quiet check-in spoken during thinking time returns to thinking time.
        speechFrom: s.media === "thinking_pause" ? "thinking_pause" : null,
      });
    }

    case "audio_ended": {
      if (event.outputId !== s.output.id) return null;
      return unchanged({
        ...s,
        output: { id: null, rate: s.output.rate },
        speechFrom: null,
        media:
          s.media === "tutor_speaking"
            ? (s.speechFrom ?? restingMedia(s))
            : s.media,
      });
    }

    case "audio_failed": {
      if (event.outputId !== s.output.id) return null;
      return unchanged({
        ...s,
        output: { id: null, rate: s.output.rate },
        speechFrom: null,
        media:
          s.media === "tutor_speaking"
            ? (s.speechFrom ?? restingMedia(s))
            : s.media,
        notice: "audio_unavailable",
      });
    }

    case "recognition_started": {
      if (!turnOpen) return null;
      if (
        ![
          "listening_open",
          "thinking_pause",
          "interrupted",
          "tutor_speaking",
        ].includes(s.media)
      )
        return null;
      // The learner's turn is protected: tutor output stops when the learner starts.
      const left = leaveTransient({
        ...s,
        media: s.media === "tutor_speaking" ? "listening_open" : s.media,
      });
      return unchanged(
        {
          ...left,
          media: "learner_speaking",
          speechFrom: null,
          output: { id: null, rate: s.output.rate },
          feedback:
            left.feedback && transientFeedback.has(left.feedback)
              ? null
              : left.feedback,
        },
        [{ type: "stop_audio" }],
      );
    }

    case "recognition_ended": {
      if (s.media !== "learner_speaking") return null;
      return unchanged({ ...s, media: "listening_open" });
    }

    case "recognition_failed": {
      if (!turnOpen) return null;
      if (event.reason === "no_speech") {
        // Silence is not a failure and not an error.
        if (!["learner_speaking", "listening_open"].includes(s.media))
          return null;
        return unchanged({
          ...s,
          media: "thinking_pause",
          feedback: "no_speech",
        });
      }
      // A hard microphone failure closes the speech panel (aborting recognition
      // and revoking its per-exercise consent). The card's notice is then the
      // single message, and typing remains available.
      return unchanged(
        {
          ...s,
          media: "recovering",
          notice:
            event.reason === "denied"
              ? "microphone_denied"
              : "microphone_unavailable",
        },
        [{ type: "stop_recognition" }],
      );
    }

    case "recover": {
      if (s.media !== "recovering") return null;
      return unchanged({ ...leaveTransient(s), notice: null }, [
        { type: "focus", target: "input" },
      ]);
    }

    case "notice_dismissed":
      return unchanged({ ...s, notice: null });

    case "pause": {
      if (s.pending) return null;
      return unchanged(
        {
          ...s,
          lifecycle: "paused",
          pausedFrom:
            s.media === "thinking_pause"
              ? "thinking_pause"
              : s.media === "tutor_speaking" || s.media === "interrupted"
                ? null
                : s.media,
          media: "idle",
          speechFrom: null,
          output: { id: null, rate: s.output.rate },
        },
        [{ type: "stop_audio" }, { type: "stop_recognition" }],
      );
    }

    case "resume_session": {
      if (s.lifecycle !== "paused") return null;
      const resting = restingMedia(s);
      const restored: MediaState =
        s.pausedFrom === "thinking_pause" && turnOpenPhases.has(s.phase)
          ? "thinking_pause"
          : s.pausedFrom === "recovering"
            ? "recovering"
            : resting === "listening_open" &&
                s.pausedFrom === "learner_speaking"
              ? "listening_open"
              : resting;
      // Never restarts audio or microphone by itself; the draft is untouched.
      return unchanged(
        { ...s, lifecycle: "active", pausedFrom: null, media: restored },
        [{ type: "focus", target: "heading" }],
      );
    }

    case "exit":
      return unchanged(
        {
          ...s,
          lifecycle: "ended",
          media: "ended",
          pausedFrom: null,
          pending: null,
          output: { id: null, rate: s.output.rate },
          speechFrom: null,
          // Session-only information never outlives the session.
          learnerName: null,
          draft: emptyDraft,
        },
        [
          { type: "stop_audio" },
          { type: "stop_recognition" },
          { type: "exit" },
        ],
      );
  }
}
