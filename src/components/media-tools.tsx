"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Segment, Speaker } from "@/domain/conversation/types";
import type { BrowserRecognition, SpeechWindow } from "@/lib/browser-media";

export type SpeechPlayback = {
  segments: readonly Segment[];
  onStart: () => void;
  onEnd: () => void;
  onError: () => void;
};

// ---------- voices (what the browser can really do) ----------

const speakers: readonly Speaker[] = ["Daniel", "Maria", "Alex"];
const pitchFor: Record<Speaker, number> = { Daniel: 1, Maria: 1.2, Alex: 0.88 };

function englishVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const seen = new Set<string>();
  return voices
    .filter((voice) => !seen.has(voice.name) && seen.add(voice.name))
    .sort(
      (a, b) =>
        Number(b.lang.toLowerCase() === "en-us") -
        Number(a.lang.toLowerCase() === "en-us"),
    );
}

/** The voice for an English line: each character gets its own only if the browser has enough. */
function voiceFor(speaker: Speaker): SpeechSynthesisVoice | null {
  const voices = englishVoices();
  if (voices.length === 0) return null;
  return voices[speakers.indexOf(speaker)] ?? voices[0];
}

const hasOwnVoice = (speaker: Speaker) => {
  const own = voiceFor(speaker);
  return own !== null && own !== voiceFor("Daniel");
};

function subscribeVoices(onChange: () => void) {
  if (!("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener?.("voiceschanged", onChange);
  return () =>
    window.speechSynthesis.removeEventListener?.("voiceschanged", onChange);
}

/**
 * Whether Maria and Alex really sound different from Daniel in this browser.
 * The interface only claims a different voice when this is true.
 */
export function useOwnVoices(): Record<"Maria" | "Alex", boolean> {
  const key = useSyncExternalStore(
    subscribeVoices,
    () =>
      `${hasOwnVoice("Maria") ? "M" : "-"}${hasOwnVoice("Alex") ? "A" : "-"}`,
    () => "--",
  );
  return { Maria: key[0] === "M", Alex: key[1] === "A" };
}

/**
 * Plays a sequence of lines with the browser's voices (a labelled simulation,
 * not a generated tutor voice). One output = one queue: it reports start (first
 * line), end (last line) or error, and the returned stop function silences it
 * and detaches every callback, so a cancelled queue can never report late.
 */
export function playSpeech({
  segments,
  onStart,
  onEnd,
  onError,
}: SpeechPlayback): () => void {
  if (!("speechSynthesis" in window)) {
    onError();
    return () => {};
  }
  window.speechSynthesis.cancel();
  let index = 0;
  let started = false;
  let stopped = false;
  let current: SpeechSynthesisUtterance | null = null;
  const detach = () => {
    if (!current) return;
    current.onstart = null;
    current.onend = null;
    current.onerror = null;
  };
  const next = () => {
    if (stopped) return;
    detach();
    if (index >= segments.length) {
      onEnd();
      return;
    }
    const segment = segments[index++];
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = segment.lang;
    utterance.rate = segment.rate;
    if (segment.lang === "en-US") {
      const voice = voiceFor(segment.speaker);
      if (voice) utterance.voice = voice;
      // Without a voice of their own, a character only gets a different pitch
      // (which some browsers ignore); the interface never claims more than that.
      utterance.pitch = hasOwnVoice(segment.speaker)
        ? 1
        : pitchFor[segment.speaker];
    }
    utterance.onstart = () => {
      if (started || stopped) return;
      started = true;
      onStart();
    };
    utterance.onend = next;
    utterance.onerror = (event) => {
      if (stopped) return;
      if (event.error === "interrupted" || event.error === "canceled") return;
      stopped = true;
      onError();
    };
    current = utterance;
    window.speechSynthesis.speak(utterance);
  };
  next();
  return () => {
    stopped = true;
    detach();
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

export type SpeechFailure = "denied" | "unavailable" | "no_speech" | "error";

export function SpeechInput({
  onText,
  onListening,
  onFailure,
}: {
  onText: (text: string) => void;
  onListening?: (listening: boolean) => void;
  onFailure?: (reason: SpeechFailure) => void;
}) {
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
  const listeningChange = useRef(onListening);
  const failure = useRef(onFailure);
  useEffect(() => {
    listeningChange.current = onListening;
    failure.current = onFailure;
  });
  const stopReporting = useCallback(() => {
    stop();
    listeningChange.current?.(false);
  }, [stop]);
  useMediaCleanup(release, stopReporting);

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
      current.onerror = ({ error }) => {
        if (recognition.current !== current) return;
        release();
        setListening(false);
        failure.current?.(
          error === "not-allowed" || error === "service-not-allowed"
            ? "denied"
            : error === "no-speech"
              ? "no_speech"
              : error === "audio-capture" || error === "network"
                ? "unavailable"
                : "error",
        );
        setStatus(
          error === "not-allowed" || error === "service-not-allowed"
            ? "Le microphone n’est pas autorisé. Vous pouvez écrire votre réponse."
            : error === "no-speech"
              ? "Vous pouvez reprendre quand vous êtes prêt ou écrire votre réponse."
              : "La reconnaissance vocale est indisponible. Vous pouvez écrire votre réponse.",
        );
      };
      current.onend = () => {
        if (recognition.current !== current) return;
        recognition.current = null;
        setListening(false);
        listeningChange.current?.(false);
        setStatus((message) =>
          message === "Je vous écoute…" ? speechIdle : message,
        );
      };
      current.start();
      setListening(true);
      listeningChange.current?.(true);
      setStatus("Je vous écoute…");
    } catch {
      stop();
      setStatus("Le microphone ne démarre pas. Écrivez votre réponse.");
      failure.current?.("unavailable");
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
            if (!event.target.checked) stopReporting();
          }}
        />
        J’accepte la reconnaissance vocale du navigateur pour cet exercice.
      </label>
      <p>Le navigateur peut transmettre l’audio à son fournisseur.</p>
      <button
        type="button"
        disabled={!consent}
        onClick={listening ? stopReporting : start}
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
      const tracks = acquired.getTracks();
      const ended = () => {
        stop();
        setMessage("Aperçu arrêté. Vous pouvez continuer sans caméra.");
      };
      tracks.forEach((track) => track.addEventListener("ended", ended));
      removeEndedListener.current = () => {
        tracks.forEach((track) => track.removeEventListener("ended", ended));
      };
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
