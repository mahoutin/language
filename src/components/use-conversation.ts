"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LessonAction } from "@/domain/learner";
import { createConversation, step } from "@/domain/conversation/machine";
import type {
  ConversationEvent,
  ConversationState,
  Effect,
} from "@/domain/conversation/types";
import { playSpeech } from "./media-tools";

/** Quiet check-in after this much silence. It is an offer of help, never an outcome. */
export const SILENCE_CHECKIN_MS = 30_000;

export type CommitResult = {
  advanced: boolean;
  correct: boolean;
  rejected: boolean;
};

export type ConversationBody = ConversationEvent extends infer E
  ? E extends ConversationEvent
    ? Omit<E, "eventId" | "sessionId" | "turnId">
    : never
  : never;

type Handlers = {
  onCommit: (action: LessonAction) => CommitResult;
  onExit: () => void;
  focus: (target: "heading" | "input") => void;
  /** Closing the microphone panel aborts browser recognition and revokes its per-exercise consent. */
  stopRecognition: () => void;
};

let sessionCounter = 0;
const newSessionId = () =>
  `s${Date.now().toString(36)}-${(sessionCounter++).toString(36)}`;

/**
 * Binds the pure conversation reducer to the browser. The reducer never touches
 * audio, timers or storage: this hook runs the effects it asks for and feeds
 * the outcome back as events stamped with the session and turn they began in,
 * so a late callback from an earlier turn is dropped by the reducer.
 */
export function useConversation(
  learner: { index: number; completed: boolean },
  handlers: Handlers,
) {
  const [initial] = useState(() => createConversation(newSessionId(), learner));
  const [state, setState] = useState<ConversationState>(initial);
  const ref = useRef(initial);
  const counter = useRef(0);
  const stopPlayback = useRef<() => void>(() => {});
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  const dispatchRef = useRef<(body: ConversationBody, turnId?: number) => void>(
    () => {},
  );

  const run = useCallback((effect: Effect, turnId: number) => {
    switch (effect.type) {
      case "stop_audio":
        stopPlayback.current();
        stopPlayback.current = () => {};
        break;
      case "speak": {
        stopPlayback.current();
        const { outputId } = effect;
        stopPlayback.current = playSpeech({
          segments: effect.segments,
          onStart: () =>
            dispatchRef.current({ type: "audio_started", outputId }, turnId),
          onEnd: () =>
            dispatchRef.current({ type: "audio_ended", outputId }, turnId),
          onError: () =>
            dispatchRef.current({ type: "audio_failed", outputId }, turnId),
        });
        break;
      }
      case "commit": {
        const result = latest.current.onCommit(effect.action);
        if (effect.action.type === "restart") break;
        dispatchRef.current(
          {
            type: "commit_result",
            activityId: effect.action.activityId,
            ...result,
          },
          turnId,
        );
        break;
      }
      case "focus":
        latest.current.focus(effect.target);
        break;
      case "exit":
        latest.current.onExit();
        break;
      case "stop_recognition":
        latest.current.stopRecognition();
        break;
    }
  }, []);

  const dispatch = useCallback(
    (body: ConversationBody, turnId?: number) => {
      const current = ref.current;
      const event = {
        ...body,
        eventId: `${current.sessionId}:e${++counter.current}`,
        sessionId: current.sessionId,
        turnId: turnId ?? current.turnId,
      } as ConversationEvent;
      const result = step(current, event);
      if (result.state !== current) {
        ref.current = result.state;
        setState(result.state);
      }
      for (const effect of result.effects) {
        // Effects of this step belong to the turn the step produced.
        run(effect, result.state.turnId);
      }
    },
    [run],
  );
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Quiet check-in: only while the learner's turn is open, never an outcome.
  useEffect(() => {
    if (state.lifecycle !== "active" || state.media !== "listening_open")
      return;
    const turnId = state.turnId;
    const timer = window.setTimeout(
      () => dispatch({ type: "silence_checkin" }, turnId),
      SILENCE_CHECKIN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.lifecycle, state.media, state.turnId, state.draft, dispatch]);

  // Leaving the page or hiding the tab pauses the session explicitly and releases audio.
  useEffect(() => {
    const hide = () => {
      if (document.hidden) dispatchRef.current({ type: "pause" });
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", hide);
      stopPlayback.current();
    };
  }, []);

  return { state, send: dispatch };
}
