"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserRecognition, SpeechWindow } from "@/lib/browser-media";

export function playEnglish(
  text: string,
  onError: (message: string) => void,
  rate: number,
): () => void {
  if (!("speechSynthesis" in window)) {
    onError("La lecture audio est indisponible. Vous pouvez lire le texte.");
    return () => {};
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  utterance.onerror = (event) => {
    if (event.error !== "interrupted" && event.error !== "canceled")
      onError("Lecture audio indisponible. Vous pouvez lire le texte.");
  };
  window.speechSynthesis.speak(utterance);
  return () => {
    utterance.onerror = null;
    window.speechSynthesis.cancel();
  };
}

export function useMediaCleanup(release: () => void, reset: () => void) {
  useEffect(() => {
    const hide = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("pagehide", reset);
    document.addEventListener("visibilitychange", hide);
    return () => {
      release();
      window.removeEventListener("pagehide", reset);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [release, reset]);
}

const speechIdle = "Vous pouvez toujours écrire votre réponse.";

export function SpeechInput({ onText }: { onText: (text: string) => void }) {
  const recognition = useRef<BrowserRecognition | null>(null);
  const [consent, setConsent] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState(speechIdle);
  const release = useCallback(() => {
    const current = recognition.current;
    recognition.current = null;
    if (!current) return;
    current.onresult = null;
    current.onend = null;
    current.onerror = null;
    current.abort();
  }, []);
  const stop = useCallback(() => {
    release();
    setListening(false);
    setStatus(speechIdle);
  }, [release]);
  useMediaCleanup(release, stop);

  function start() {
    if (!consent) return;
    stop();
    const browser = window as SpeechWindow;
    const Speech = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Speech) {
      setStatus(
        "Reconnaissance vocale indisponible dans ce navigateur. Écrivez votre réponse.",
      );
      return;
    }
    try {
      const current = new Speech();
      recognition.current = current;
      current.lang = "en-US";
      current.interimResults = false;
      current.maxAlternatives = 1;
      current.onresult = (event) => {
        if (recognition.current !== current) return;
        onText(event.results[0][0].transcript.slice(0, 500));
        setStatus("Vérifiez le texte reconnu avant de répondre.");
      };
      current.onerror = () => {
        if (recognition.current !== current) return;
        setStatus(
          "Microphone indisponible ou parole non reconnue. Écrivez votre réponse.",
        );
      };
      current.onend = () => {
        if (recognition.current !== current) return;
        recognition.current = null;
        setListening(false);
        setStatus((message) =>
          message === "Je vous écoute…" ? speechIdle : message,
        );
      };
      current.start();
      setListening(true);
      setStatus("Je vous écoute…");
    } catch {
      stop();
      setStatus("Le microphone ne démarre pas. Écrivez votre réponse.");
    }
  }

  return (
    <div>
      <label className="toggle-line">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
            if (!event.target.checked) stop();
          }}
        />
        J’accepte la reconnaissance vocale du navigateur pour cet exercice.
      </label>
      <p>Le navigateur peut transmettre l’audio à son fournisseur.</p>
      <button
        type="button"
        disabled={!consent}
        onClick={listening ? stop : start}
      >
        {listening ? "Arrêter le microphone" : "Parler en anglais"}
      </button>
      <p role="status">{status}</p>
    </div>
  );
}

export function useCameraPreview() {
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const removeEndedListener = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("La caméra est éteinte.");

  const release = useCallback(() => {
    generation.current++;
    removeEndedListener.current?.();
    removeEndedListener.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setPreview(null);
    setPending(false);
    setMessage("La caméra est éteinte.");
  }, [release]);
  useMediaCleanup(release, stop);

  async function start() {
    if (pending || preview) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Caméra indisponible. Vous pouvez continuer sans caméra.");
      return;
    }
    const request = ++generation.current;
    setPending(true);
    setMessage("Autorisation de la caméra en attente…");
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      if (request !== generation.current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      const track = acquired.getVideoTracks()[0];
      const ended = () => {
        stop();
        setMessage("Aperçu arrêté. Vous pouvez continuer sans caméra.");
      };
      track?.addEventListener("ended", ended);
      removeEndedListener.current = () =>
        track?.removeEventListener("ended", ended);
      setPreview(acquired);
      setMessage("Aperçu local · Aucune transmission");
    } catch {
      if (request === generation.current) {
        release();
        setPending(false);
        setMessage(
          "Caméra indisponible ou accès refusé. Vous pouvez continuer sans caméra.",
        );
      }
    } finally {
      if (request === generation.current) setPending(false);
    }
  }

  return { preview, pending, message, start, stop };
}
