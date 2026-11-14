"use client";
import { useEffect, useRef, useState } from "react";
import { basePath } from "@/lib/base-path";
import { activities } from "@/domain/curriculum";
import {
  initialState,
  transition,
  type LearnerState,
  type LessonAction,
} from "@/domain/learner";
import { loadLearner, saveLearner, STORAGE_KEY } from "@/lib/learner-storage";
import { TutorSession } from "./tutor-session";
type View = "home" | "lesson" | "progress";
function download(value: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LearningApp() {
  const [state, setState] = useState<LearnerState>(initialState);
  const current = useRef(state);
  const writable = useRef(true);
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  const [view, setView] = useState<View>("home");
  const [feedback, setFeedback] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let loaded;
    try {
      loaded = loadLearner(window.localStorage);
    } catch {
      loaded = {
        state: initialState(),
        writable: false,
        warning:
          "Sauvegarde indisponible. Votre pratique ne sera pas enregistrée.",
      };
    }
    current.current = loaded.state;
    writable.current = loaded.writable;
    // Read browser-only storage after hydration; one intentional mount update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loaded.state);
    setWarning(loaded.warning);
    setReady(true);
    // Prevent two tabs from silently overwriting one learner's record.
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        writable.current = false;
        setWarning(
          "Les données ont changé dans un autre onglet. Rechargez cette page avant de continuer à sauvegarder.",
        );
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, {
          scope: `${basePath}/`,
          updateViaCache: "none",
        })
        .catch(() =>
          setWarning(
            (previous) =>
              previous || "Le mode hors connexion est indisponible.",
          ),
        );
  }, []);
  useEffect(() => {
    if (ready) heading.current?.focus();
  }, [view, state.index, ready]);
  function navigate(next: View) {
    setFeedback("");
    setView(next);
  }
  function act(action: LessonAction) {
    const result = transition(current.current, action);
    if (result.state !== current.current) {
      current.current = result.state;
      setState(result.state);
      if (writable.current) {
        try {
          if (!saveLearner(window.localStorage, result.state))
            setWarning(
              "Espace de stockage indisponible. Téléchargez votre progression avant de fermer cette page.",
            );
        } catch {
          setWarning(
            "Sauvegarde indisponible. Téléchargez votre progression avant de fermer cette page.",
          );
        }
      }
    }
    setFeedback(result.feedback);
  }
  function clear() {
    if (
      !window.confirm(
        "Effacer tous les progrès enregistrés dans ce navigateur ?",
      )
    )
      return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      writable.current = true;
      setWarning("");
    } catch {
      setWarning(
        "Impossible d’effacer les données. Utilisez les réglages de votre navigateur.",
      );
      return;
    }
    current.current = initialState();
    setState(current.current);
    navigate("home");
  }
  const activity = activities[state.index];
  if (ready && view === "lesson" && activity) {
    return (
      <TutorSession
        key={activity.id}
        activity={activity}
        attempts={state.attempts[activity.id] ?? 0}
        feedback={feedback}
        warning={warning}
        onAction={act}
        onExit={() => navigate("home")}
        headingRef={heading}
      />
    );
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brandmark" aria-hidden>
              ✦
            </div>
            <span lang="en">Everyday English</span>
          </div>
          <div className="tagline">
            Un peu d’anglais chaque jour.
            <br />À votre rythme.
          </div>
          <nav aria-label="Navigation principale">
            {(
              [
                ["home", "Mon parcours"],
                ["lesson", "Pratiquer"],
                ["progress", "Mes progrès"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`navbtn ${view === id ? "active" : ""}`}
                aria-current={view === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">Sans pression. Sans chronomètre.</div>
        </aside>
        <main id="main" className="content">
          <div className="topline">
            <span>VOTRE COMPAGNON D’ANGLAIS</span>
            <span className="pill">Débutant · Premiers pas</span>
          </div>
          {warning && (
            <p role="alert" className="notice">
              {warning}
            </p>
          )}
          {!ready ? (
            <p role="status">Chargement de vos progrès…</p>
          ) : (
            <>
              {view === "home" && (
                <section className="hero">
                  <div className="lesson-hero">
                    <div>
                      <span className="eyebrow">VOTRE PARCOURS</span>
                      <h1 ref={heading} tabIndex={-1}>
                        Bonjour !<br />
                        Apprenons ensemble.
                      </h1>
                      <p>
                        Écoutez, comprenez, puis présentez-vous en anglais. Une
                        étape à la fois.
                      </p>
                    </div>
                    <button className="btn" onClick={() => navigate("lesson")}>
                      {state.completed
                        ? "Revoir la séance"
                        : state.index > 0
                          ? "Continuer la leçon"
                          : "Commencer la leçon"}{" "}
                      →
                    </button>
                  </div>
                  <div className="panel">
                    <span className="eyebrow">OBJECTIF DU JOUR</span>
                    <h2>Faire connaissance</h2>
                    <p className="muted">
                      Comprendre une salutation et se présenter.
                    </p>
                    <Progress index={state.index} />
                    <p>
                      {state.index} sur {activities.length} activités explorées
                    </p>
                    <div className="stats">
                      <div className="stat">
                        <strong>{state.evidence.length}</strong>
                        <small>Observations de pratique</small>
                      </div>
                      <div className="stat">
                        <strong>
                          {state.evidence.filter((e) => e.correct).length}
                        </strong>
                        <small>Réponses réussies</small>
                      </div>
                    </div>
                    <p className="subtle">
                      Ce sont des observations, pas une preuve de maîtrise.
                    </p>
                  </div>
                </section>
              )}
              {view === "lesson" && state.completed && (
                <section className="hero">
                  <div className="lesson-hero">
                    <h1 ref={heading} tabIndex={-1}>
                      Première séance terminée !
                    </h1>
                    <p>
                      Vous avez exploré les présentations. Vous pouvez reprendre
                      ces échanges à votre rythme.
                    </p>
                    <div className="actions">
                      <button
                        className="btn"
                        onClick={() => act({ type: "restart" })}
                      >
                        Pratiquer à nouveau
                      </button>
                      <button
                        className="btn secondary"
                        onClick={() => navigate("progress")}
                      >
                        Voir mes progrès
                      </button>
                    </div>
                  </div>
                  <div className="panel">
                    <h2>Ce n’est pas un score final.</h2>
                    <p className="muted">
                      La mémorisation à long terme, la prononciation et une
                      conversation spontanée restent à explorer.
                    </p>
                  </div>
                </section>
              )}
              {view === "progress" && (
                <>
                  <h1 ref={heading} tabIndex={-1}>
                    Mes progrès
                  </h1>
                  <p className="muted">
                    Des traces de pratique, pas un niveau officiel.
                  </p>
                  <div className="hero">
                    <section className="panel">
                      <h2>Faire connaissance</h2>
                      <div className="history">
                        {Array.from(
                          new Set(activities.map((a) => a.skill)),
                        ).map((skill) => {
                          const records = state.evidence.filter(
                            (e) => e.skill === skill,
                          );
                          return (
                            <div key={skill} className="history-row">
                              <span>
                                {
                                  {
                                    "listening-greetings":
                                      "Comprendre une salutation",
                                    "listening-name-question":
                                      "Comprendre une question",
                                    "speaking-introduction": "Se présenter",
                                    "reading-introduction":
                                      "Lire une présentation",
                                  }[skill]
                                }
                              </span>
                              <small>
                                {records.filter((e) => e.correct).length} /{" "}
                                {records.length} observations réussies
                              </small>
                            </div>
                          );
                        })}
                      </div>
                      <p className="subtle">
                        Les étapes passées sont enregistrées sans évaluation.
                        Les réponses aidées ne prouvent pas une maîtrise
                        autonome.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>Vos données</h2>
                      <p className="muted">
                        Progrès enregistrés dans ce navigateur uniquement, sans
                        synchronisation. Aucun enregistrement audio, vidéo ou
                        texte de vos réponses n’est conservé par l’application.
                      </p>
                      <div className="actions">
                        <button
                          className="btn secondary"
                          onClick={() =>
                            download(
                              JSON.stringify(current.current, null, 2),
                              "english-learning-record.json",
                            )
                          }
                        >
                          Télécharger mes progrès
                        </button>
                        <button
                          className="btn ghost"
                          onClick={() => {
                            try {
                              const raw =
                                window.localStorage.getItem(STORAGE_KEY);
                              if (raw)
                                download(raw, "english-original-record.json");
                              else
                                setWarning(
                                  "Aucun fichier enregistré dans ce navigateur.",
                                );
                            } catch {
                              setWarning(
                                "Le fichier enregistré est inaccessible.",
                              );
                            }
                          }}
                        >
                          Télécharger le fichier enregistré
                        </button>
                        <button className="btn ghost" onClick={clear}>
                          Effacer mes progrès
                        </button>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <p className="footer-note">
            Parcours guidé · Aucun tuteur IA connecté pour le moment. Les
            progrès restent sur cet appareil. La lecture et la reconnaissance
            vocales peuvent utiliser les services du navigateur.
          </p>
        </main>
      </div>
    </>
  );
}
function Progress({ index }: { index: number }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label="Activités explorées"
      aria-valuemin={0}
      aria-valuemax={activities.length}
      aria-valuenow={index}
    >
      <div
        className="progress-fill"
        style={{ width: `${(index / activities.length) * 100}%` }}
      />
    </div>
  );
}
