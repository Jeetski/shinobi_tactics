const AUTOSAVE_KEY = "shinobi-character-studio-autosave-v1";

export function loadAutosave() {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAutosave(state) {
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function clearAutosave() {
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
