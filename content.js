import { startAnchors } from "./anchors.js";
import { startTokenCounter } from "./content.exact.js";
import { createConversationHistory } from "./history.js";
import { DEFAULT_PREFERENCES, normalizePreference } from "./preferences.js";

if (!window.__CHAT_WORKBENCH_INJECTED__) {
  window.__CHAT_WORKBENCH_INJECTED__ = true;

  const features = { anchorsEnabled: startAnchors, counterEnabled: startTokenCounter };
  const preferences = { ...DEFAULT_PREFERENCES };
  const active = new Map();
  const changed = new Set();
  let history;
  let updateAnchors;

  function apply(key, enabled) {
    preferences[key] = enabled;
    if (key === "anchorSide") {
      if (active.has("anchorsEnabled")) updateAnchors?.();
      return;
    }
    if (!enabled) {
      active.get(key)?.abort();
      active.delete(key);
      return;
    }
    if (active.has(key)) return;
    const controller = new AbortController();
    active.set(key, controller);
    const failed = (error) => {
      if (controller.signal.aborted) return;
      controller.abort();
      active.delete(key);
      console.error(`Chat Workbench could not start ${key === "anchorsEnabled" ? "chat anchors" : "the token counter"}.`, error);
    };
    try {
      history ??= createConversationHistory();
      const result = features[key](controller.signal, history, preferences);
      if (key === "anchorsEnabled") updateAnchors = result;
      Promise.resolve(result).catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (!Object.hasOwn(changes, key)) continue;
      changed.add(key);
      apply(key, normalizePreference(key, changes[key].newValue));
    }
  });

  chrome.storage.local.get(DEFAULT_PREFERENCES).catch((error) => {
    console.error("Chat Workbench could not read preferences. Applying defaults.", error);
    return DEFAULT_PREFERENCES;
  }).then((settings) => {
    for (const key of ["anchorSide", ...Object.keys(features)]) {
      if (!changed.has(key)) apply(key, normalizePreference(key, settings[key]));
    }
    changed.clear();
  });
}
