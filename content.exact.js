import { init, Tiktoken } from "@dqbd/tiktoken/lite/init";
import wasm from "@dqbd/tiktoken/lite/tiktoken_bg.wasm";
import o200k from "@dqbd/tiktoken/encoders/o200k_base.json";
import { version } from "./manifest.json";

const composerSelectors = [
  ':is(textarea, [contenteditable="true"]):is(#prompt-textarea, [data-testid="prompt-textarea"], [data-testid="prompt-text-input"])',
  ':is(textarea, [contenteditable="true"]):is([aria-label="Ask ChatGPT"], [aria-label="Message ChatGPT"])',
  ':is([data-testid="composer"], [data-testid="composer-root"], form:has(button[data-testid="send-button"])) :is(textarea, [contenteditable="true"])',
];
const excludedComposer = '[hidden], [inert], [aria-hidden="true"], [data-message-author-role], [data-rail-chat-transcript]';
const modes = ["compact", "expanded", "collapsed"];
const countFormat = new Intl.NumberFormat();
const emptyHistory = { turns: [], complete: false, scanning: false };
let tokenizerReady;

function findComposer() {
  for (const selector of composerSelectors) {
    const input = [...document.querySelectorAll(selector)].find((node) =>
      node.getClientRects().length && !node.closest(excludedComposer));
    if (input) return input;
  }
  return null;
}

export async function startTokenCounter(signal, history) {
  tokenizerReady ??= init((imports) => WebAssembly.instantiate(wasm, imports)).catch((error) => {
    tokenizerReady = undefined;
    throw error;
  });
  await tokenizerReady;
  if (signal.aborted) return;

  const encoder = new Tiktoken(o200k.bpe_ranks, o200k.special_tokens, o200k.pat_str);
  const widget = document.createElement("button");
  widget.type = "button";
  widget.id = "tc_widget";
  widget.className = "tc-compact tc-show";
  widget.setAttribute("aria-expanded", "false");
  widget.innerHTML = `
    <span id="tc_inner">
      <span id="tc_bottle" aria-hidden="true">
        <svg viewBox="0 0 44 88" fill="none">
          <path d="M15 5h14v12l7 9v49a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8V26l7-9V5Z" stroke="currentColor" stroke-width="2" opacity=".55"/>
          <path d="M15 13h14M15 30v37" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".28"/>
          <circle cx="24" cy="55" r="5" fill="var(--liq)"/>
        </svg>
      </span>
      <span id="tc_value">0</span>
      <span id="tc_scope"></span>
      <span id="tc_ver">v${version}</span>
    </span>`;
  document.documentElement.append(widget);

  const valueElement = widget.querySelector("#tc_value");
  const scopeElement = widget.querySelector("#tc_scope");
  const cache = new Map();
  let composer;
  let draftText;
  let draftCount = 0;
  let conversationCount = 0;
  let coverage = "draft";
  let mode = 0;
  let frame;
  let failed = false;

  // User-visible text may contain strings that the tokenizer reserves as control markers.
  const countTokens = (text) => text ? encoder.encode(text, [], []).length : 0;

  function render() {
    const total = conversationCount + draftCount;
    const exactDisplay = countFormat.format(total);
    const compactDisplay = total >= 10000 ? `${(total / 1000).toFixed(1)}k` : exactDisplay;
    const scope = {
      complete: "Indexed chat + draft",
      partial: "Partial chat + draft",
      scanning: "Indexing chat",
      draft: "Draft only",
    }[coverage];
    const description = failed ? "Token estimate unavailable" : `${exactDisplay} estimated text tokens · ${scope}`;
    const display = failed ? "—" : mode === 0 ? compactDisplay : exactDisplay;
    if (valueElement.textContent !== display) valueElement.textContent = display;
    if (scopeElement.textContent !== (failed ? "Estimate unavailable" : scope)) {
      scopeElement.textContent = failed ? "Estimate unavailable" : scope;
    }
    widget.dataset.coverage = failed ? "unavailable" : coverage;
    widget.dataset.state = !failed && (total || coverage !== "draft") ? "counting" : "ready";
    widget.title = description;
    widget.setAttribute("aria-label", `Token counter. ${description}`);
  }

  function update(includeHistory = false) {
    try {
      if (includeHistory || failed) {
        const { turns, complete, scanning } = history?.getSnapshot() || emptyHistory;
        const currentIds = new Set();
        let total = 0;
        for (const { id, promptText, replyText } of turns) {
          if (currentIds.has(id)) continue;
          currentIds.add(id);
          let saved = cache.get(id);
          if (!saved || saved.promptText !== promptText || saved.replyText !== replyText) {
            const count = countTokens(promptText) + countTokens(replyText);
            saved = { promptText, replyText, count };
            cache.set(id, saved);
          }
          total += saved.count;
        }
        for (const id of cache.keys()) {
          if (!currentIds.has(id)) cache.delete(id);
        }
        conversationCount = total;
        coverage = scanning ? "scanning" : complete ? "complete" : turns.length ? "partial" : "draft";
      }

      composer = findComposer();
      const text = composer?.value ?? (composer?.textContent ? composer.innerText : "");
      if (text !== draftText) {
        draftCount = countTokens(text);
        draftText = text;
      }
      failed = false;
    } catch {
      if (!failed) console.warn("Chat Workbench could not estimate the token count.");
      failed = true;
    }
    render();
  }

  const onInput = (event) => {
    if (!composer?.isConnected) composer = findComposer();
    if (composer?.contains(event.target)) update();
  };
  const scheduleDraft = () => {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      update();
    });
  };
  const observer = new MutationObserver((records) => {
    if (!composer?.isConnected || records.some(({ target }) =>
      composer.contains(target) || (target instanceof Element && target.contains(composer)))) scheduleDraft();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  document.addEventListener("input", onInput, { passive: true, signal });
  window.navigation?.addEventListener("currententrychange", scheduleDraft, { signal });
  const unsubscribe = history?.subscribe(() => update(true));

  widget.addEventListener("click", () => {
    widget.classList.remove(`tc-${modes[mode]}`);
    mode = (mode + 1) % modes.length;
    widget.classList.add(`tc-${modes[mode]}`);
    widget.setAttribute("aria-expanded", String(mode === 1));
    render();
  });

  signal.addEventListener("abort", () => {
    observer.disconnect();
    unsubscribe?.();
    cancelAnimationFrame(frame);
    widget.remove();
    encoder.free();
  }, { once: true });
  update(true);
}
