"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { basePath } from "@/lib/base-path";
import type { Activity, Skill } from "@/domain/curriculum";
import type { LessonAction } from "@/domain/learner";
import {
  playEnglish,
  SpeechInput,
  useCameraPreview,
  useMediaCleanup,
} from "./media-tools";
import styles from "./tutor-session.module.css";

const instructions: Record<Skill, string> = {
  "listening-greetings": "Qu’est-ce que cette personne fait ?",
  "listening-name-question": "Qu’est-ce que cette personne vous demande ?",
  "speaking-introduction": "Présentez-vous en anglais, à l’oral ou à l’écrit.",
  "reading-introduction": "Qui se présente ?",
};

function LocalPreview({ stream }: { stream: MediaStream }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream;
    return () => {
      element.srcObject = null;
    };
  }, [stream]);
  return <video ref={video} autoPlay playsInline muted />;
}

export function TutorSession({
  activity,
  attempts,
  feedback,
  warning,
  captions,
  onToggleCaptions,
  onAction,
  onExit,
  headingRef,
}: {
  activity: Activity;
  attempts: number;
  feedback: string;
  warning: string;
  captions: boolean;
  onToggleCaptions: () => void;
  onAction: (action: LessonAction) => void;
  onExit: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [help, setHelp] = useState(false);
  const [dismissedHelpAt, setDismissedHelpAt] = useState<number>();
  const [paused, setPaused] = useState(false);
  const [microphoneOpen, setMicrophoneOpen] = useState(false);
  const [response, setResponse] = useState<string | number>("");
  const [notice, setNotice] = useState("");
  const stopPlayback = useRef<() => void>(() => {});
  const stopAudio = useCallback(() => stopPlayback.current(), []);
  useMediaCleanup(stopAudio, stopAudio);
  const camera = useCameraPreview();
  const cameraRequested = Boolean(camera.preview) || camera.pending;
  const helpVisible = help || (attempts >= 2 && dismissedHelpAt !== attempts);
  const instruction =
    activity.id === "transfer"
      ? "Présentez-vous en anglais sans recopier un exemple."
      : instructions[activity.skill];

  function listen(rate: number) {
    stopAudio();
    setNotice("");
    stopPlayback.current = playEnglish(activity.prompt, setNotice, rate);
  }

  function togglePause() {
    if (!paused) {
      stopAudio();
      camera.stop();
      setMicrophoneOpen(false);
      setNotice("");
    }
    setPaused(!paused);
  }

  function toggleMicrophone() {
    if (activity.type === "speak") {
      stopAudio();
      setMicrophoneOpen(!microphoneOpen);
    } else
      setNotice(
        "Vous pourrez utiliser le microphone dans les activités où vous parlez.",
      );
  }

  function toggleHelp() {
    setHelp(!helpVisible);
    if (helpVisible) setDismissedHelpAt(attempts);
  }

  return (
    <main className={styles.stage} aria-label="Séance d’anglais">
      <Image
        className={styles.portrait}
        src={`${basePath}/assets/tutor-portrait.webp`}
        alt=""
        fill
        sizes="100vw"
        unoptimized
        preload
      />
      <div className={styles.scrim} aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.brand} lang="en">
          <strong>everyday</strong>english
        </span>
        <span className={styles.badge}>Séance guidée</span>
      </header>

      <aside className={styles.selfView} aria-label="Votre aperçu caméra">
        {camera.preview ? (
          <LocalPreview stream={camera.preview} />
        ) : (
          <div className={styles.selfViewIllustration} aria-hidden="true">
            <Image
              className={styles.selfViewHead}
              src={`${basePath}/assets/tutor/self-view-head.svg`}
              alt=""
              width={64}
              height={69}
              unoptimized
            />
            <Image
              className={styles.selfViewShoulders}
              src={`${basePath}/assets/tutor/self-view-shoulders.svg`}
              alt=""
              width={152}
              height={92}
              unoptimized
            />
          </div>
        )}
        <p className={styles.selfViewLabel} role="status">
          {camera.message}
        </p>
      </aside>

      <section className={styles.lesson} aria-labelledby="tutor-activity">
        {warning && (
          <p className={styles.warning} role="alert">
            {warning}
          </p>
        )}
        {paused ? (
          <div className={styles.overlay} role="status">
            <h1 id="tutor-activity">Séance en pause</h1>
            <p>
              Reprenez quand vous êtes prêt. Le micro et la caméra sont éteints.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.overlay} data-help={helpVisible}>
              <h1
                id="tutor-activity"
                ref={headingRef}
                tabIndex={-1}
                className={styles.instruction}
              >
                {instruction}
              </h1>
              <p
                id="tutor-caption"
                className={styles.caption}
                lang="en"
                hidden={!captions}
              >
                {activity.prompt}
              </p>
              <p className={styles.french}>
                {!captions && <span lang="en">{activity.title}</span>}
                {!captions && " · "}
                <span>{activity.french}</span>
              </p>
              <div id="tutor-help" hidden={!helpVisible}>
                <p className={styles.help} role="status">
                  <strong>Aide en français</strong> ·{" "}
                  {activity.type === "speak"
                    ? "Dites votre prénom en anglais, puis vérifiez votre réponse."
                    : "Relisez le sens en français ou écoutez la phrase plus lentement avant de répondre."}
                </p>
              </div>
            </div>
            <div
              className={styles.replay}
              aria-label="Lecture audio"
              role="group"
            >
              <button type="button" onClick={() => listen(0.83)}>
                Écouter
              </button>
              <button type="button" onClick={() => listen(0.65)}>
                Écouter plus lentement
              </button>
            </div>
            <form
              className={styles.response}
              onSubmit={(event) => {
                event.preventDefault();
                stopAudio();
                setNotice("");
                onAction({
                  type: "answer",
                  activityId: activity.id,
                  response,
                  assisted: true,
                });
              }}
            >
              {activity.type === "choice" ? (
                <div
                  className={styles.options}
                  role="group"
                  aria-label="Votre réponse"
                >
                  {activity.options.map((option, index) => (
                    <label key={option.label} lang="en">
                      <input
                        type="radio"
                        name="response"
                        checked={response === index}
                        onChange={() => setResponse(index)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              ) : (
                <label className={styles.answer}>
                  Votre réponse en anglais
                  <input
                    lang="en"
                    autoComplete="off"
                    maxLength={500}
                    value={response}
                    onChange={(event) => setResponse(event.target.value)}
                  />
                </label>
              )}
              <div className={styles.responseActions}>
                <button className={styles.primary} type="submit">
                  Vérifier ma réponse
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAction({ type: "skip", activityId: activity.id })
                  }
                >
                  Passer sans évaluation
                </button>
              </div>
              <div className={styles.feedback} role="status">
                {feedback}
              </div>
              <div className={styles.feedback} role="status">
                {notice}
              </div>
            </form>
          </>
        )}
      </section>

      <p className={styles.portraitLabel}>Portrait d’illustration</p>
      <div className={styles.dockArea}>
        <div
          className={styles.dock}
          role="group"
          aria-label="Commandes de la séance"
        >
          <button
            type="button"
            disabled={paused}
            aria-expanded={
              activity.type === "speak" ? microphoneOpen : undefined
            }
            aria-controls={activity.type === "speak" ? "tutor-mic" : undefined}
            onClick={toggleMicrophone}
          >
            <span aria-hidden="true">◉</span>Micro
          </button>
          <button
            type="button"
            disabled={paused}
            aria-label="Caméra"
            aria-pressed={cameraRequested}
            onClick={cameraRequested ? camera.stop : camera.start}
          >
            <span aria-hidden="true">▣</span>Caméra
          </button>
          <button
            type="button"
            disabled={paused}
            aria-pressed={captions}
            onClick={onToggleCaptions}
          >
            <span aria-hidden="true">CC</span>Sous-titres
          </button>
          <button
            type="button"
            disabled={paused}
            aria-expanded={!paused && helpVisible}
            aria-controls={paused ? undefined : "tutor-help"}
            onClick={toggleHelp}
          >
            <span aria-hidden="true">?</span>Aide
          </button>
          <button type="button" onClick={togglePause}>
            <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
            {paused ? "Reprendre" : "Pause"}
          </button>
          <button className={styles.exit} type="button" onClick={onExit}>
            <span aria-hidden="true">×</span>Quitter
          </button>
        </div>
        <section
          id="tutor-mic"
          className={styles.microphone}
          aria-label="Réponse au microphone"
          hidden={!microphoneOpen}
        >
          {microphoneOpen && <SpeechInput onText={setResponse} />}
        </section>
      </div>
    </main>
  );
}
