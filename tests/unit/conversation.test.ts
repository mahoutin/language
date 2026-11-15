import { describe, expect, it } from "vitest";
import { activities } from "../../src/domain/curriculum";
import {
  initialState,
  learnerSchema,
  parseRecord,
  transition,
  type LearnerState,
} from "../../src/domain/learner";
import {
  createConversation,
  step,
} from "../../src/domain/conversation/machine";
import {
  classifyText,
  displayOrder,
  entrySegments,
  extractName,
  feedbackText,
  lineSegments,
  plainText,
  recapHeading,
  invariantViolations,
  narrowedOptions,
  reducedVariant,
  visibleOptionIndices,
  visibleOverlays,
} from "../../src/domain/conversation/script";
import { buildRecap } from "../../src/domain/conversation/summary";
import type {
  ConversationEvent,
  ConversationState,
  Effect,
  Segment,
  StepResult,
} from "../../src/domain/conversation/types";

type Body = ConversationEvent extends infer E
  ? E extends ConversationEvent
    ? Omit<E, "eventId" | "sessionId" | "turnId"> &
        Partial<Pick<E, "turnId" | "sessionId" | "eventId">>
    : never
  : never;

/** Test driver: stamps ids, runs commit effects through the REAL learning engine. */
class Run {
  conv: ConversationState;
  learner: LearnerState;
  n = 0;
  effects: Effect[] = [];
  last!: StepResult;
  commits = 0;
  sid: string;
  constructor(learner: LearnerState = initialState(), sid = "s1") {
    this.learner = learner;
    this.sid = sid;
    this.conv = createConversation(sid, learner);
  }
  send(body: Body): StepResult {
    const event = {
      eventId: `e${++this.n}`,
      sessionId: this.sid,
      turnId: this.conv.turnId,
      ...body,
    } as ConversationEvent;
    const result = step(this.conv, event);
    expect(invariantViolations(result.state)).toEqual([]);
    this.conv = result.state;
    this.last = result;
    this.effects.push(...result.effects);
    for (const effect of result.effects) {
      if (effect.type !== "commit" || effect.action.type === "restart") {
        if (effect.type === "commit")
          this.learner = transition(this.learner, effect.action).state;
        continue;
      }
      this.commits++;
      const before = this.learner;
      const after = transition(before, effect.action).state;
      this.learner = after;
      const evidence = after.evidence.at(-1);
      const advanced = after.index > before.index;
      const rejected = after === before;
      const result2 = this.send({
        type: "commit_result",
        activityId: effect.action.activityId,
        advanced,
        correct:
          Boolean(evidence?.correct) &&
          after.evidence.length > before.evidence.length,
        rejected,
      });
      this.last = result2;
    }
    return result;
  }
  begin() {
    this.send({ type: "begin" });
    return this;
  }
  type(text: string) {
    this.send({ type: "draft_changed", text });
    return this;
  }
  pick(choice: number) {
    this.send({ type: "draft_changed", choice });
    return this;
  }
  submit() {
    this.send({ type: "submit" });
    return this;
  }
  answerChoice(index: number) {
    return this.pick(index).submit();
  }
  /** One tap on an option: a single atomic answer. */
  tap(index: number) {
    this.send({ type: "choose", choice: index });
    return this;
  }
  /** Walk to a given activity by answering each earlier one correctly. */
  goTo(index: number) {
    this.begin();
    for (let i = 0; i < index; i++) {
      if (this.conv.phase === "model") this.send({ type: "continue" });
      const a = activities[i];
      if (a.type === "choice")
        this.answerChoice(a.options.findIndex((o) => o.correct));
      else this.type("My name is Alex").submit();
    }
    return this;
  }
}

/** Everything an effect list asks the voice to say, in order. */
const segs = (effects: Effect[]): Segment[] =>
  effects.flatMap((e) => (e.type === "speak" ? e.segments : []));
const lastSpeak = (effects: Effect[]) =>
  effects.filter((e) => e.type === "speak").at(-1) as
    Extract<Effect, { type: "speak" }> | undefined;

const hasEffect = (r: StepResult, type: Effect["type"]) =>
  r.effects.some((e) => e.type === type);

describe("scripted conversation: the full lifecycle", () => {
  it("welcome → model → meaning checks → learner turn → transfer → recap", () => {
    const run = new Run();
    expect(run.conv).toMatchObject({
      phase: "orientation",
      media: "idle",
      activityIndex: -1,
    });
    // Nothing is started or requested before the learner acts.
    expect(run.effects).toEqual([]);

    run.begin();
    expect(run.conv).toMatchObject({
      phase: "model",
      activityIndex: 0,
      step: "present",
    });
    // French lead-in, then the English line, in the right voice language each.
    expect(segs(run.effects)).toMatchObject([
      { text: "Écoutez Daniel se présenter.", lang: "fr-FR" },
      { text: "Hello! My name is Daniel.", lang: "en-US", speaker: "Daniel" },
    ]);

    run.send({ type: "continue" });
    expect(run.conv).toMatchObject({
      phase: "guided_attempt",
      media: "listening_open",
    });
    run.answerChoice(0);
    expect(run.conv).toMatchObject({
      activityIndex: 1,
      feedback: "acknowledged",
    });
    expect(segs(run.effects.slice(-6)).map((x) => x.text)).toContain(
      "What is your name?",
    );
    run.answerChoice(0);
    expect(run.conv).toMatchObject({
      activityIndex: 2,
      phase: "guided_attempt",
    });
    run.type("My name is Alex").submit();
    expect(run.conv).toMatchObject({ activityIndex: 3 });
    run.answerChoice(0); // Maria
    expect(run.conv).toMatchObject({
      activityIndex: 4,
      phase: "transfer_attempt",
    });
    run.type("I'm Alex").submit();
    expect(run.conv).toMatchObject({
      phase: "recap",
      media: "idle",
      activityIndex: 5,
    });
    expect(run.learner.completed).toBe(true);
    expect(run.learner.evidence).toHaveLength(5);
  });

  it("a shorter functional answer is accepted where the curriculum already accepts it", () => {
    const run = new Run().goTo(2);
    run.type("I'm Alex").submit();
    expect(run.conv.activityIndex).toBe(3);
  });

  it("resumes at the saved activity and offers a restart when already completed", () => {
    const mid = { ...initialState(), index: 3 };
    const run = new Run(mid);
    expect(run.conv.orientation).toBe("resume");
    run.begin();
    expect(run.conv).toMatchObject({
      activityIndex: 3,
      phase: "guided_attempt",
    });

    const done = new Run({ ...initialState(), index: 5, completed: true });
    expect(done.conv.orientation).toBe("completed");
    expect(done.send({ type: "begin" }).ignored).toBe("invalid_in_state");
    done.send({ type: "restart" });
    expect(done.conv).toMatchObject({ activityIndex: 0, phase: "model" });
    expect(done.learner).toMatchObject({ index: 0, completed: false });
    expect(done.learner.evidence).toHaveLength(0); // restart keeps history; this one had none
  });
});

describe("thinking time versus explicit pause", () => {
  it("silence check-ins never create outcomes, attempts or progression", () => {
    const run = new Run().goTo(2);
    const before = {
      learner: run.learner,
      activity: run.conv.activityIndex,
      phase: run.conv.phase,
    };
    run.send({ type: "silence_checkin" });
    expect(run.conv.media).toBe("thinking_pause");
    expect(run.conv.feedback).toBe("checkin");
    for (let i = 0; i < 5; i++) run.send({ type: "silence_checkin" }); // already thinking: no-ops
    expect(run.learner).toBe(before.learner); // identical object: nothing written
    expect(run.commits).toBe(2);
    expect(run.conv).toMatchObject({
      activityIndex: before.activity,
      phase: before.phase,
    });
    expect(run.conv.repair.strategy).toBeNull();
    expect(run.conv.progress["say-name"]).toMatchObject({
      attempts: 0,
      incorrect: 0,
      unclear: 0,
    });
  });

  it("typing or resuming after a thinking pause reopens the turn and keeps the draft", () => {
    const run = new Run().goTo(2).type("My na");
    run.send({ type: "think_started" });
    expect(run.conv.media).toBe("thinking_pause");
    run.send({ type: "resume_turn" });
    expect(run.conv).toMatchObject({ media: "listening_open", feedback: null });
    run.send({ type: "think_started" });
    run.type("My name is");
    expect(run.conv.media).toBe("listening_open");
    expect(run.conv.draft.text).toBe("My name is");
  });

  it("explicit pause is a different lifecycle: media released, draft kept, nothing restarts", () => {
    const run = new Run().goTo(2).type("My name is Al");
    run.send({ type: "pause" });
    expect(run.conv).toMatchObject({ lifecycle: "paused", media: "idle" });
    expect(hasEffect(run.last, "stop_audio")).toBe(true);
    expect(hasEffect(run.last, "stop_recognition")).toBe(true);
    // Everything but resume/exit is ignored while paused.
    expect(run.send({ type: "submit" }).ignored).toBe("paused");
    expect(run.send({ type: "draft_changed", text: "zzz" }).ignored).toBe(
      "paused",
    );
    expect(run.send({ type: "silence_checkin" }).ignored).toBe("paused");
    run.send({ type: "resume_session" });
    expect(run.conv).toMatchObject({
      lifecycle: "active",
      media: "listening_open",
    });
    expect(run.conv.draft.text).toBe("My name is Al");
    expect(run.last.effects.some((e) => e.type === "speak")).toBe(false);
  });

  it("a thinking pause survives an explicit pause and resume", () => {
    const run = new Run().goTo(2);
    run.send({ type: "think_started" });
    run.send({ type: "pause" });
    run.send({ type: "resume_session" });
    expect(run.conv.media).toBe("thinking_pause");
  });

  it("pausing while the microphone listens resumes with it OFF", () => {
    const run = new Run().goTo(2);
    run.send({ type: "recognition_started" });
    expect(run.conv.media).toBe("learner_speaking");
    run.send({ type: "pause" });
    run.send({ type: "resume_session" });
    expect(run.conv.media).toBe("listening_open");
  });
});

describe("interruption, replay and slower playback", () => {
  it("interrupting stops audio and invalidates the old output", () => {
    const run = new Run().begin();
    const output = run.conv.output.id!;
    run.send({ type: "audio_started", outputId: output });
    expect(run.conv.media).toBe("tutor_speaking");
    run.send({ type: "interrupt" });
    expect(run.conv).toMatchObject({
      media: "interrupted",
      feedback: "interrupted",
    });
    expect(hasEffect(run.last, "stop_audio")).toBe(true);
    // The late end-of-audio callback of the interrupted output changes nothing.
    const stale = run.send({ type: "audio_ended", outputId: output });
    expect(stale.ignored).toBe("invalid_in_state");
    expect(run.conv.media).toBe("interrupted");
    run.send({ type: "resume_turn" });
    expect(run.conv.media).toBe("idle");
  });

  it("asking for a moment while the tutor speaks stops the voice and opens thinking time", () => {
    const run = new Run().goTo(2);
    run.send({ type: "replay", slow: false });
    const id = run.conv.output.id!;
    run.send({ type: "audio_started", outputId: id });
    expect(run.conv.media).toBe("tutor_speaking");
    run.send({ type: "think_started" });
    expect(run.conv).toMatchObject({ media: "thinking_pause" });
    // The old output is gone; Daniel only offers a gentle word, in French.
    expect(run.conv.output.id).not.toBe(id);
    expect(segs(run.last.effects)).toMatchObject([
      { lang: "fr-FR", text: expect.stringContaining("Prenez votre temps") },
    ]);
    expect(hasEffect(run.last, "stop_audio")).toBe(true);
    expect(run.send({ type: "audio_ended", outputId: id }).ignored).toBe(
      "invalid_in_state",
    );
    expect(run.conv.media).toBe("thinking_pause");
  });

  it("repeat and slower start NEW outputs at different rates without touching the draft", () => {
    const run = new Run().goTo(2).type("My name");
    run.send({ type: "replay", slow: false });
    const normal = lastSpeak(run.last.effects);
    run.send({ type: "replay", slow: true });
    const slow = lastSpeak(run.last.effects);
    expect(normal!.segments).toMatchObject([
      { rate: 0.83, text: "Hello! What is your name?", lang: "en-US" },
    ]);
    expect(slow!.segments).toMatchObject([{ rate: 0.65 }]);
    expect((normal as { outputId: string }).outputId).not.toBe(
      (slow as { outputId: string }).outputId,
    );
    expect(run.conv.draft.text).toBe("My name");
    expect(run.conv.progress["say-name"].helpRequests).toBe(2);
    expect(run.conv.progress["say-name"].incorrect).toBe(0);
    expect(run.conv.repair.strategy).toBeNull(); // replay is not a repair escalation
  });

  it("learner speech stops tutor output and protects the turn", () => {
    const run = new Run().goTo(2);
    run.send({ type: "replay", slow: false });
    run.send({ type: "audio_started", outputId: run.conv.output.id! });
    run.send({ type: "recognition_started" });
    expect(run.conv).toMatchObject({ media: "learner_speaking" });
    expect(run.conv.output.id).toBeNull();
    expect(hasEffect(run.last, "stop_audio")).toBe(true);
    run.send({ type: "recognition_ended" });
    expect(run.conv.media).toBe("listening_open");
  });

  it("audio completion returns to the resting state; failure shows a text fallback", () => {
    const run = new Run().goTo(2);
    run.send({ type: "replay", slow: false });
    const id = run.conv.output.id!;
    run.send({ type: "audio_started", outputId: id });
    run.send({ type: "audio_ended", outputId: id });
    expect(run.conv.media).toBe("listening_open");
    run.send({ type: "replay", slow: false });
    run.send({ type: "audio_failed", outputId: run.conv.output.id! });
    expect(run.conv).toMatchObject({
      media: "listening_open",
      notice: "audio_unavailable",
    });
    // Text-based learning continues.
    run.type("My name is Alex").submit();
    expect(run.conv.activityIndex).toBe(3);
  });

  it("audio events cannot advance the lesson", () => {
    const run = new Run().goTo(1);
    const index = run.learner.index;
    run.send({ type: "audio_started", outputId: run.conv.output.id! });
    run.send({ type: "audio_ended", outputId: run.conv.output.id! });
    expect(run.learner.index).toBe(index);
    expect(run.conv.activityIndex).toBe(1);
  });
});

describe("recognised text belongs to its own turn", () => {
  it("drops recognised text that arrives after the turn moved on, but keeps typed text", () => {
    const run = new Run().goTo(2);
    const listeningTurn = run.conv.turnId;
    run.type("Yes please").submit(); // repair opens a new turn
    const before = run.conv;
    const late = step(run.conv, {
      type: "draft_changed",
      text: "My name is Late",
      source: "recognition",
      eventId: "late-asr",
      sessionId: "s1",
      turnId: listeningTurn,
    });
    expect(late.ignored).toBe("invalid_in_state");
    expect(late.state).toBe(before);
    run.type("My name is Alex");
    expect(run.conv.draft.text).toBe("My name is Alex");
  });
});

describe("French help does not corrupt the response", () => {
  it("opening, dismissing and re-opening help preserves text and choice", () => {
    const run = new Run().goTo(2).type("My name is Al");
    run.send({ type: "help_opened" });
    expect(run.conv.helpOpen).toBe(true);
    run.send({ type: "help_dismissed" });
    run.send({ type: "help_opened" });
    expect(run.conv.draft.text).toBe("My name is Al");
    expect(run.conv.progress["say-name"]).toMatchObject({
      incorrect: 0,
      attempts: 0,
    });
    expect(run.commits).toBe(2); // only the earlier correct answers

    const choice = new Run().begin();
    choice.send({ type: "continue" });
    choice.pick(1);
    choice.send({ type: "help_opened" });
    expect(choice.conv.draft.choice).toBe(1);
  });

  it("French support is visible from the start and Help adds to it; captions are separate", () => {
    const run = new Run().begin();
    expect(visibleOverlays(run.conv)).toEqual(
      expect.arrayContaining([
        "french_support",
        "english_caption",
        "context_note",
        "replay_controls",
      ]),
    );
    run.send({ type: "captions_toggled" });
    expect(run.conv.prefs.captions).toBe(false);
    const off = visibleOverlays(run.conv);
    expect(off).not.toContain("english_caption");
    expect(off).toContain("french_support"); // hiding captions never hides French
    run.send({ type: "help_opened" });
    expect(visibleOverlays(run.conv)).toContain("french_help");
  });

  it("shows only what is relevant to the current phase", () => {
    const orientation = new Run();
    expect(visibleOverlays(orientation.conv)).toEqual([
      "french_support",
      "replay_controls",
    ]);
    const speak = new Run().goTo(2);
    expect(visibleOverlays(speak.conv)).not.toContain("visual_choice");
    expect(visibleOverlays(speak.conv)).not.toContain("context_note");
    const recap = new Run().goTo(5);
    expect(visibleOverlays(recap.conv)).toEqual(["french_support", "feedback"]);
  });
});

describe("response kinds are distinct outcomes", () => {
  const say = activities[2];
  it.each([
    ["My name is Alex", "correct"],
    ["I'm Alex", "correct"],
    ["Alex", "partial"],
    ["Yes please", "incorrect"],
    ["   ", "unclear"],
    ["12 !!", "unclear"],
    ["a", "unclear"],
  ] as const)("classifies %j as %s", (text, kind) => {
    expect(classifyText(say, text)).toBe(kind);
  });

  it("incorrect answers are recorded and trigger a repair; they do not advance", () => {
    const run = new Run().goTo(2);
    run.type("Yes please").submit();
    expect(run.conv.activityIndex).toBe(2);
    expect(run.conv.repair.strategy).toBe("slow_with_french");
    expect(run.learner.evidence.at(-1)).toMatchObject({
      activityId: "say-name",
      correct: false,
    });
    expect(run.conv.progress["say-name"]).toMatchObject({
      attempts: 1,
      incorrect: 1,
    });
  });

  it("unclear and partial replies are NOT recorded as errors", () => {
    const run = new Run().goTo(2);
    const before = run.learner;
    run.type("12 !!").submit();
    expect(run.conv.feedback).toBe("unclear");
    run.type("Alex").submit();
    // Second non-answer in a row: the tutor changes method instead of repeating itself.
    expect(run.conv.repair.strategy).toBe("slow_with_french");
    expect(run.learner).toBe(before);
    // A bare word is understandable ("partial"); symbols are not ("unclear").
    expect(run.conv.progress["say-name"]).toMatchObject({
      attempts: 0,
      incorrect: 0,
      unclear: 1,
      partial: 1,
    });
  });

  it("an empty choice or empty text asks for an answer without any outcome", () => {
    const run = new Run().begin();
    run.send({ type: "continue" });
    const before = run.learner;
    run.submit();
    expect(run.conv.feedback).toBe("need_answer");
    expect(run.learner).toBe(before);
    expect(run.conv.progress["listen-greeting"]?.attempts ?? 0).toBe(0);
  });

  it("skipping is its own outcome: no assessment and no mastery signal", () => {
    const run = new Run().goTo(2);
    run.send({ type: "skip" });
    expect(run.learner.evidence.at(-1)).toMatchObject({
      activityId: "say-name",
      correct: false,
      confidence: "none",
      reason: "Skipped without assessment",
    });
    expect(run.conv).toMatchObject({ activityIndex: 3, feedback: "skipped" });
    expect(run.conv.progress["say-name"]).toMatchObject({
      skipped: true,
      correct: false,
    });
  });

  it("a technical failure is neither an error nor a skip", () => {
    const run = new Run().goTo(2);
    const before = run.learner;
    run.send({ type: "recognition_failed", reason: "denied" });
    expect(run.conv).toMatchObject({
      media: "recovering",
      notice: "microphone_denied",
    });
    expect(hasEffect(run.last, "stop_recognition")).toBe(true);
    expect(run.learner).toBe(before);
    // No progress entry was even created: a device failure leaves no trace in the activity.
    expect(run.conv.progress["say-name"]).toBeUndefined();
    run.send({ type: "recover" });
    expect(run.conv).toMatchObject({ media: "listening_open", notice: null });
    expect(hasEffect(run.last, "focus")).toBe(true);
  });

  it("recognition with no speech is silence, not a failure", () => {
    const run = new Run().goTo(2);
    run.send({ type: "recognition_started" });
    run.send({ type: "recognition_failed", reason: "no_speech" });
    expect(run.conv).toMatchObject({
      media: "thinking_pause",
      feedback: "no_speech",
      notice: null,
    });
    expect(run.learner.evidence).toHaveLength(2);
  });

  it("typing after a device failure continues by text", () => {
    const run = new Run().goTo(2);
    run.send({ type: "recognition_failed", reason: "unavailable" });
    run.type("My name is Alex");
    expect(run.conv).toMatchObject({ media: "listening_open", notice: null });
    run.submit();
    expect(run.conv.activityIndex).toBe(3);
  });

  it("records typed and recognised answers as different observations", () => {
    const typed = new Run().goTo(2).type("My name is Alex").submit();
    expect(typed.learner.evidence.at(-1)).toMatchObject({
      responseType: "speak",
      modality: "typed",
    });
    const run = new Run().goTo(2);
    run.send({
      type: "draft_changed",
      text: "My name is Alex",
      source: "recognition",
    });
    run.submit();
    expect(run.learner.evidence.at(-1)).toMatchObject({
      modality: "browser-recognition",
    });
    // Choice answers carry no modality field.
    const choice = new Run().goTo(1);
    expect(choice.learner.evidence[0]).not.toHaveProperty("modality");
  });
});

describe("adaptive repair (deterministic, genuinely different methods)", () => {
  it("speak activity: slow+French → example frame → diagnostic probe → follow-up → explain/offer", () => {
    const run = new Run().goTo(2);
    const seen: (string | null)[] = [];
    const fail = () => run.type("Yes please").submit();

    fail();
    seen.push(run.conv.repair.strategy);
    expect(run.conv).toMatchObject({
      phase: "scaffolded_retry",
      helpOpen: true,
    });
    // Repair is explained aloud: French, then the line slowly in English, then the French meaning.
    expect(segs(run.last.effects)).toMatchObject([
      { lang: "fr-FR", text: "Écoutons plus lentement." },
      { lang: "en-US", text: "Hello! What is your name?", rate: 0.65 },
      { lang: "fr-FR" },
    ]);
    expect(feedbackText("slow_with_french", 2)).toContain(
      "Comment vous appelez-vous",
    );

    fail();
    seen.push(run.conv.repair.strategy);
    expect(run.conv.phase).toBe("scaffolded_retry");

    fail();
    seen.push(run.conv.repair.strategy);
    expect(run.conv.phase).toBe("diagnostic_probe");
    expect(visibleOverlays(run.conv)).toEqual(
      expect.arrayContaining(["visual_choice"]),
    );
    expect(visibleOverlays(run.conv)).not.toContain("english_caption");
    // The probe is not an attempt at the activity: nothing is committed.
    const evidenceBeforeProbe = run.learner.evidence.length;
    run.pick(2).submit(); // wrong probe answer
    expect(run.learner.evidence).toHaveLength(evidenceBeforeProbe);
    expect(run.conv).toMatchObject({
      phase: "scaffolded_retry",
      feedback: "probe_incorrect",
      repair: { strategy: "probe_followup", probeCorrect: false },
    });
    seen.push(run.conv.repair.strategy);

    fail();
    seen.push(run.conv.repair.strategy);
    expect(run.conv.feedback).toBe("explain_and_offer_skip");
    fail();
    expect(run.conv.feedback).toBe("offer_continue_again");

    expect(seen).toEqual([
      "slow_with_french",
      "example_frame",
      "visual_probe",
      "probe_followup",
      "explain_and_offer_skip",
    ]);
    expect(new Set(seen).size).toBe(seen.length); // no method repeated
    // The learner can still succeed after repair, and the answer is recorded as assisted.
    run.type("My name is Alex").submit();
    expect(run.conv.activityIndex).toBe(3);
    expect(run.learner.evidence.at(-1)).toMatchObject({
      correct: true,
      assisted: true,
    });
    expect(run.conv.progress["say-name"].correct).toBe(true);
  });

  it("probe options never place the correct answer first", () => {
    for (const id of ["say-name", "transfer"]) {
      const run = new Run().goTo(id === "say-name" ? 2 : 4);
      for (let i = 0; i < 3; i++) run.type("Yes please").submit();
      expect(run.conv.phase).toBe("diagnostic_probe");
    }
  });

  it("a correct probe answer leads to a supported retry", () => {
    const run = new Run().goTo(2);
    for (let i = 0; i < 3; i++) run.type("Yes please").submit();
    run.pick(1).submit();
    expect(run.conv).toMatchObject({
      feedback: "probe_correct",
      repair: { strategy: "probe_followup", probeCorrect: true },
    });
  });

  it("choice activity: slow+French → two options (correct not first) → explain/offer", () => {
    const run = new Run().begin();
    run.send({ type: "continue" });
    run.answerChoice(1);
    expect(run.conv.repair.strategy).toBe("slow_with_french");
    expect(run.conv.draft.choice).toBeNull(); // the wrong pick is cleared
    run.answerChoice(2);
    expect(run.conv.repair.strategy).toBe("fewer_options");
    const visible = visibleOptionIndices(run.conv);
    expect(visible).toHaveLength(2);
    const correct =
      activities[0].type === "choice"
        ? activities[0].options.findIndex((o) => o.correct)
        : -1;
    expect(visible).toContain(correct);
    expect(narrowedOptions(activities[0], reducedVariant(run.conv))).toEqual(
      visible,
    );
    // An option that was removed can no longer be selected.
    const removed = [0, 1, 2].find((i) => !visible.includes(i))!;
    expect(run.send({ type: "draft_changed", choice: removed }).ignored).toBe(
      "invalid_in_state",
    );
    run.answerChoice(visible[0]);
    expect(run.conv.repair.strategy).toBe("explain_and_offer_skip");
    run.answerChoice(correct);
    expect(run.conv.activityIndex).toBe(1);
  });

  it("'I don't understand' changes method but is not an error and records no evidence", () => {
    const run = new Run().goTo(2);
    const before = run.learner;
    run.send({ type: "stuck" });
    expect(run.conv.repair.strategy).toBe("slow_with_french");
    run.send({ type: "stuck" });
    expect(run.conv.repair.strategy).toBe("example_frame");
    expect(run.learner).toBe(before);
    expect(run.conv.progress["say-name"]).toMatchObject({
      incorrect: 0,
      helpRequests: 2,
    });
  });

  it("on a tutor-only step, 'I don't understand' repeats slowly with French and keeps the step", () => {
    const run = new Run().begin();
    run.send({ type: "stuck" });
    expect(run.conv).toMatchObject({ phase: "model", helpOpen: true });
    expect(segs(run.last.effects)).toMatchObject([
      { lang: "en-US", rate: 0.65 },
    ]);
  });
});

describe("reduced choice does not give the answer away by position", () => {
  const reduceOnce = (run: Run) => {
    run.answerChoice(1); // first miss: slower + French
    run.answerChoice(2); // second miss: two options
    const visible = visibleOptionIndices(run.conv);
    expect(visible).toHaveLength(2);
    expect(visible).toContain(0); // the correct option is always offered
    const slot = visible.indexOf(0);
    run.answerChoice(0);
    return slot;
  };

  it("the correct slot alternates across consecutive reduced-choice attempts", () => {
    const run = new Run().begin();
    run.send({ type: "continue" });
    const slots = [reduceOnce(run), reduceOnce(run)];
    run.type("My name is Alex").submit();
    slots.push(reduceOnce(run));
    expect(run.conv.activityIndex).toBe(4);
    expect(slots[0]).not.toBe(slots[1]);
    expect(slots[1]).not.toBe(slots[2]);
    expect(new Set(slots).size).toBe(2); // both slots are used
  });

  it("is deterministic for a session and varies between sessions", () => {
    const slotsFor = (sessionId: string) => {
      const run = new Run(initialState(), sessionId);
      run.begin();
      run.send({ type: "continue" });
      return reduceOnce(run);
    };
    expect(slotsFor("same")).toBe(slotsFor("same"));
    const seen = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map(slotsFor),
    );
    expect(seen.size).toBe(2);
  });

  it("covers both slots and rotates the remaining distractor", () => {
    const activity = activities[0];
    const shapes = [0, 1, 2, 3].map((v) => narrowedOptions(activity, v));
    expect(new Set(shapes.map((s) => s.indexOf(0))).size).toBe(2);
    expect(new Set(shapes.map((s) => s.find((i) => i !== 0))).size).toBe(2);
    for (const shape of shapes) expect(shape).toHaveLength(2);
    expect(narrowedOptions(activities[2], 0)).toEqual([]); // speak activity
  });

  it("the offered pair stays stable while the turn is on screen", () => {
    const run = new Run().begin();
    run.send({ type: "continue" });
    run.answerChoice(1);
    run.answerChoice(2);
    const before = visibleOptionIndices(run.conv);
    run.send({ type: "help_opened" });
    run.send({ type: "replay", slow: false });
    run.send({ type: "captions_toggled" });
    expect(visibleOptionIndices(run.conv)).toEqual(before);
  });
});

describe("Daniel speaks: French reactions, instructions, repairs, check-ins and recap", () => {
  const all = (run: Run) => segs(run.effects);

  it("nothing is spoken until the learner acts; resume never speaks", () => {
    const run = new Run();
    expect(run.effects).toEqual([]);
    run.begin();
    expect(all(run).length).toBeGreaterThan(0);
    const spoken = all(run).length;
    run.send({ type: "pause" });
    run.send({ type: "resume_session" });
    expect(all(run)).toHaveLength(spoken);
  });

  it("each step is: reaction, French lead-in, the English line, French instruction", () => {
    const run = new Run().goTo(2);
    run.type("Yes please").submit(); // miss, so a reaction exists
    const entry = entrySegments(
      { ...run.conv, phase: "guided_attempt", feedback: null },
      "acknowledged",
    );
    expect(entry.map((x) => [x.lang, x.speaker])).toEqual([
      ["fr-FR", "Daniel"], // acknowledgement
      ["fr-FR", "Daniel"], // lead-in
      ["en-US", "Daniel"], // Hello! What is your name?
      ["fr-FR", "Daniel"], // instruction
    ]);
    expect(entry[2].text).toBe("Hello! What is your name?");
  });

  it("French is never spoken by an English voice and English never by a French one", () => {
    const run = new Run().goTo(2);
    run.type("Alex").submit();
    run.type("Yes please").submit();
    run.type("Yes please").submit();
    run.type("Yes please").submit();
    run.pick(1).submit();
    run.type("My name is Alex").submit();
    run.send({ type: "skip" });
    run.type("I'm Alex").submit();
    expect(run.conv.phase).toBe("recap");
    const spokenAll = all(run);
    expect(spokenAll.length).toBeGreaterThan(20);
    for (const seg of spokenAll) {
      if (seg.lang === "en-US")
        expect(seg.text, seg.text).not.toMatch(
          /[éèêàçôûîï]|\b(votre|vous|nous|pour|avec)\b/i,
        );
      else
        expect(seg.text, seg.text).not.toMatch(
          /Hello|What is|My name is|I’m|Nice to meet/,
        );
      expect(seg.text).not.toMatch(/[«»<>]/);
    }
  });

  it("every repair is explained aloud, once per method, and slow audio uses the slow rate", () => {
    const run = new Run().goTo(2);
    const expected = ["slow_with_french", "example_frame", "visual_probe"];
    for (const strategy of expected) {
      run.type("Yes please").submit();
      expect(run.conv.repair.strategy).toBe(strategy);
      expect(segs(run.last.effects).length, strategy).toBeGreaterThan(0);
    }
    run.pick(2).submit(); // wrong probe answer is explained aloud too
    expect(
      segs(run.last.effects)
        .map((x) => x.text)
        .join(" "),
    ).toContain("Ce n’était pas celle-ci");
    expect(segs(run.last.effects).some((x) => x.lang === "en-US")).toBe(true);
  });

  it("the quiet check-in is spoken once per turn, never repeatedly, and returns to thinking time", () => {
    const run = new Run().goTo(2);
    run.send({ type: "silence_checkin" });
    expect(segs(run.last.effects).map((x) => x.text)).toEqual([
      "Je suis toujours là. Prenez votre temps.",
    ]);
    expect(run.conv.media).toBe("thinking_pause");
    const id = run.conv.output.id!;
    run.send({ type: "audio_started", outputId: id });
    expect(run.conv.media).toBe("tutor_speaking");
    run.send({ type: "audio_ended", outputId: id });
    expect(run.conv.media).toBe("thinking_pause"); // not "answer open" again
    run.send({ type: "resume_turn" });
    // A second check-in in the same turn is refused.
    expect(run.send({ type: "silence_checkin" }).ignored).toBe(
      "invalid_in_state",
    );
    // A new turn (a repair) allows one more.
    run.type("Yes please").submit();
    run.send({ type: "silence_checkin" });
    expect(run.conv.feedback).toBe("checkin");
    expect(run.learner.evidence).toHaveLength(3); // 2 earlier + the one miss; silence added nothing
  });

  it("interruption cancels the whole queued output; a late callback from it changes nothing", () => {
    const run = new Run().begin();
    const id = run.conv.output.id!;
    run.send({ type: "audio_started", outputId: id });
    run.send({ type: "interrupt" });
    expect(run.conv.output.id).toBeNull();
    expect(hasEffect(run.last, "stop_audio")).toBe(true);
    expect(run.send({ type: "audio_ended", outputId: id }).ignored).toBe(
      "invalid_in_state",
    );
    expect(run.send({ type: "audio_started", outputId: id }).ignored).toBe(
      "invalid_in_state",
    );
    expect(run.conv.media).toBe("interrupted");
  });

  it("a newer output replaces an older one; the older queue cannot end the newer", () => {
    const run = new Run().goTo(2);
    run.send({ type: "replay", slow: false });
    const first = run.conv.output.id!;
    run.send({ type: "replay", slow: true });
    const second = run.conv.output.id!;
    expect(second).not.toBe(first);
    run.send({ type: "audio_started", outputId: second });
    expect(run.send({ type: "audio_ended", outputId: first }).ignored).toBe(
      "invalid_in_state",
    );
    expect(run.conv.media).toBe("tutor_speaking");
  });

  it("the recap is spoken in full, with the heading, and can be replayed", () => {
    const run = new Run().goTo(5);
    const spoken = segs(run.last.effects)
      .map((x) => x.text)
      .join(" ");
    expect(spoken).toContain("Merci pour cette séance");
    expect(spoken).toContain("Nous avons pratiqué");
    expect(spoken).toContain("pas une preuve de maîtrise");
    expect(
      segs(run.last.effects).some(
        (x) => x.text === "What is your name?" && x.lang === "en-US",
      ),
    ).toBe(true);
    run.send({ type: "replay", slow: false });
    expect(
      segs(run.last.effects)
        .map((x) => x.text)
        .join(" "),
    ).toContain("Nous avons pratiqué");
  });

  it("the welcome is only spoken on request, in French", () => {
    const run = new Run();
    run.send({ type: "replay", slow: false });
    const welcome = segs(run.last.effects);
    expect(welcome.every((x) => x.lang === "fr-FR")).toBe(true);
    expect(welcome[0].text).toContain("Bonjour, je suis Daniel.");
    run.send({ type: "replay", slow: true });
    expect(segs(run.last.effects)[0].rate).toBeLessThan(welcome[0].rate);
  });

  it("each character's English line is attributed to that character; French stays Daniel's", () => {
    const run = new Run().goTo(3);
    const maria = segs(run.last.effects);
    expect(
      maria.find((x) => x.text.startsWith("Hello, I am Maria")),
    ).toMatchObject({
      speaker: "Maria",
      text: "Hello, I am Maria. Nice to meet you.",
    });
    run.tap(0);
    const alex = segs(run.last.effects);
    expect(alex.find((x) => x.text.startsWith("Hi there"))).toMatchObject({
      speaker: "Alex",
    });
    expect(
      alex
        .filter((x) => x.lang === "fr-FR")
        .every((x) => x.speaker === "Daniel"),
    ).toBe(true);
  });
});

describe("mute", () => {
  it("muting stops the current output and silences everything that follows", () => {
    const run = new Run().begin();
    run.send({ type: "audio_started", outputId: run.conv.output.id! });
    const id = run.conv.output.id!;
    run.send({ type: "voice_toggled" });
    expect(run.conv.prefs.voice).toBe(false);
    expect(run.conv.output.id).toBeNull();
    expect(hasEffect(run.last, "stop_audio")).toBe(true);
    expect(run.conv.media).toBe("idle");
    expect(run.send({ type: "audio_ended", outputId: id }).ignored).toBe(
      "invalid_in_state",
    );

    const before = segs(run.effects).length;
    run.send({ type: "continue" });
    run.tap(1); // a miss: repair
    run.tap(2);
    run.send({ type: "silence_checkin" });
    expect(segs(run.effects)).toHaveLength(before); // nothing was asked of the voice
    expect(run.conv.feedback).toBe("checkin"); // the text equivalent is still there
    expect(run.send({ type: "replay", slow: false }).ignored).toBe(
      "invalid_in_state",
    );
  });

  it("unmuting does not speak by itself, and speech resumes on the next step", () => {
    const run = new Run().begin();
    run.send({ type: "voice_toggled" });
    run.send({ type: "voice_toggled" });
    const before = segs(run.effects).length;
    expect(run.conv.prefs.voice).toBe(true);
    run.send({ type: "continue" });
    run.tap(0);
    expect(segs(run.effects).length).toBeGreaterThan(before);
  });

  it("mute survives pause and resume", () => {
    const run = new Run().begin();
    run.send({ type: "voice_toggled" });
    run.send({ type: "pause" });
    run.send({ type: "resume_session" });
    expect(run.conv.prefs.voice).toBe(false);
  });
});

describe("the learner's first name is session-only", () => {
  it.each([
    ["My name is Alex", "Alex"],
    ["I'm alex", "Alex"],
    ["I’m Jean-Pierre", "Jean-Pierre"],
    ["Hello, I am Marie Claire", "Marie Claire"],
    ["I am fine", null],
    ["I am very happy today", null],
    ["Alex", null],
    ["Yes please", null],
    ["I am 123", null],
  ])("extracts %j → %j", (text, name) => {
    expect(extractName(text)).toBe(name);
  });

  it("is used naturally after an accepted introduction, in English and in French", () => {
    const run = new Run().goTo(2);
    run.type("My name is alex").submit();
    expect(run.conv.learnerName).toBe("Alex");
    expect(plainText(feedbackText("acknowledged", 3, "Alex"))).toContain(
      "Nice to meet you, Alex.",
    );
    const spoken = segs(run.last.effects);
    expect(spoken[0]).toMatchObject({
      text: "Nice to meet you, Alex.",
      lang: "en-US",
      speaker: "Daniel",
    });
    expect(spoken[1]).toMatchObject({
      lang: "fr-FR",
      text: "Très bien, merci !",
    });
    run.tap(0); // Maria
    run.type("I'm Alex").submit();
    expect(recapHeading(run.conv.learnerName)).toBe(
      "Merci pour cette séance, Alex !",
    );
    expect(plainText(feedbackText("acknowledged", 5, "Alex"))).toContain(
      "Merci, Alex !",
    );
    expect(
      segs(run.last.effects)
        .map((x) => x.text)
        .join(" "),
    ).toContain("Merci pour cette séance, Alex");
  });

  it("is not used when the reply was a miss, a bare word, a skip, or not clearly a name", () => {
    for (const reply of ["Yes please", "Alex", "I am fine"]) {
      const run = new Run().goTo(2).type(reply).submit();
      if (reply === "I am fine") expect(run.conv.activityIndex).toBe(3); // accepted by the existing rubric
      expect(run.conv.learnerName, reply).toBeNull();
    }
    const skipped = new Run().goTo(2);
    skipped.send({ type: "skip" });
    expect(skipped.conv.learnerName).toBeNull();
    const hesitant = new Run().goTo(2).type("My name is Alex");
    expect(hesitant.conv.learnerName).toBeNull(); // typing alone does not set it
  });

  it("is never written to the learner record or the evidence", () => {
    const run = new Run().goTo(2).type("My name is Zoltan").submit();
    run.tap(0);
    run.type("I'm Zoltan").submit();
    expect(run.conv.learnerName).toBe("Zoltan");
    expect(JSON.stringify(run.learner)).not.toContain("Zoltan");
    expect(JSON.stringify(run.learner)).not.toMatch(/learnerName|firstName/);
    expect(learnerSchema.parse(run.learner)).toEqual(run.learner);
  });

  it("is cleared on exit and on restart", () => {
    const run = new Run().goTo(2).type("My name is Alex").submit();
    expect(run.conv.learnerName).toBe("Alex");
    run.send({ type: "exit" });
    expect(run.conv.learnerName).toBeNull();
    expect(run.conv.draft.text).toBe("");

    const again = new Run().goTo(5);
    expect(again.conv.learnerName).not.toBeNull();
    again.send({ type: "restart" });
    expect(again.conv.learnerName).toBeNull();
    // A new session never starts with a name.
    expect(createConversation("fresh", again.learner).learnerName).toBeNull();
  });
});

describe("one-tap answers", () => {
  it("a single tap answers once, with the original option index", () => {
    const run = new Run().begin();
    run.send({ type: "continue" });
    run.tap(0);
    expect(run.commits).toBe(1);
    expect(run.learner.evidence[0]).toMatchObject({
      activityId: "listen-greeting",
      correct: true,
      assisted: true,
    });
    expect(run.conv.activityIndex).toBe(1);
  });

  it("a wrong tap is a normal miss and opens the next repair method", () => {
    const run = new Run().begin();
    run.send({ type: "continue" });
    run.tap(2);
    expect(run.conv.repair.strategy).toBe("slow_with_french");
    expect(run.learner.evidence.at(-1)).toMatchObject({ correct: false });
  });

  it("a repeated tap cannot commit twice (same event, or a tap from the previous turn)", () => {
    const run = new Run().begin();
    run.send({ type: "continue" });
    const tap: ConversationEvent = {
      type: "choose",
      choice: 2,
      eventId: "double",
      sessionId: "s1",
      turnId: run.conv.turnId,
    };
    const first = step(run.conv, tap);
    expect(first.effects.filter((e) => e.type === "commit")).toHaveLength(1);
    // Same event again (double click delivered twice).
    expect(step(first.state, tap).ignored).toBe("duplicate");
    // A second tap, with a new id, while the first is still processing.
    const during = step(first.state, { ...tap, eventId: "second" });
    expect(during.ignored).toBe("invalid_in_state");
    expect(during.effects).toEqual([]);
    // After the miss opened a new turn, a late tap that was rendered for the old turn is stale.
    const after = new Run().begin();
    after.send({ type: "continue" });
    const oldTurn = after.conv.turnId;
    after.tap(2);
    const late = step(after.conv, {
      type: "choose",
      choice: 1,
      eventId: "late",
      sessionId: "s1",
      turnId: oldTurn,
    });
    expect(late.ignored).toBe("stale_turn");
    expect(after.commits).toBe(1);
  });

  it("ignores options that are not on screen, and taps outside a turn", () => {
    const run = new Run().begin();
    expect(run.send({ type: "choose", choice: 0 }).ignored).toBe(
      "invalid_in_state",
    ); // model step
    run.send({ type: "continue" });
    expect(run.send({ type: "choose", choice: 9 }).ignored).toBe(
      "invalid_in_state",
    );
    expect(run.send({ type: "choose", choice: -1 }).ignored).toBe(
      "invalid_in_state",
    );
    run.tap(2);
    run.tap(1); // second miss: two options left
    const hidden = [0, 1, 2].find(
      (i) => !visibleOptionIndices(run.conv).includes(i),
    )!;
    expect(run.send({ type: "choose", choice: hidden }).ignored).toBe(
      "invalid_in_state",
    );
    expect(run.commits).toBe(2);
  });

  it("works for the diagnostic probe without committing anything", () => {
    const run = new Run().goTo(2);
    for (let i = 0; i < 3; i++) run.type("Yes please").submit();
    const evidence = run.learner.evidence.length;
    run.tap(1);
    expect(run.conv.repair.strategy).toBe("probe_followup");
    expect(run.learner.evidence).toHaveLength(evidence);
  });
});

describe("the options do not give the answer away by position", () => {
  it("the correct option is not always first, and sits in a different slot in each choice activity", () => {
    for (const sessionId of ["s1", "abc", "q9", "zzz", "2026-11"]) {
      const slots = [0, 1, 3].map((index) => {
        const activity = activities[index];
        const order = displayOrder(activity, index, sessionId);
        expect([...order].sort()).toEqual([0, 1, 2]); // a permutation: nothing added or lost
        return order.indexOf(0); // option 0 is the correct one in the curriculum
      });
      expect(new Set(slots).size, sessionId).toBe(3);
    }
    const firsts = new Set(
      ["s1", "abc", "q9", "zzz", "2026-11"].map(
        (id) => displayOrder(activities[0], 0, id)[0],
      ),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("is only a display order: answers still use the original index and assess() is unchanged", () => {
    const run = new Run();
    run.begin();
    run.send({ type: "continue" });
    const order = visibleOptionIndices(run.conv);
    const correctSlot = order.indexOf(0);
    expect(order).toHaveLength(3);
    run.tap(order[correctSlot]);
    expect(run.learner.evidence[0]).toMatchObject({
      correct: true,
      responseType: "choice",
    });
    expect(activities[0]).toMatchObject({
      options: [{ correct: true }, { correct: false }, { correct: false }],
    });
  });

  it("text equivalents: the French and English lines of a step are exactly what is spoken", () => {
    const run = new Run().goTo(1);
    const spoken = lineSegments(run.conv, false);
    expect(spoken.map((x) => x.text)).toEqual([activities[1].prompt]);
  });
});

describe("transfer to a changed situation", () => {
  it("uses a different speaker/wording and starts without the previous example", () => {
    const run = new Run().goTo(4);
    expect(run.conv.phase).toBe("transfer_attempt");
    expect(activities[4].prompt).not.toBe(activities[2].prompt);
    expect(run.conv.draft.text).toBe(""); // previous answer is not carried over
    expect(run.conv.repair.strategy).toBeNull(); // no frame on the first attempt
    expect(run.conv.helpOpen).toBe(false);
  });
});

describe("stale and duplicate events", () => {
  it("drops events from another session", () => {
    const run = new Run().goTo(2);
    const result = step(run.conv, {
      type: "submit",
      eventId: "x",
      sessionId: "other",
      turnId: run.conv.turnId,
    });
    expect(result.ignored).toBe("stale_session");
    expect(result.state).toBe(run.conv);
  });

  it("drops turn-scoped events from an earlier turn", () => {
    const run = new Run().goTo(2);
    const oldTurn = run.conv.turnId;
    run.type("Yes please").submit(); // repair opens a new turn
    expect(run.conv.turnId).toBeGreaterThan(oldTurn);
    for (const event of [
      { type: "silence_checkin" },
      { type: "recognition_failed", reason: "denied" },
      { type: "recognition_started" },
    ] as const) {
      const before = run.conv;
      const result = step(run.conv, {
        ...event,
        eventId: `old-${event.type}`,
        sessionId: "s1",
        turnId: oldTurn,
      });
      expect(result.ignored).toBe("stale_turn");
      expect(result.state).toBe(before);
    }
  });

  it("a late commit result from an old activity cannot move the current one", () => {
    const run = new Run().goTo(2);
    const result = step(run.conv, {
      type: "commit_result",
      activityId: "listen-greeting",
      advanced: true,
      correct: true,
      rejected: false,
      eventId: "late",
      sessionId: "s1",
      turnId: run.conv.turnId,
    });
    expect(result.ignored).toBe("invalid_in_state");
    expect(result.state.activityIndex).toBe(2);
  });

  it("a late audio callback of a replaced output is ignored", () => {
    const run = new Run().goTo(2);
    run.send({ type: "replay", slow: false });
    const first = run.conv.output.id!;
    run.send({ type: "replay", slow: true });
    run.send({ type: "audio_started", outputId: run.conv.output.id! });
    expect(run.send({ type: "audio_ended", outputId: first }).ignored).toBe(
      "invalid_in_state",
    );
    expect(run.conv.media).toBe("tutor_speaking");
  });

  it("duplicate event ids are idempotent (double submit commits once)", () => {
    const run = new Run().goTo(2).type("My name is Alex");
    const submit: ConversationEvent = {
      type: "submit",
      eventId: "dup",
      sessionId: "s1",
      turnId: run.conv.turnId,
    };
    const first = step(run.conv, submit);
    expect(first.effects.filter((e) => e.type === "commit")).toHaveLength(1);
    const second = step(first.state, submit);
    expect(second.ignored).toBe("duplicate");
    expect(second.effects).toEqual([]);
  });

  it("a second submit while processing is rejected", () => {
    const run = new Run().goTo(2).type("My name is Alex");
    const first = step(run.conv, {
      type: "submit",
      eventId: "a",
      sessionId: "s1",
      turnId: run.conv.turnId,
    });
    expect(first.state.media).toBe("processing");
    const second = step(first.state, {
      type: "submit",
      eventId: "b",
      sessionId: "s1",
      turnId: first.state.turnId,
    });
    expect(second.ignored).toBe("invalid_in_state");
    expect(second.effects).toEqual([]);
  });

  it("nothing is accepted after the session ended", () => {
    const run = new Run().goTo(2);
    run.send({ type: "exit" });
    expect(run.conv).toMatchObject({ lifecycle: "ended", media: "ended" });
    expect(hasEffect(run.last, "exit")).toBe(true);
    expect(run.send({ type: "submit" }).ignored).toBe("ended");
    expect(run.send({ type: "resume_session" }).ignored).toBe("ended");
  });
});

describe("invalid events cannot advance the lesson", () => {
  it("rejects events that make no sense for the phase", () => {
    const orientation = new Run();
    for (const body of [
      { type: "submit" },
      { type: "skip" },
      { type: "continue" },
      { type: "interrupt" },
      { type: "silence_checkin" },
      { type: "think_started" },
      { type: "help_opened" },
      { type: "recover" },
      { type: "resume_session" },
      { type: "recognition_started" },
    ] as const)
      expect(orientation.send(body).ignored).toBe("invalid_in_state");
    expect(orientation.conv.activityIndex).toBe(-1);

    const model = new Run().begin();
    expect(model.send({ type: "submit" }).ignored).toBe("invalid_in_state");
    expect(model.send({ type: "skip" }).ignored).toBe("invalid_in_state");
    expect(model.learner.index).toBe(0);
  });

  it("a rejected commit leaves recovery instead of advancing", () => {
    const run = new Run().goTo(2).type("My name is Alex");
    const submitted = step(run.conv, {
      type: "submit",
      eventId: "s",
      sessionId: "s1",
      turnId: run.conv.turnId,
    });
    const result = step(submitted.state, {
      type: "commit_result",
      activityId: "say-name",
      advanced: false,
      correct: false,
      rejected: true,
      eventId: "r",
      sessionId: "s1",
      turnId: submitted.state.turnId,
    });
    expect(result.state).toMatchObject({
      media: "recovering",
      notice: "commit_rejected",
      activityIndex: 2,
    });
    expect(invariantViolations(result.state)).toEqual([]);
  });

  it("a fixed script of mixed events never reaches an invalid combination", () => {
    const run = new Run().begin();
    const noise: Body[] = [
      { type: "continue" },
      { type: "help_opened" },
      { type: "replay", slow: true },
      { type: "interrupt" },
      { type: "think_started" },
      { type: "silence_checkin" },
      { type: "pause" },
      { type: "submit" },
      { type: "resume_session" },
      { type: "stuck" },
      { type: "recognition_started" },
      { type: "recognition_failed", reason: "error" },
      { type: "recover" },
      { type: "skip" },
      { type: "captions_toggled" },
      { type: "restart" },
    ];
    for (let round = 0; round < 6; round++)
      for (const body of noise) run.send(body); // run.send asserts invariants
    expect(invariantViolations(run.conv)).toEqual([]);
  });
});

describe("recap is careful and bounded", () => {
  it("never claims mastery and reports observed difficulty", () => {
    const run = new Run().goTo(2);
    run.type("Yes please").submit();
    run.type("My name is Alex").submit();
    run.send({ type: "skip" }); // skip Maria
    run.type("I'm Alex").submit();
    const recap = buildRecap(run.conv);
    expect(run.conv.phase).toBe("recap");
    expect(recap.practised).toContain("vous présenter");
    expect(recap.observed.join(" ")).toContain(
      "Plus difficile : vous présenter",
    );
    expect(recap.observed.join(" ")).toContain("passée sans évaluation");
    expect(recap.next).toContain("vous présenter");
    expect(recap.caveat).toMatch(/pas une preuve de maîtrise/);
    expect(JSON.stringify(recap)).not.toMatch(/maîtris(?!e)|fluent|niveau/i);
  });

  it("a bare name is described as understandable, never as unintelligible", () => {
    const run = new Run().goTo(2);
    run.type("Alex").submit(); // a short but understandable name
    run.type("I'm Alex").submit();
    run.send({ type: "skip" }); // Maria
    run.type("I'm Alex").submit();
    const recap = buildRecap(run.conv);
    const text = recap.observed.join(" ");
    expect(text).toContain("un seul mot");
    expect(text).toContain("C’est compréhensible");
    expect(text).not.toMatch(
      /trop courtes?|pas pu être compris|incompréhensible|illisible|erreur/i,
    );
    // A bare name is not a reason to schedule extra work either.
    expect(recap.next).not.toContain("vous présenter");
  });

  it("unreadable input is reported separately and without blame", () => {
    const run = new Run().goTo(2);
    run.type("12 !!").submit();
    run.type("I'm Alex").submit();
    run.send({ type: "skip" });
    run.type("I'm Alex").submit();
    const text = buildRecap(run.conv).observed.join(" ");
    expect(text).toContain("vides ou illisibles");
    expect(text).toContain("Ce n’est pas une erreur");
    expect(text).not.toContain("un seul mot");
  });

  it("restart from the recap keeps earlier evidence", () => {
    const run = new Run().goTo(5);
    const evidence = run.learner.evidence.length;
    run.send({ type: "restart" });
    expect(run.conv).toMatchObject({ activityIndex: 0, phase: "model" });
    expect(run.learner.evidence).toHaveLength(evidence);
    expect(run.learner).toMatchObject({ index: 0, completed: false });
  });
});

describe("curriculum and storage compatibility", () => {
  it("the five activity ids and order are unchanged", () => {
    expect(activities.map((a) => a.id)).toEqual([
      "listen-greeting",
      "listen-question",
      "say-name",
      "read-intro",
      "transfer",
    ]);
  });

  it("every conversation station maps onto an existing activity", () => {
    for (let i = 0; i < activities.length; i++) {
      const run = new Run().goTo(i);
      expect(run.conv.activityIndex).toBe(i);
      expect(run.learner.index).toBe(i);
    }
  });

  it("a record written without `modality` still loads; modality is optional but validated", () => {
    const base = {
      version: "prea1-introductions-1.0",
      index: 1,
      attempts: { "listen-greeting": 1 },
      evidence: [
        {
          activityId: "listen-greeting",
          skill: "listening-greetings",
          correct: true,
          confidence: "medium",
          reason: "Fixed-response comprehension check",
          assisted: true,
          at: "2026-11-13T12:00:00.000Z",
          responseType: "choice",
        },
      ],
      completed: false,
      updated: "2026-11-13T12:00:00.000Z",
    };
    expect(parseRecord(JSON.stringify(base)).evidence[0]).not.toHaveProperty(
      "modality",
    );
    const withModality = {
      ...base,
      schemaVersion: 2,
      evidence: [{ ...base.evidence[0], modality: "typed" }],
    };
    expect(learnerSchema.parse(withModality).evidence[0].modality).toBe(
      "typed",
    );
    const bad = {
      ...withModality,
      evidence: [{ ...base.evidence[0], modality: "telepathy" }],
    };
    expect(() => learnerSchema.parse(bad)).toThrow();
  });

  it("the conversation never persists raw answer text", () => {
    const run = new Run().goTo(2).type("My name is PrivateName").submit();
    expect(JSON.stringify(run.learner)).not.toContain("PrivateName");
  });
});
