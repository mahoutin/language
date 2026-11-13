export type Skill =
  | "listening-greetings"
  | "listening-name-question"
  | "speaking-introduction"
  | "reading-introduction";
type ActivityBase = {
  id: string;
  stage: string;
  title: string;
  prompt: string;
  french: string;
  instruction: string;
  skill: Skill;
};
export type Activity = ActivityBase &
  (
    | {
        type: "choice";
        options: readonly { label: string; correct: boolean }[];
      }
    | { type: "speak" }
  );
// Versioned, auditable instructional content. These are practice prompts, not a validated assessment.
export const curriculumVersion = "prea1-introductions-1.0";
export const activities: readonly Activity[] = [
  {
    id: "listen-greeting",
    stage: "Listen",
    title: "Listen to a greeting",
    prompt: "Hello! My name is Daniel.",
    french: "Bonjour ! Je m’appelle Daniel.",
    instruction: "Listen first. What is the person doing?",
    type: "choice",
    options: [
      { label: "Introducing himself", correct: true },
      { label: "Asking for directions", correct: false },
      { label: "Ordering food", correct: false },
    ],
    skill: "listening-greetings",
  },
  {
    id: "listen-question",
    stage: "Understand",
    title: "Understand a question",
    prompt: "What is your name?",
    french: "Comment vous appelez-vous ?",
    instruction: "Listen carefully. What is the speaker asking?",
    type: "choice",
    options: [
      { label: "Your name", correct: true },
      { label: "Your age", correct: false },
      { label: "Where you live", correct: false },
    ],
    skill: "listening-name-question",
  },
  {
    id: "say-name",
    stage: "Speak",
    title: "Introduce yourself",
    prompt: "Hello! What is your name?",
    french: "Bonjour ! Comment vous appelez-vous ?",
    instruction:
      "Speak your answer naturally. You can also type if voice recognition is unavailable.",
    type: "speak",
    skill: "speaking-introduction",
  },
  {
    id: "read-intro",
    stage: "Read",
    title: "Read an introduction",
    prompt: "Hello, I am Maria. Nice to meet you.",
    french: "Bonjour, je suis Maria. Enchantée.",
    instruction: "Who is introducing herself?",
    type: "choice",
    options: [
      { label: "Maria", correct: true },
      { label: "Daniel", correct: false },
      { label: "Nobody", correct: false },
    ],
    skill: "reading-introduction",
  },
  {
    id: "transfer",
    stage: "Apply",
    title: "Meet someone new",
    prompt: "Hi there! I’m Alex. And you?",
    french: "Salut ! Je m’appelle Alex. Et vous ?",
    instruction:
      "Different wording, same situation. Introduce yourself without copying an example.",
    type: "speak",
    skill: "speaking-introduction",
  },
];

export type Assessment = {
  correct: boolean;
  confidence: "medium" | "low";
  reason: string;
};
export function assess(
  activity: Activity,
  response: string | number,
): Assessment {
  if (activity.type === "choice")
    return {
      correct:
        typeof response === "number" &&
        response === activity.options.findIndex((x) => x.correct),
      confidence: "medium",
      reason: "Fixed-response comprehension check",
    };
  // Requires an introduction AND a nonempty name. Still not a pronunciation or mastery score.
  const text = String(response).trim().replace(/’/g, "'");
  const correct =
    /\b(?:my name is|i am|i'm|im)\s+[\p{L}][\p{L}\p{M}'-]*(?:\s+[\p{L}][\p{L}\p{M}'-]*)*[.!?]?$/iu.test(
      text,
    );
  return {
    correct,
    confidence: "low",
    reason:
      "Heuristic practice feedback; not a reliable language or pronunciation assessment",
  };
}
export function decide(
  attempts: number,
  correct: boolean,
): "continue" | "scaffold" | "retry" {
  return correct ? "continue" : attempts >= 2 ? "scaffold" : "retry";
}
