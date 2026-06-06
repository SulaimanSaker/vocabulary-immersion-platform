import { useEffect, useMemo, useRef, useState } from "react";

type Status = "idle" | "playing" | "paused";

// Remove the [[highlight]] markers so they aren't read aloud.
const STRIP_MARKERS = /\[\[(.+?)\]\]/g;
const RATES = [0.75, 1, 1.25, 1.5];

const supported = typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Reads a passage aloud using the browser's built-in speech synthesis.
 * Free, offline, and no API calls — quality depends on the voices your OS/browser provides.
 */
export function PassageAudio({ text }: { text: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const keepAlive = useRef<number | null>(null);

  const clean = useMemo(() => text.replace(STRIP_MARKERS, "$1"), [text]);
  const englishVoices = useMemo(
    () => voices.filter((v) => v.lang.toLowerCase().startsWith("en")),
    [voices],
  );
  const voiceList = englishVoices.length ? englishVoices : voices;

  // Load available voices (they arrive asynchronously in some browsers).
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      setVoices(all);
      setVoiceURI((current) => {
        if (current) return current;
        const en = all.find((v) => v.lang.toLowerCase().startsWith("en"));
        return en?.voiceURI ?? all[0]?.voiceURI ?? "";
      });
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  function clearKeepAlive() {
    if (keepAlive.current !== null) {
      clearInterval(keepAlive.current);
      keepAlive.current = null;
    }
  }

  // Reset whenever a new passage is shown, and clean up on unmount.
  useEffect(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setStatus("idle");
    clearKeepAlive();
    return () => {
      window.speechSynthesis.cancel();
      clearKeepAlive();
    };
  }, [clean]);

  function speak() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    clearKeepAlive();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = rate;
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      setStatus("idle");
      clearKeepAlive();
    };
    utterance.onerror = () => {
      setStatus("idle");
      clearKeepAlive();
    };

    window.speechSynthesis.speak(utterance);
    setStatus("playing");

    // Chrome cuts off long utterances after ~15s; nudge it to keep going.
    keepAlive.current = window.setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 10000);
  }

  function pause() {
    window.speechSynthesis.pause();
    setStatus("paused");
  }

  function resume() {
    window.speechSynthesis.resume();
    setStatus("playing");
  }

  function stop() {
    window.speechSynthesis.cancel();
    clearKeepAlive();
    setStatus("idle");
  }

  // Re-speak with the new setting if a change is made mid-playback.
  function handleRate(next: number) {
    setRate(next);
    if (status !== "idle") setTimeout(speak, 0);
  }

  function handleVoice(uri: string) {
    setVoiceURI(uri);
    if (status !== "idle") setTimeout(speak, 0);
  }

  if (!supported) {
    return <span className="audio-unsupported">Audio isn’t supported in this browser.</span>;
  }

  return (
    <div className="audio-controls">
      {status === "idle" && (
        <button className="audio-btn primary" onClick={speak} title="Read this passage aloud">
          🔊 Listen
        </button>
      )}
      {status === "playing" && (
        <button className="audio-btn" onClick={pause}>
          ⏸ Pause
        </button>
      )}
      {status === "paused" && (
        <button className="audio-btn" onClick={resume}>
          ▶ Resume
        </button>
      )}
      {status !== "idle" && (
        <button className="audio-btn" onClick={stop}>
          ⏹ Stop
        </button>
      )}

      <select
        className="audio-select"
        value={rate}
        onChange={(e) => handleRate(Number(e.target.value))}
        title="Playback speed"
      >
        {RATES.map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>

      {voiceList.length > 1 && (
        <select
          className="audio-select voice"
          value={voiceURI}
          onChange={(e) => handleVoice(e.target.value)}
          title="Voice"
        >
          {voiceList.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
