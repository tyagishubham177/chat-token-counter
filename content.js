import { startAnchors } from "./anchors.js";
import { startTokenCounter } from "./content.exact.js";
import { DEFAULT_PREFERENCES } from "./preferences.js";

if (!window.__CHAT_WORKBENCH_INJECTED__) {
  window.__CHAT_WORKBENCH_INJECTED__ = true;

  const features = { anchorsEnabled: startAnchors, counterEnabled: startTokenCounter };
  const active = new Map();
  const changed = new Set();

  function apply(key, enabled) {
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
      Promise.resolve(features[key](controller.signal)).catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(features)) {
      if (!Object.hasOwn(changes, key)) continue;
      changed.add(key);
      const value = changes[key].newValue;
      apply(key, typeof value === "boolean" ? value : DEFAULT_PREFERENCES[key]);
    }
  });

  chrome.storage.local.get(DEFAULT_PREFERENCES).catch((error) => {
    console.error("Chat Workbench could not read preferences. Applying defaults.", error);
    return DEFAULT_PREFERENCES;
  }).then((settings) => {
    for (const key of Object.keys(features)) {
      if (!changed.has(key)) apply(key, typeof settings[key] === "boolean" ? settings[key] : DEFAULT_PREFERENCES[key]);
    }
    changed.clear();
  });
}
