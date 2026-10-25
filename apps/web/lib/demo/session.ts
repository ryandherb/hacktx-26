// Per-browser demo session. Versioned + namespaced; two computers are intentionally independent.
const KEY = "nextmove:v1:session";

export type DemoSession = { profileId: string | null };

export function loadSession(): DemoSession {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return { profileId: (JSON.parse(raw) as DemoSession).profileId ?? null };
  } catch {}
  return { profileId: null };
}

export function saveSession(s: DemoSession) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

// Assessment answers/chat/results live under other keys and are cleared on profile switch or restart.
export function clearAssessment() {
  try {
    Object.keys(window.sessionStorage)
      .filter((k) => k.startsWith("nextmove:v1:assessment"))
      .forEach((k) => window.sessionStorage.removeItem(k));
  } catch {}
}
