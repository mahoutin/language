"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { basePath } from "@/lib/base-path";
import { activities } from "@/domain/curriculum";
import { turnOpenPhases } from "@/domain/conversation/types";
import type { LessonAction } from "@/domain/learner";
import { SpeechInput, useCameraPreview } from "./media-tools";
import { TutorCard } from "./tutor-card";
import { useConversation, type CommitResult } from "./use-conversation";
import styles from "./tutor-session.module.css";

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
  learner,
  warning,
  onCommit,
  onExit,
}: {
  learner: { index: number; completed: boolean };
  warning: string;
  onCommit: (action: LessonAction) => CommitResult;
  onExit: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [microphoneOpen, setMicrophoneOpen] = useState(false);
  const [hint, setHint] = useState("");
  const recognitionTurn = useRef(0);
  const camera = useCameraPreview();
  const cameraRequested = Boolean(camera.preview) || camera.pending;

  const focus = useCallback((target: "heading" | "input") => {
    // After React has committed the new content, so assistive tech reads the new text.
    window.setTimeout(
      () => (target === "heading" ? heading.current : input.current)?.focus(),
      0,
    );
  }, []);
  const stopRecognition = useCallback(() => setMicrophoneOpen(false), []);
  const { state, send } = useConversation(learner, {
    onCommit,
    onExit,
    focus,
    stopRecognition,
  });

  const paused = state.lifecycle === "paused";
  const speakTurn =
    turnOpenPhases.has(state.phase) &&
    state.phase !== "diagnostic_probe" &&
    activities[state.activityIndex]?.type === "speak";
  const helpAvailable =
    state.phase !== "orientation" && state.phase !== "recap";

  function togglePause() {
    if (paused) {
      send({ type: "resume_session" });
      return;
    }
    send({ type: "pause" });
    camera.stop();
    setMicrophoneOpen(false);
    setHint("");
  }

  function toggleMicrophone() {
    setHint("");
    if (!speakTurn) {
      setHint(
        "Vous pourrez utiliser le microphone quand vous répondez à voix haute.",
      );
      return;
    }
    if (microphoneOpen && state.media === "learner_speaking")
      send({ type: "recognition_ended" }, recognitionTurn.current);
    setMicrophoneOpen(!microphoneOpen);
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
        <span className={styles.badge}>Séance guidée · simulation</span>
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
          <div className={styles.card} role="status">
            <h1 id="tutor-activity" className={styles.instruction}>
              Séance en pause
            </h1>
            <p className={styles.french}>
              Reprenez quand vous êtes prêt. Le micro et la caméra sont éteints.
              Votre réponse est conservée.
            </p>
          </div>
        ) : (
          <TutorCard
            state={state}
            send={send}
            headingRef={heading}
            inputRef={input}
            hint={hint}
          />
        )}
      </section>

      <p className={styles.portraitLabel}>
        Portrait d’illustration · dialogue préparé
      </p>
      <div className={styles.dockArea}>
        <div
          className={styles.dock}
          role="group"
          aria-label="Commandes de la séance"
        >
          <button
            type="button"
            disabled={paused}
            aria-expanded={speakTurn ? microphoneOpen : undefined}
            aria-controls={speakTurn ? "tutor-mic" : undefined}
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
            aria-pressed={state.prefs.captions}
            onClick={() => send({ type: "captions_toggled" })}
          >
            <span aria-hidden="true">CC</span>Sous-titres
          </button>
          <button
            type="button"
            disabled={paused || !helpAvailable}
            aria-expanded={
              !paused && helpAvailable ? state.helpOpen : undefined
            }
            onClick={() =>
              send({ type: state.helpOpen ? "help_dismissed" : "help_opened" })
            }
          >
            <span aria-hidden="true">?</span>Aide
          </button>
          <button type="button" onClick={togglePause}>
            <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
            {paused ? "Reprendre" : "Pause"}
          </button>
          <button
            className={styles.exit}
            type="button"
            onClick={() => send({ type: "exit" })}
          >
            <span aria-hidden="true">×</span>Quitter
          </button>
        </div>
        <section
          id="tutor-mic"
          className={styles.microphone}
          aria-label="Réponse au microphone"
          hidden={!microphoneOpen}
        >
          {microphoneOpen && (
            <SpeechInput
              onText={(text) =>
                send(
                  { type: "draft_changed", text, source: "recognition" },
                  recognitionTurn.current,
                )
              }
              onListening={(listening) => {
                if (listening) {
                  recognitionTurn.current = state.turnId;
                  send({ type: "recognition_started" });
                } else
                  send({ type: "recognition_ended" }, recognitionTurn.current);
              }}
              onFailure={(reason) =>
                send(
                  { type: "recognition_failed", reason },
                  recognitionTurn.current,
                )
              }
            />
          )}
        </section>
      </div>
    </main>
  );
}
