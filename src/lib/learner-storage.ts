import { initialState, parseRecord, type LearnerState } from "@/domain/learner";
export const STORAGE_KEY = "everyday-english-v1";
export type LoadResult = {
  state: LearnerState;
  writable: boolean;
  warning: string;
};
export function loadLearner(storage: Pick<Storage, "getItem">): LoadResult {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return {
      state: raw ? parseRecord(raw) : initialState(),
      writable: true,
      warning: "",
    };
  } catch {
    return {
      state: initialState(),
      writable: false,
      warning:
        "Les données enregistrées sont indisponibles ou incompatibles. Elles ne seront pas écrasées. Vous pouvez pratiquer sans sauvegarde, télécharger le fichier existant ou effacer les données depuis Mes progrès.",
    };
  }
}
export function saveLearner(
  storage: Pick<Storage, "setItem">,
  state: LearnerState,
): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
