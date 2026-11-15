import { activities } from "../curriculum";
import type { ConversationState } from "./types";

/**
 * Careful, evidence-bounded recap. It reports what was practised and what was
 * observed in THIS simulated session. It never claims mastery: every answer in
 * Phase 1B is aided (English and French support are visible), and a scripted
 * walkthrough is not an independent assessment.
 */

const topics: Record<string, string> = {
  "listen-greeting": "comprendre une salutation",
  "listen-question": "comprendre la question « <en>What is your name?</en> »",
  "say-name": "vous présenter",
  "read-intro": "lire la présentation de Maria",
  transfer: "vous présenter dans une situation différente",
};

export type Recap = {
  practised: string[];
  observed: string[];
  next: string | null;
  caveat: string;
};

export function buildRecap(state: ConversationState): Recap {
  const practised: string[] = [];
  const observed: string[] = [];
  let focus: string | null = null;

  for (const activity of activities) {
    const p = state.progress[activity.id];
    if (!p || (!p.correct && !p.skipped && p.attempts === 0)) continue;
    const topic = topics[activity.id];
    practised.push(topic);
    if (p.skipped) {
      observed.push(`Étape passée sans évaluation : ${topic}.`);
      focus ??= topic;
    } else if (p.incorrect > 0 || p.strategies.length > 0) {
      observed.push(
        `Plus difficile : ${topic}. Nous avons changé de méthode avant d’y arriver.`,
      );
      focus ??= topic;
    } else if (p.helpRequests > 0) {
      observed.push(`Vous avez demandé de l’aide pour : ${topic}.`);
    }
  }
  const total = (key: "unclear" | "partial") =>
    Object.values(state.progress).reduce((n, p) => n + p[key], 0);
  // A short answer such as a bare name is understandable: say so, and never
  // present it as a problem with the learner's English.
  if (total("partial") > 0)
    observed.push(
      "Vous avez parfois répondu par un seul mot, par exemple votre prénom. C’est compréhensible : je vous ai simplement proposé une phrase complète.",
    );
  if (total("unclear") > 0)
    observed.push(
      "Quelques saisies étaient vides ou illisibles pour moi (des symboles, par exemple). Ce n’est pas une erreur.",
    );
  if (observed.length === 0 && practised.length > 0)
    observed.push(
      "Aucune difficulté notable dans cette séance, avec l’anglais et le français visibles.",
    );

  return {
    practised,
    observed,
    next: focus ? `À retravailler une prochaine fois : ${focus}.` : null,
    caveat:
      "Ces réponses ont été faites avec de l’aide (anglais et français visibles). Ce n’est pas une preuve de maîtrise, ni une évaluation de votre prononciation.",
  };
}
