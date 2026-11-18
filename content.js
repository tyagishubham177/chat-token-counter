import { startAnchors } from "./anchors.js";
import { startAurora } from "./aurora.js";
import { startTokenCounter } from "./content.exact.js";
import { createConversationHistory } from "./history.js";
import {
  AURORA_WALLPAPER_KEY,
  DEFAULT_PREFERENCES,
  normalizePreference,
  normalizeWallpaper,
} from "./preferences.js";

if (!window.__CHAT_WORKBENCH_INJECTED__) {
  window.__CHAT_WORKBENCH_INJECTED__ = true;

  const features = {
    anchorsEnabled: startAnchors,
    counterEnabled: startTokenCounter,
    auroraEnabled: startAurora,
  };
  const defaults = { ...DEFAULT_PREFERENCES, [AURORA_WALLPAPER_KEY]: null };
  const preferences = { ...DEFAULT_PREFERENCES };
  const active = new Map();
  const changed = new Set();
  let history;
  let updateAnchors;
  let updateAurora;

  function apply(key, value) {
    preferences[key] = key === AURORA_WALLPAPER_KEY
      ? normalizeWallpaper(value)
      : normalizePreference(key, value);
    if (key === "anchorSide") {
      if (active.has("anchorsEnabled")) updateAnchors?.();
      return;
    }
    if (!Object.hasOwn(features, key)) {
      if (active.has("auroraEnabled")) updateAurora?.();
      return;
    }
    if (!preferences[key]) {
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
      console.error("Chat Workbench could not start " + key, error);
    };
    try {
      if (key !== "auroraEnabled") history ??= createConversationHistory();
      const result = features[key](controller.signal, history, preferences);
      if (key === "anchorsEnabled") updateAnchors = result;
      if (key === "auroraEnabled") updateAurora = result;
      Promise.resolve(result).catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(defaults)) {
      if (!Object.hasOwn(changes, key)) continue;
      changed.add(key);
      apply(key, changes[key].newValue);
    }
  });

  chrome.storage.local.get(defaults).catch((error) => {
    console.error("Chat Workbench could not read preferences. Applying defaults.", error);
    return defaults;
  }).then((settings) => {
    const configuration = Object.keys(defaults).filter((key) => !Object.hasOwn(features, key));
    for (const key of [...configuration, ...Object.keys(features)]) {
      if (!changed.has(key)) apply(key, settings[key]);
    }
    changed.clear();
  });
}
