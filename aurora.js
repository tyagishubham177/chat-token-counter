import { AURORA_WALLPAPER_KEY } from "./preferences.js";

const BACKGROUND_CLASS = "cwb-aurora-on";
const HIDDEN_CLASS = "cwb-aurora-hidden";
const LIMIT_DELAY_MS = 5 * 60 * 1000;
const UPGRADE_SELECTOR = [
  '[data-testid="upgrade-button"]',
  'header#page-header :is(button, a)',
  '#stage-slideover-sidebar :is(button, a, [role="menuitem"])',
  '[role="menu"] [role="menuitem"]',
].join(", ");
const LIMIT_SELECTOR = [
  '[data-testid="model-limit-notice"]',
  '[role="alert"]',
  '[role="status"]',
  '.text-token-text-primary.bg-token-main-surface-primary.rounded-3xl.gap-4',
].join(", ");

function controlText(node) {
  return (node.getAttribute("aria-label") || node.textContent).trim().replace(/\s+/g, " ");
}

function isUpgrade(node) {
  return node.matches('[data-testid="upgrade-button"]') ||
    /^(upgrade(?: (?:plan|to (?:plus|pro|business|go)))?|get (?:plus|pro|go))$/i.test(controlText(node));
}

function isLimitNotice(node) {
  if (node.closest("[data-message-author-role]")) return false;
  const text = node.textContent.trim().replace(/\s+/g, " ");
  return text.length < 600 && /\b(?:GPT[ \-‑]?5(?:\.\d+)?|model)\b/i.test(text) &&
    /\b(?:usage limit|rate limit|limit (?:for|reached)|reached (?:the |your )?limit|hit (?:the |your )?limit|out of (?:messages|responses))\b/i.test(text);
}

export function startAurora(signal, _history, preferences) {
  const root = document.documentElement;
  const background = document.createElement("div");
  background.id = "cwb-aurora-background";
  background.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  image.hidden = true;
  background.append(image);

  const hidden = new Set();
  const limitSince = new Map();
  const observer = new MutationObserver(scheduleControls);
  let timer;
  let frame;
  let observing = false;

  function updateControls() {
    clearTimeout(timer);
    const nextHidden = new Set();
    if (preferences.auroraHideUpgrade) {
      for (const node of document.querySelectorAll(UPGRADE_SELECTOR)) {
        if (isUpgrade(node)) nextHidden.add(node);
      }
    }
    const limits = preferences.auroraHideLimit
      ? [...document.querySelectorAll(LIMIT_SELECTOR)].filter(isLimitNotice)
      : [];
    for (const node of limitSince.keys()) {
      if (!limits.includes(node)) limitSince.delete(node);
    }
    const now = Date.now();
    let nextCheck = Infinity;
    for (const node of limits) {
      if (!limitSince.has(node)) limitSince.set(node, now);
      const remaining = limitSince.get(node) + LIMIT_DELAY_MS - now;
      if (remaining <= 0) nextHidden.add(node);
      else nextCheck = Math.min(nextCheck, remaining);
    }
    if (Number.isFinite(nextCheck)) timer = setTimeout(updateControls, nextCheck);

    for (const node of hidden) {
      if (nextHidden.has(node)) continue;
      node.classList.remove(HIDDEN_CLASS);
      hidden.delete(node);
    }
    for (const node of nextHidden) {
      node.classList.add(HIDDEN_CLASS);
      hidden.add(node);
    }
  }

  function scheduleControls() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      updateControls();
    });
  }

  image.addEventListener("load", () => {
    image.hidden = image.naturalWidth === 0;
  }, { signal });
  image.addEventListener("error", () => {
    image.hidden = true;
    console.warn("Chat Workbench could not load the wallpaper. Showing the Aurora preset.");
  }, { signal });

  function update() {
    const inChat = /(?:^|\/)c\/[^/]+/.test(location.pathname);
    const show = preferences.auroraShowInChats || !inChat;
    root.classList.toggle(BACKGROUND_CLASS, show);
    root.classList.toggle("cwb-aurora-glass", !preferences.auroraStandardStyle);
    root.classList.toggle("cwb-aurora-motion", !preferences.auroraDisableAnimations);
    root.dataset.cwbAuroraTheme = preferences.auroraTheme;

    if (show) {
      const wallpaper = preferences[AURORA_WALLPAPER_KEY] ?? { type: "aurora" };
      if (!background.isConnected) document.body.prepend(background);
      background.dataset.preset = wallpaper.type === "blue" ? "blue" : "aurora";
      if (image.getAttribute("src") !== (wallpaper.value ?? null)) {
        image.hidden = true;
        if (wallpaper.value) image.src = wallpaper.value;
        else image.removeAttribute("src");
      }
    } else {
      background.remove();
      image.removeAttribute("src");
      image.hidden = true;
    }
    const needsObserver = preferences.auroraHideUpgrade || preferences.auroraHideLimit;
    if (needsObserver && !observing) {
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    } else if (!needsObserver && observing) {
      observer.disconnect();
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    observing = needsObserver;
    updateControls();
  }

  window.navigation?.addEventListener("currententrychange", update, { signal });
  window.addEventListener("popstate", update, { signal });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    for (const node of hidden) node.classList.remove(HIDDEN_CLASS);
    background.remove();
    image.removeAttribute("src");
    root.classList.remove(BACKGROUND_CLASS, "cwb-aurora-glass", "cwb-aurora-motion");
    delete root.dataset.cwbAuroraTheme;
  }, { once: true });
  update();
  return update;
}
