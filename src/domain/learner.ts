import { z } from "zod";
import { activities, assess, curriculumVersion, decide } from "./curriculum";
const activityIds = new Set(activities.map((a) => a.id));
const evidenceSchema = z
  .object({
    activityId: z.string().refine((id) => activityIds.has(id)),
    skill: z.enum([
      "listening-greetings",
      "listening-name-question",
      "speaking-introduction",
      "reading-introduction",
    ]),
    correct: z.boolean(),
    confidence: z.enum(["medium", "low", "none"]),
    reason: z.string().max(300),
    assisted: z.boolean(),
    at: z.iso.datetime(),
    responseType: z.enum(["choice", "speak"]).optional(),
  })
  .refine(
    (e) => activities.find((a) => a.id === e.activityId)?.skill === e.skill,
  );
export const learnerSchema = z
  .object({
    schemaVersion: z.literal(2),
    version: z.literal(curriculumVersion),
    index: z.number().int().min(0).max(activities.length),
    attempts: z.record(
      z.string().refine((id) => activityIds.has(id)),
      z.number().int().nonnegative(),
    ),
    evidence: z.array(evidenceSchema).max(10000),
    completed: z.boolean(),
    updated: z.iso.datetime().nullable(),
  })
  .refine((s) => s.completed === (s.index === activities.length));
export type LearnerState = z.infer<typeof learnerSchema>;
export const initialState = (): LearnerState => ({
  schemaVersion: 2,
  version: curriculumVersion,
  index: 0,
  attempts: {},
  evidence: [],
  completed: false,
  updated: null,
});
export function parseRecord(raw: string): LearnerState {
  if (raw.length > 5_000_000) throw new Error("Record too large");
  const value: unknown = JSON.parse(raw);
  // The original v1 record has no schemaVersion. Keep its curriculum/evidence intact.
  if (value && typeof value === "object" && !("schemaVersion" in value))
    return learnerSchema.parse({ ...value, schemaVersion: 2 });
  return learnerSchema.parse(value);
}
export type LessonAction =
  | {
      type: "answer";
      activityId: string;
      response: string | number;
      assisted: boolean;
    }
  | { type: "skip"; activityId: string }
  | { type: "restart" };
export function transition(
  state: LearnerState,
  action: LessonAction,
  at = new Date().toISOString(),
): { state: LearnerState; feedback: string } {
  if (action.type === "restart")
    return {
      state: {
        ...state,
        index: 0,
        completed: false,
        attempts: {},
        updated: at,
      },
      feedback: "",
    };
  const activity = activities[state.index];
  if (state.completed || !activity || action.activityId !== activity.id)
    return { state, feedback: "" };
  if (
    action.type === "answer" &&
    (activity.type === "choice"
      ? typeof action.response !== "number" ||
        !Number.isInteger(action.response) ||
        action.response < 0 ||
        action.response >= activity.options.length
      : typeof action.response !== "string" ||
        !action.response.trim() ||
        action.response.length > 500)
  )
    return {
      state,
      feedback: "Choisissez ou écrivez une réponse, ou demandez de l’aide.",
    };
  const outcome =
    action.type === "skip"
      ? {
          correct: false,
          confidence: "none" as const,
          reason: "Skipped without assessment",
        }
      : assess(activity, action.response);
  const attempts = { ...state.attempts };
  if (action.type === "answer")
    attempts[activity.id] = (attempts[activity.id] ?? 0) + 1;
  const policy = decide(attempts[activity.id] ?? 0, outcome.correct);
  const advance = action.type === "skip" || policy === "continue";
  const index = advance
    ? Math.min(activities.length, state.index + 1)
    : state.index;
  return {
    state: {
      ...state,
      attempts,
      index,
      completed: index === activities.length,
      updated: at,
      evidence: [
        ...state.evidence,
        {
          activityId: activity.id,
          skill: activity.skill,
          ...outcome,
          assisted: action.type === "answer" && action.assisted,
          at,
          responseType: activity.type,
        },
      ].slice(-10000),
    },
    feedback: advance
      ? ""
      : policy === "scaffold"
        ? "Regardez la traduction française, puis réessayez à votre rythme. Vous pouvez aussi passer."
        : "Essayez encore. Réécoutez ou demandez de l’aide.",
  };
}
