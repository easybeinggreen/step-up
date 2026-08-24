// Web Speech API wrapper: SpeechRecognition (listening) + SpeechSynthesis (coaching).
// Both are free/built into Chrome — no API keys, no network dependency beyond
// the browser's own engine. See PROJECT_NOTES.md for why no LLM is involved
// in parsing commands: these are simple, fixed phrases.

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

export const VOICE_INPUT_SUPPORTED = !!SpeechRecognitionImpl;
export const VOICE_OUTPUT_SUPPORTED = 'speechSynthesis' in window;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let cachedVoice = null;
function pickVoice() {
  if (!VOICE_OUTPUT_SUPPORTED) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  cachedVoice =
    voices.find((v) => v.name === 'Google UK English Female') ||
    voices.find((v) => /UK/i.test(v.name) && /female/i.test(v.name)) ||
    voices.find((v) => v.lang === 'en-GB' && /female/i.test(v.name)) ||
    voices.find((v) => v.lang === 'en-GB') ||
    voices[0];
  return cachedVoice;
}

if (VOICE_OUTPUT_SUPPORTED) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
  };
}

/** Speak text and resolve once the utterance finishes (or immediately if unsupported). */
export function speak(text, { rate = 1 } = {}) {
  if (!VOICE_OUTPUT_SUPPORTED) return Promise.resolve();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.rate = rate;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

export function stopSpeaking() {
  if (VOICE_OUTPUT_SUPPORTED) window.speechSynthesis.cancel();
}

/**
 * Counts 1..n out loud, one number every `secondsPerRep` seconds. Pacing is
 * driven by our own timer (not by however long the TTS engine takes to say
 * the number) so it stays predictable regardless of device/voice.
 */
export async function countReps(n, secondsPerRep = 2, { onCount, shouldStop } = {}) {
  for (let i = 1; i <= n; i++) {
    if (shouldStop?.()) return i - 1;
    const start = performance.now();
    onCount?.(i);
    speak(String(i)); // fire-and-forget so the count doesn't drift with speech latency
    const targetMs = secondsPerRep * 1000;
    const waited = performance.now() - start;
    if (waited < targetMs) await sleep(targetMs - waited);
  }
  return n;
}

/** Counts up to `seconds`, one count per second — for timed holds like planks. */
export function countHold(seconds, opts) {
  return countReps(seconds, 1, opts);
}

/** Listens once for a single phrase and resolves with the transcript. */
export function listenOnce({ lang = 'en-GB' } = {}) {
  return new Promise((resolve, reject) => {
    if (!VOICE_INPUT_SUPPORTED) return reject(new Error('Speech recognition not supported on this browser'));
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let settled = false;
    recognition.onresult = (e) => {
      settled = true;
      resolve(e.results[0][0].transcript);
    };
    recognition.onerror = (e) => {
      if (!settled) {
        settled = true;
        reject(new Error(e.error));
      }
    };
    recognition.onend = () => {
      if (!settled) reject(new Error('no-speech'));
    };
    recognition.start();
  });
}

/**
 * Keyword/number parsing — no LLM call. Handles the fixed command grammar:
 * start / done / skip / finish / "increase|decrease weight to N kilos" /
 * skip-today variants.
 */
export function parseCommand(transcript) {
  const t = (transcript || '').toLowerCase().trim();

  const weightMatch = t.match(/weight.*?(\d+(?:\.\d+)?)\s*(?:kg|kilos?|kilograms?)/);
  if (weightMatch) {
    const value = parseFloat(weightMatch[1]);
    const decreasing = /decrease|down|lower|reduce/.test(t);
    return { type: 'set_weight', value, direction: decreasing ? 'decrease' : 'increase' };
  }

  if (/\b(skip today|rest day|something different|different today|not today)\b/.test(t)) {
    return { type: 'skip_today' };
  }
  if (/\bfinish\b|\bthat'?s it\b|\bstop workout\b/.test(t)) return { type: 'finish' };
  if (/\bskip\b/.test(t)) return { type: 'skip' };
  if (/\bdone\b/.test(t)) return { type: 'done' };
  if (/\b(start|begin|let'?s go)\b/.test(t)) return { type: 'start' };

  return { type: 'unknown', transcript };
}
