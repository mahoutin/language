"use client";

import type { RefObject } from "react";
import { activities } from "@/domain/curriculum";
import {
  feedbackText,
  noticeText,
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

type Send = (body: ConversationBody) => void;

function Replay({ send }: { send: Send }) {
  return (
    <div className={styles.replay} role="group" aria-label="Lecture audio">
      <button
        type="button"
        onClick={() => send({ type: "replay", slow: false })}
      >
        Écouter
      </button>
      <button
        type="button"
        onClick={() => send({ type: "replay", slow: true })}
      >
        Plus lentement
      </button>
    </div>
  );
}

/**
 * The single instructional surface. It renders only what the current
 * pedagogical phase and media state call for; French support is always part of
 * it in Phase 1B, and Help/Captions stay separate controls.
 */
export function TutorCard({
  state,
  send,
  headingRef,
  inputRef,
  hint,
}: {
  state: ConversationState;
  send: Send;
  headingRef: RefObject<HTMLHeadingElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  hint: string;
}) {
  const activity = activities[state.activityIndex];
  const station = activity ? stations[activity.id] : undefined;
  const overlays = visibleOverlays(state);
  const turnOpen = turnOpenPhases.has(state.phase);
  const busy = state.media === "processing";
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

  let heading: string;
  if (state.phase === "orientation")
    heading = welcomeCopy[state.orientation].title;
  else if (state.phase === "recap") heading = "Merci pour cette séance !";
  else if (state.phase === "model") heading = station?.lead ?? "";
  else if (probe) heading = probe.question;
  else heading = station?.instruction ?? "";

  const feedback = state.feedback
    ? feedbackText(state.feedback, state.activityIndex)
    : "";
  const resting =
    state.media === "thinking_pause" || state.media === "interrupted";
  const mediaVisible = state.media === "tutor_speaking";
  // Daniel's French lead-in frames each new step (a new speaker, a changed
  // situation). It is dropped on repair turns to keep the card short.
  const showLead =
    (state.phase === "guided_attempt" || state.phase === "transfer_attempt") &&
    state.repair.strategy === null;

  return (
    <div
      className={styles.card}
      data-help={overlays.includes("french_help")}
      data-phase={state.phase}
      data-media={state.media}
    >
      <div className={styles.statusRow}>
        <p className={styles.status} role="status">
          <span className={styles.dot} aria-hidden="true" />
          {statusText(state)}
        </p>
        {mediaVisible && (
          <button type="button" onClick={() => send({ type: "interrupt" })}>
            Arrêter la voix
          </button>
        )}
      </div>

      {showLead && station && <p className={styles.lead}>{station.lead}</p>}

      <h1
        id="tutor-activity"
        ref={headingRef}
        tabIndex={-1}
        className={styles.instruction}
      >
        {heading}
      </h1>

      <div className={styles.messages}>
        {feedback && (
          <p className={styles.feedback} role="status">
            {feedback}
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

      {state.phase === "orientation" && (
        <>
          <p className={styles.french}>{welcomeCopy[state.orientation].body}</p>
          <div className={styles.actions}>
            {state.orientation === "completed" ? (
              <button
                type="button"
                className={styles.primary}
                onClick={() => send({ type: "restart" })}
              >
                Pratiquer à nouveau
              </button>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={() => send({ type: "begin" })}
              >
                Commencer
              </button>
            )}
            <button
              type="button"
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
                  {overlays.includes("english_caption") && (
                    <p className={styles.caption} lang="en">
                      {activity.prompt}
                    </p>
                  )}
                </div>
                {overlays.includes("replay_controls") && <Replay send={send} />}
              </div>
              <p className={styles.french}>{activity.french}</p>
              {overlays.includes("context_note") && (
                <p className={styles.context}>{station.context}</p>
              )}
            </div>
          )}

          {overlays.includes("french_help") && (
            <p className={styles.help} role="status">
              <strong>Aide en français</strong> · {station.help}
            </p>
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
                onClick={() => send({ type: "continue" })}
              >
                Continuer
              </button>
              <button type="button" onClick={() => send({ type: "stuck" })}>
                Je ne comprends pas
              </button>
            </div>
          ) : (
            turnOpen && (
              <form
                className={styles.response}
                onSubmit={(event) => {
                  event.preventDefault();
                  send({ type: "submit" });
                }}
              >
                {probe || activity.type === "choice" ? (
                  <div
                    className={styles.options}
                    role="group"
                    aria-label="Votre réponse"
                    data-count={
                      probe
                        ? probe.options.length
                        : visibleOptionIndices(state).length
                    }
                  >
                    {(probe
                      ? probe.options.map((o, i) => ({
                          label: o.label,
                          index: i,
                        }))
                      : visibleOptionIndices(state).map((i) => ({
                          label:
                            activity.type === "choice"
                              ? activity.options[i].label
                              : "",
                          index: i,
                        }))
                    ).map(({ label, index }) => (
                      <label key={`${state.turnId}-${index}`} lang="en">
                        <input
                          type="radio"
                          name="response"
                          checked={state.draft.choice === index}
                          onChange={() =>
                            send({ type: "draft_changed", choice: index })
                          }
                        />
                        {label}
                      </label>
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
                  <button
                    className={styles.primary}
                    type="submit"
                    disabled={busy}
                  >
                    Répondre
                  </button>
                  {resting && (
                    <button
                      type="button"
                      onClick={() => send({ type: "resume_turn" })}
                    >
                      Je suis prêt
                    </button>
                  )}
                  {!probe && (
                    <button
                      type="button"
                      onClick={() => send({ type: "stuck" })}
                    >
                      Je ne comprends pas
                    </button>
                  )}
                  {probe && (
                    <button
                      type="button"
                      onClick={() => send({ type: "stuck" })}
                    >
                      Je ne sais pas
                    </button>
                  )}
                  {(state.media === "listening_open" ||
                    state.media === "learner_speaking" ||
                    state.media === "tutor_speaking") && (
                    <button
                      type="button"
                      onClick={() => send({ type: "think_started" })}
                    >
                      J’ai besoin d’un moment
                    </button>
                  )}
                  <button
                    type="button"
                    className={
                      state.feedback === "explain_and_offer_skip" ||
                      state.feedback === "offer_continue_again"
                        ? styles.primary
                        : undefined
                    }
                    onClick={() => send({ type: "skip" })}
                  >
                    Passer sans évaluation
                  </button>
                </div>
              </form>
            )
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
                <li key={item}>{item}</li>
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
        <button type="button" onClick={() => send({ type: "restart" })}>
          Pratiquer à nouveau
        </button>
      </div>
    </>
  );
}
