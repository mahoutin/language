import { describe, expect, it } from "vitest";
import {
  activities,
  assess,
  curriculumVersion,
} from "../../src/domain/curriculum";
import {
  initialState,
  parseRecord,
  transition,
} from "../../src/domain/learner";
import { loadLearner, saveLearner } from "../../src/lib/learner-storage";
describe("curriculum controller", () => {
  it("keeps all five original activities and their order", () => {
    expect(activities.map((a) => a.id)).toEqual([
      "listen-greeting",
      "listen-question",
      "say-name",
      "read-intro",
      "transfer",
    ]);
  });
  it.each([
    "I'm Alex",
    "I’m Alex",
    "My name is Marie",
    "Hello, I am Jean-Pierre",
  ])("accepts a complete introduction: %s", (response) => {
    expect(assess(activities[2], response)).toMatchObject({
      correct: true,
      confidence: "low",
    });
  });
  it.each(["my name is", "I am", "hello", "", "I am 123"])(
    "rejects an incomplete introduction: %s",
    (response) => expect(assess(activities[2], response).correct).toBe(false),
  );
  it("retries, scaffolds, then progresses without declaring mastery", () => {
    let state = initialState();
    const action = {
      type: "answer" as const,
      activityId: activities[0].id,
      response: 1,
      assisted: false,
    };
    const retry = transition(state, action);
    expect(retry.state.index).toBe(0);
    expect(retry.feedback).toContain("Essayez encore");
    const scaffold = transition(retry.state, action);
    expect(scaffold.feedback).toContain("traduction");
    state = transition(scaffold.state, { ...action, response: 0 }).state;
    expect(state.index).toBe(1);
    expect(state.evidence).toHaveLength(3);
    expect(state.completed).toBe(false);
  });
  it("ignores stale actions and malformed answers without adding evidence", () => {
    const state = initialState();
    expect(
      transition(state, { type: "skip", activityId: "transfer" }).state,
    ).toBe(state);
    for (const response of [-1, 99, "0", 1.5, ""])
      expect(
        transition(state, {
          type: "answer",
          activityId: activities[0].id,
          response,
          assisted: false,
        }).state,
      ).toBe(state);
  });
  it("completes via skips with no successful evidence and retains history on restart", () => {
    let state = initialState();
    for (const activity of activities)
      state = transition(state, {
        type: "skip",
        activityId: activity.id,
      }).state;
    expect(state.completed).toBe(true);
    expect(
      state.evidence.every((e) => !e.correct && e.confidence === "none"),
    ).toBe(true);
    const restarted = transition(state, { type: "restart" }).state;
    expect(restarted.index).toBe(0);
    expect(restarted.evidence).toHaveLength(5);
  });
});
describe("learner memory boundary", () => {
  it("migrates a valid original record", () => {
    const original = {
      version: curriculumVersion,
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
    expect(parseRecord(JSON.stringify(original))).toEqual({
      ...original,
      schemaVersion: 2,
    });
  });
  it.each([
    "bad json",
    JSON.stringify({ ...initialState(), index: 400 }),
    JSON.stringify({ ...initialState(), completed: true }),
    JSON.stringify({ ...initialState(), version: "future" }),
  ])("protects incompatible data", (raw) => {
    expect(loadLearner({ getItem: () => raw })).toMatchObject({
      writable: false,
      state: initialState(),
    });
  });
  it("handles storage denial and quota failures", () => {
    expect(
      loadLearner({
        getItem: () => {
          throw new Error("denied");
        },
      }).writable,
    ).toBe(false);
    expect(
      saveLearner(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        initialState(),
      ),
    ).toBe(false);
  });
  it("never persists raw response text", () => {
    let state = initialState();
    for (const activity of activities.slice(0, 2))
      state = transition(state, {
        type: "skip",
        activityId: activity.id,
      }).state;
    state = transition(state, {
      type: "answer",
      activityId: "say-name",
      response: "I'm PrivateName",
      assisted: true,
    }).state;
    expect(JSON.stringify(state)).not.toContain("PrivateName");
  });
});
