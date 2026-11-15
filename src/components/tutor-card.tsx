"use client";

import {
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { activities } from "@/domain/curriculum";
import {
  feedbackText,
  noticeText,
  parseMarked,
  recapHeading,
  repairContent,
  stations,
  statusText,
  visibleOptionIndices,
  visibleOverlays,
  welcomeCopy,
} from "@/domain/conversation/script";
import { buildRecap } from "@/domain/conversation/summary";
import {
  turnOpenPhases,
  type ConversationState,
} from "@/domain/conversation/types";
import type { ConversationBody } from "./use-conversation";
import styles from "./tutor-session.module.css";

type Send = (body: ConversationBody, turnId?: number) => void;

/** Holding Enter or Space must not repeat an action (a held key would re-answer). */
function blockKeyRepeat(event: KeyboardEvent<HTMLElement>) {
  if (event.repeat && (event.key === "Enter" || event.key === " "))
    event.preventDefault();
}

/**
 * Flow buttons (continue, skip, "I don't understand", …) ignore the 2nd/3rd
 * click of a double or triple click: the layout changes after the first one,
 * so the extra clicks would land on whatever is then under the pointer.
 */
const flow = (act: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
  if (event.detail > 1) return;
  act();
};

/** A second answer inside this window is treated as an accidental repeat (double tap, key repeat). */
export const ANSWER_GUARD_MS = 400;

/** French text with English phrases wrapped in lang="en" (same markup source as the speech). */
export function Marked({ text }: { text: string }) {
  return (
    <>
      {parseMarked(text).map((span, i) =>
        span.lang === "en" ? (
          <span key={i} lang="en">
            {span.text}
          </span>
        ) : (
          <span key={i}>{span.text}</span>
        ),
      )}
    </>
  );
}

function Replay({ send, muted }: { send: Send; muted: boolean }) {
  return (
    <div className={styles.replay} role="group" aria-label="Lecture audio">
      <button
        type="button"
        disabled={muted}
        onClick={() => send({ type: "replay", slow: false })}
      >
        Écouter
      </button>
      <button
        type="button"
        disabled={muted}
        onClick={() => send({ type: "replay", slow: true })}
      >
        Plus lentement
      </button>
    </div>
  );
}

/**
 * The single instructional surface. It renders only what the current
 * pedagogical phase and media state call for: the options or the field, one
 * help button, and the extras (a moment, skip) only when they are relevant.
 * French support is always part of it in Phase 1B, and Help/Captions stay
 * separate controls.
 */
export function TutorCard({
  state,
  send,
  headingRef,
  inputRef,
  hint,
  ownVoices,
}: {
  state: ConversationState;
  send: Send;
  headingRef: RefObject<HTMLHeadingElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  hint: string;
  ownVoices: Record<"Maria" | "Alex", boolean>;
}) {
  // "Never answered yet": performance.now() counts from page load, so 0 would swallow an early first tap.
  const lastAnswerAt = useRef(Number.NEGATIVE_INFINITY);
  const activity = activities[state.activityIndex];
  const station = activity ? stations[activity.id] : undefined;
  const overlays = visibleOverlays(state);
  const turnOpen = turnOpenPhases.has(state.phase);
  const busy = state.media === "processing";
  const muted = !state.prefs.voice;
  const probe =
    state.phase === "diagnostic_probe" && activity
      ? repairContent[activity.id]?.probe
      : undefined;
  const example = activity ? repairContent[activity.id]?.example : undefined;
  const showFrame =
    (state.repair.strategy === "example_frame" ||
      state.repair.strategy === "probe_followup" ||
      state.repair.strategy === "explain_and_offer_skip") &&
    example;
  // Extra actions appear when they matter: after a difficulty, or inside Aide.
  const struggling = state.repair.strategy !== null;
  const canThink =
    turnOpen &&
    (state.media === "listening_open" ||
      state.media === "learner_speaking" ||
      state.media === "tutor_speaking");

  /** Runs `act` unless an answer was just given (double tap / key repeat). */
  const once = (act: () => void) => () => {
    const now = performance.now();
    if (now - lastAnswerAt.current < ANSWER_GUARD_MS) return;
    lastAnswerAt.current = now;
    act();
  };

  let heading: string;
  if (state.phase === "orientation")
    heading = welcomeCopy[state.orientation].title;
  else if (state.phase === "recap") heading = recapHeading(state.learnerName);
  else if (state.phase === "model") heading = station?.lead ?? "";
  else if (probe) heading = probe.question;
  else heading = station?.instruction ?? "";

  const feedback = state.feedback
    ? feedbackText(state.feedback, state.activityIndex, state.learnerName)
    : "";
  const resting =
    state.media === "thinking_pause" || state.media === "interrupted";
  const speaker = station?.speaker ?? "Daniel";
  const voiceNote =
    speaker === "Daniel"
      ? ""
      : ownVoices[speaker]
        ? "autre voix du navigateur"
        : "même voix que Daniel";
  const optionList = probe
    ? probe.options.map((o, i) => ({ label: o.label, index: i }))
    : activity?.type === "choice"
      ? visibleOptionIndices(state).map((i) => ({
          label: activity.options[i].label,
          index: i,
        }))
      : [];

  return (
    <div
      className={styles.card}
      onKeyDown={blockKeyRepeat}
      data-help={overlays.includes("french_help")}
      data-phase={state.phase}
      data-media={state.media}
    >
      <div className={styles.statusRow}>
        <p className={styles.status} role="status">
          <span className={styles.dot} aria-hidden="true" />
          {statusText(state)}
        </p>
        {state.media === "tutor_speaking" && (
          <button type="button" onClick={() => send({ type: "interrupt" })}>
            Arrêter la voix
          </button>
        )}
      </div>

      <div className={styles.messages}>
        {feedback && (
          <p className={styles.feedback} role="status">
            <Marked text={feedback} />
          </p>
        )}
        {state.notice && (
          <p className={styles.notice} role="status">
            {noticeText(state.notice)}{" "}
            {state.media === "recovering" ? (
              <button type="button" onClick={() => send({ type: "recover" })}>
                Écrire ma réponse
              </button>
            ) : (
              <button
                type="button"
                onClick={() => send({ type: "notice_dismissed" })}
              >
                Fermer
              </button>
            )}
          </p>
        )}
        {hint && (
          <p className={styles.feedback} role="status">
            {hint}
          </p>
        )}
      </div>

      {state.phase !== "orientation" &&
        state.phase !== "recap" &&
        state.phase !== "model" &&
        state.repair.strategy === null &&
        station && <p className={styles.lead}>{station.lead}</p>}

      <h1
        id="tutor-activity"
        ref={headingRef}
        tabIndex={-1}
        className={styles.instruction}
      >
        <Marked text={heading} />
      </h1>

      {state.phase === "orientation" && (
        <>
          <p className={styles.french}>{welcomeCopy[state.orientation].body}</p>
          <div className={styles.actions}>
            {state.orientation === "completed" ? (
              <button
                type="button"
                className={styles.primary}
                onClick={flow(() => send({ type: "restart" }))}
              >
                Pratiquer à nouveau
              </button>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={flow(() => send({ type: "begin" }))}
              >
                Commencer
              </button>
            )}
            <button
              type="button"
              disabled={muted}
              onClick={() => send({ type: "replay", slow: false })}
            >
              Écouter le message
            </button>
          </div>
        </>
      )}

      {state.phase === "recap" && <Recap state={state} send={send} />}

      {activity && station && state.phase !== "recap" && (
        <>
          {!probe && (
            <div className={styles.lines}>
              <div className={styles.captionRow}>
                <div className={styles.captionText}>
                  <span className={styles.speaker}>{station.speaker}</span>
                  {voiceNote && (
                    <span className={styles.voiceNote}>({voiceNote})</span>
                  )}
                  {overlays.includes("english_caption") && (
                    <p className={styles.caption} lang="en">
                      {activity.prompt}
                    </p>
                  )}
                </div>
                {overlays.includes("replay_controls") && (
                  <Replay send={send} muted={muted} />
                )}
              </div>
              <p className={styles.french}>{activity.french}</p>
              {overlays.includes("context_note") && (
                <p className={styles.context}>{station.context}</p>
              )}
            </div>
          )}

          {showFrame && example && (
            <p className={styles.frame}>
              Exemple : <q lang="en">{example.model}</q> · À vous :{" "}
              <q lang="en">{example.frame}</q>
            </p>
          )}

          {state.phase === "model" ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={flow(() => send({ type: "continue" }))}
              >
                Continuer
              </button>
              <button
                type="button"
                onClick={flow(() => send({ type: "stuck" }))}
              >
                Je ne comprends pas
              </button>
            </div>
          ) : (
            turnOpen && (
              <form
                className={styles.response}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!(probe || activity.type === "choice"))
                    once(() => send({ type: "submit" }))();
                }}
              >
                {probe || activity.type === "choice" ? (
                  <div
                    className={styles.options}
                    role="group"
                    aria-label="Votre réponse : touchez une réponse"
                    data-count={optionList.length}
                  >
                    {optionList.map(({ label, index }) => (
                      <button
                        key={`${state.turnId}-${index}`}
                        type="button"
                        className={styles.option}
                        lang="en"
                        disabled={busy}
                        onClick={once(() =>
                          send({ type: "choose", choice: index }, state.turnId),
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <label className={styles.answer}>
                    Votre réponse en anglais
                    <input
                      ref={inputRef}
                      lang="en"
                      autoComplete="off"
                      maxLength={500}
                      value={state.draft.text}
                      onChange={(event) =>
                        send({
                          type: "draft_changed",
                          text: event.target.value,
                          source: "typed",
                        })
                      }
                    />
                  </label>
                )}
                <div className={styles.actions}>
                  {!(probe || activity.type === "choice") && (
                    <button
                      className={styles.primary}
                      type="submit"
                      disabled={busy}
                    >
                      Répondre
                    </button>
                  )}
                  {resting && (
                    <button
                      type="button"
                      onClick={flow(() => send({ type: "resume_turn" }))}
                    >
                      Je suis prêt
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={flow(() => send({ type: "stuck" }))}
                  >
                    {probe ? "Je ne sais pas" : "Je ne comprends pas"}
                  </button>
                  {struggling && (
                    <button
                      type="button"
                      className={
                        state.feedback === "explain_and_offer_skip" ||
                        state.feedback === "offer_continue_again"
                          ? styles.primary
                          : undefined
                      }
                      onClick={flow(() => send({ type: "skip" }))}
                    >
                      Passer sans évaluation
                    </button>
                  )}
                </div>
              </form>
            )
          )}

          {overlays.includes("french_help") && (
            <div className={styles.help}>
              <p role="status">
                <strong>Aide en français</strong> ·{" "}
                <Marked text={station.help} />
              </p>
              {turnOpen && (
                <div className={styles.actions}>
                  {canThink && (
                    <button
                      type="button"
                      onClick={flow(() => send({ type: "think_started" }))}
                    >
                      J’ai besoin d’un moment
                    </button>
                  )}
                  {!struggling && (
                    <button
                      type="button"
                      onClick={flow(() => send({ type: "skip" }))}
                    >
                      Passer sans évaluation
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Recap({ state, send }: { state: ConversationState; send: Send }) {
  const recap = buildRecap(state);
  return (
    <>
      <div className={styles.recap}>
        {recap.practised.length > 0 && (
          <>
            <h2>Nous avons pratiqué</h2>
            <ul>
              {recap.practised.map((item) => (
                <li key={item}>
                  <Marked text={item} />
                </li>
              ))}
            </ul>
          </>
        )}
        {recap.observed.length > 0 && (
          <>
            <h2>Ce que j’ai observé</h2>
            <ul>
              {recap.observed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}
        {recap.next && <p>{recap.next}</p>}
        <p className={styles.caveat}>{recap.caveat}</p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => send({ type: "exit" })}
        >
          Terminer la séance
        </button>
        <button
          type="button"
          disabled={!state.prefs.voice}
          onClick={() => send({ type: "replay", slow: false })}
        >
          Réécouter
        </button>
        <button type="button" onClick={flow(() => send({ type: "restart" }))}>
          Pratiquer à nouveau
        </button>
      </div>
    </>
  );
}
