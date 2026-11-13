"use client";
import { useEffect, useRef, useState } from "react";
import type { BrowserRecognition, SpeechWindow } from "@/lib/browser-media";
export function playEnglish(text: string, onError: (message: string) => void) {
  if (!("speechSynthesis" in window)) {
    onError("La lecture audio est indisponible. Vous pouvez lire le texte.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.83;
  utterance.onerror = (event) => {
    if (event.error !== "interrupted" && event.error !== "canceled")
      onError("Lecture audio indisponible. Vous pouvez lire le texte.");
  };
  window.speechSynthesis.speak(utterance);
}
export function SpeechInput({ onText }: { onText: (text: string) => void }) {
  const recognition = useRef<BrowserRecognition | null>(null);
  const [consent, setConsent] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState(
    "Vous pouvez toujours écrire votre réponse.",
  );
  function stop() {
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onresult = null;
      current.onend = null;
      current.onerror = null;
      current.abort();
    }
    setListening(false);
  }
  useEffect(() => {
    const release = () => {
      const current = recognition.current;
      recognition.current = null;
      if (current) {
        current.onresult = null;
        current.onend = null;
        current.onerror = null;
        current.abort();
      }
    };
    const hide = () => {
      if (document.hidden) {
        release();
        setListening(false);
      }
    };
    window.addEventListener("pagehide", release);
    document.addEventListener("visibilitychange", hide);
    return () => {
      release();
      window.removeEventListener("pagehide", release);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
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
    current.onerror = () =>
      setStatus(
        "Microphone indisponible ou parole non reconnue. Écrivez votre réponse.",
      );
    current.onend = () => {
      if (recognition.current === current) {
        recognition.current = null;
        setListening(false);
      }
    };
    try {
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
          onChange={(e) => {
            setConsent(e.target.checked);
            if (!e.target.checked) stop();
          }}
        />
        J’accepte la reconnaissance vocale du navigateur pour cet exercice.
      </label>
      <p className="subtle">
        Le navigateur peut transmettre l’audio à son fournisseur. L’application
        ne conserve ni audio ni transcription.
      </p>
      <button
        className="btn secondary"
        disabled={!consent && !listening}
        onClick={listening ? stop : start}
      >
        {listening ? "Arrêter le microphone" : "Parler en anglais"}
      </button>
      <p role="status" className="subtle">
        {status}
      </p>
    </div>
  );
}
export function CameraPreview() {
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("La caméra est éteinte.");
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setPending(false);
    setMessage("La caméra est éteinte.");
  }
  useEffect(() => {
    const release = () => {
      generation.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
    const hide = () => {
      if (document.hidden) {
        release();
        setActive(false);
        setPending(false);
        setMessage("La caméra est éteinte.");
      }
    };
    window.addEventListener("pagehide", release);
    document.addEventListener("visibilitychange", hide);
    return () => {
      release();
      window.removeEventListener("pagehide", release);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  async function start() {
    if (pending || active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Caméra indisponible. Utilisez HTTPS ou localhost.");
      return;
    }
    const request = ++generation.current;
    setPending(true);
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      // Permission may resolve after navigation, cancellation, or a hidden tab.
      if (request !== generation.current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      if (video.current) video.current.srcObject = acquired;
      setActive(true);
      setMessage("Aperçu local · Aucune transmission");
    } catch {
      if (request === generation.current)
        setMessage(
          "Accès refusé ou caméra indisponible. Vous pouvez continuer sans caméra.",
        );
    } finally {
      if (request === generation.current) setPending(false);
    }
  }
  return (
    <section>
      <h3>Caméra facultative</h3>
      <div className="camera-box">
        <video ref={video} autoPlay playsInline muted hidden={!active} />
        <span hidden={active}>Caméra éteinte</span>
      </div>
      <p role="status" className="subtle">
        {message}
      </p>
      <div className="actions">
        <button
          className="btn secondary"
          disabled={active || pending}
          onClick={start}
        >
          {pending ? "Autorisation en attente…" : "Activer la caméra"}
        </button>
        <button
          className="btn ghost"
          disabled={!active && !pending}
          onClick={stop}
        >
          Éteindre
        </button>
      </div>
      <p className="subtle">
        Aperçu uniquement. Aucune capture, analyse ou transmission d’image.
        Quitter l’exercice coupe la caméra.
      </p>
    </section>
  );
}
