import { excerpt, findScrollContainer, getTranscript, readExchanges } from "./chatgpt.js";

export function startAnchors(signal) {
  const root = document.createElement("div");
  root.id = "cwb-anchors";
  root.hidden = true;
  root.innerHTML = `
    <button type="button" class="cwb-launcher" aria-expanded="false" aria-controls="cwb-anchor-list">Anchors</button>
    <nav class="cwb-rail" aria-label="Chat anchor rail"></nav>
    <div id="cwb-anchor-preview" role="tooltip" hidden><strong></strong><span></span></div>
    <section id="cwb-anchor-list" role="dialog" aria-labelledby="cwb-anchor-heading" hidden>
      <header><h2 id="cwb-anchor-heading">Chat anchors</h2><button type="button" aria-label="Close chat anchors">×</button></header>
      <ol></ol>
    </section>`;
  document.documentElement.append(root);

  const launcher = root.querySelector(".cwb-launcher");
  const rail = root.querySelector(".cwb-rail");
  const preview = root.querySelector('[role="tooltip"]');
  const previewTitle = preview.querySelector("strong");
  const previewReply = preview.querySelector("span");
  const panel = root.querySelector('[role="dialog"]');
  const list = panel.querySelector("ol");
  const closeButton = panel.querySelector("header button");
  const events = { signal };

  let transcript;
  let scroller;
  let scrollTarget;
  let route = location.pathname;
  let turns = [];
  let markers = [];
  let railLayout = "";
  let current = -1;
  let previewMarker;
  let panelOpener;
  let highlight;
  let highlightTimer;
  let previewTimer;
  let refreshTimer;
  let scrollFrame;
  let jumpFrame;

  const label = (index) => excerpt(turns[index]?.prompt, 140) || "Attachment";
  const paneBounds = () => scroller === document.scrollingElement
    ? { left: 0, top: 0, bottom: innerHeight, right: innerWidth }
    : scroller.getBoundingClientRect();

  function readingLine() {
    const paneTop = Math.max(0, paneBounds().top);
    const header = document.querySelector("#page-header")?.getBoundingClientRect();
    return Math.max(paneTop, header && header.top <= paneTop + 16 ? header.bottom : 0) + 16;
  }

  function markCurrent() {
    if (!turns.length) return;
    const line = readingLine() + 3;
    let low = 0;
    let high = turns.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (turns[middle].node.getBoundingClientRect().top <= line) low = middle + 1;
      else high = middle;
    }
    current = Math.max(0, low - 1);
    const latest = turns.at(-1).node.getBoundingClientRect();
    if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2 && latest.bottom <= paneBounds().bottom) {
      current = turns.length - 1;
    }
    for (const { button, first, last } of markers) {
      if (current >= first && current <= last) button.setAttribute("aria-current", "location");
      else button.removeAttribute("aria-current");
    }
    for (const button of list.querySelectorAll('[aria-current]')) button.removeAttribute("aria-current");
    list.children[current]?.firstElementChild?.setAttribute("aria-current", "location");
  }

  function updateReadingPosition() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      markCurrent();
    });
  }

  function closePreview() {
    clearTimeout(previewTimer);
    previewMarker?.button.removeAttribute("aria-describedby");
    previewMarker = undefined;
    preview.hidden = true;
  }

  function showPreview(marker) {
    if (!panel.hidden || marker.first !== marker.last) return;
    closePreview();
    previewMarker = marker;
    marker.button.setAttribute("aria-describedby", preview.id);
    updatePreview();
  }

  function updatePreview() {
    const turn = turns[previewMarker.first];
    if (!turn) return closePreview();
    previewTitle.textContent = label(previewMarker.first);
    previewReply.textContent = turn.replies.map((reply) => excerpt(reply, 260)).find(Boolean) || "Reply preview unavailable";
    preview.hidden = false;
    const bounds = previewMarker.button.getBoundingClientRect();
    preview.style.left = `${bounds.right + 6}px`;
    preview.style.top = `${Math.max(8, Math.min(bounds.top - 6, innerHeight - preview.offsetHeight - 8))}px`;
  }

  function dismissPreviewSoon() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(closePreview, 130);
  }

  function closeList(restoreFocus = false) {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    if (restoreFocus) (panelOpener?.isConnected && !rail.hidden ? panelOpener : launcher).focus({ preventScroll: true });
    panelOpener = undefined;
    list.replaceChildren();
  }

  function jumpToTurn(index, fromList) {
    const turn = turns[index];
    if (!turn?.node.isConnected || location.pathname !== route) {
      scheduleRefresh();
      return;
    }
    closePreview();
    if (fromList) closeList(true);
    const targetPane = scroller;
    const targetRoute = route;
    const align = () => {
      const top = targetPane.scrollTop + turn.node.getBoundingClientRect().top - readingLine();
      targetPane.scrollTo({ top, behavior: "instant" });
    };
    align();
    cancelAnimationFrame(jumpFrame);
    // ChatGPT can resize nearby turns as they come into view.
    jumpFrame = requestAnimationFrame(() => {
      if (targetPane === scroller && targetRoute === location.pathname && turn.node.isConnected) align();
    });
    highlight?.classList.remove("cwb-jump-target");
    clearTimeout(highlightTimer);
    highlight = turn.prompt;
    highlight?.classList.add("cwb-jump-target");
    highlightTimer = setTimeout(() => highlight?.classList.remove("cwb-jump-target"), 950);
  }

  function renderList() {
    while (list.children.length > turns.length) list.lastElementChild.remove();
    turns.forEach((_, index) => {
      let button = list.children[index]?.firstElementChild;
      if (!button) {
        const item = document.createElement("li");
        button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", () => jumpToTurn(index, true));
        item.append(button);
        list.append(item);
      }
      const title = label(index);
      if (button.textContent !== title) button.textContent = title;
      button.setAttribute("aria-label", `Turn ${index + 1}: ${title}`);
    });
  }

  function openList(index, opener) {
    closePreview();
    panelOpener = opener;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    renderList();
    markCurrent();
    positionPanel();
    (list.children[index]?.firstElementChild || closeButton).focus();
  }

  function positionPanel() {
    if (panel.hidden) return;
    const bounds = launcher.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(bounds.bottom + 8, innerHeight - panel.offsetHeight - 8))}px`;
  }

  function renderRail(capacity) {
    const layout = `${turns.length}/${capacity}`;
    if (railLayout === layout) return;
    const focused = markers.find(({ button }) => button === document.activeElement)?.first;
    closePreview();
    railLayout = layout;
    markers = [];
    rail.replaceChildren();
    rail.hidden = !capacity;
    if (capacity) {
      const groups = Math.min(turns.length, capacity);
      for (let index = 0; index < groups; index += 1) {
        const first = Math.floor(index * turns.length / groups);
        const last = Math.floor((index + 1) * turns.length / groups) - 1;
        const button = document.createElement("button");
        button.type = "button";
        const marker = { button, first, last };
        if (first !== last) {
          button.className = "cwb-group";
          button.title = `Turns ${first + 1}–${last + 1}`;
        }
        button.addEventListener("click", () => first === last ? jumpToTurn(first, false) : openList(first, button));
        button.addEventListener("pointerenter", () => showPreview(marker));
        button.addEventListener("pointerleave", dismissPreviewSoon);
        button.addEventListener("focus", () => showPreview(marker));
        button.addEventListener("blur", closePreview);
        markers.push(marker);
        rail.append(button);
      }
    }
    if (focused !== undefined) (markers.find(({ last }) => last >= focused)?.button || launcher).focus({ preventScroll: true });
  }

  function layout() {
    const bounds = paneBounds();
    const column = transcript.matches('[data-rail-chat-transcript]') ? transcript : turns[0].node;
    const gutter = column.getBoundingClientRect().left - bounds.left;
    const top = Math.max(0, bounds.top);
    const height = Math.min(innerHeight, bounds.bottom) - top;
    const capacity = turns.length > 1 && gutter >= 76 && height >= 252
      ? Math.min(24, Math.floor((height - 110) / 24))
      : 0;
    root.style.left = `${Math.max(8, bounds.left + (capacity ? gutter - 76 : 8))}px`;
    const tickHeight = Math.min(turns.length, capacity) * 24;
    root.style.top = `${capacity ? top + Math.round((height - tickHeight - 42) * 0.4) : readingLine()}px`;
    renderRail(capacity);
    positionPanel();
  }

  const resize = new ResizeObserver(scheduleRefresh);

  function refresh() {
    refreshTimer = undefined;
    const nextTranscript = getTranscript();
    const nextTurns = readExchanges(nextTranscript);
    const nextScroller = nextTurns.length ? findScrollContainer(nextTurns[0].node) : null;
    if (route !== location.pathname || transcript !== nextTranscript || scroller !== nextScroller) {
      closePreview();
      closeList();
      route = location.pathname;
      scrollTarget?.removeEventListener("scroll", updateReadingPosition);
      resize.disconnect();
      transcript = nextTranscript;
      scroller = nextScroller;
      scrollTarget = scroller === document.scrollingElement ? document : scroller;
      if (scroller) {
        scrollTarget.addEventListener("scroll", updateReadingPosition, { passive: true, signal });
        resize.observe(scroller);
        if (transcript !== scroller) resize.observe(transcript);
      }
    }
    turns = nextTurns;
    root.hidden = !scroller;
    if (!scroller) return;
    layout();
    for (const { button, first, last } of markers) {
      const name = first === last ? `Turn ${first + 1}: ${label(first)}` : button.title;
      if (button.getAttribute("aria-label") !== name) button.setAttribute("aria-label", name);
    }
    if (previewMarker) updatePreview();
    if (!panel.hidden) renderList();
    markCurrent();
  }

  function scheduleRefresh() {
    if (refreshTimer === undefined) refreshTimer = setTimeout(refresh, 72);
  }

  launcher.addEventListener("click", () => panel.hidden ? openList(current, launcher) : closeList(true), events);
  closeButton.addEventListener("click", () => closeList(true), events);
  preview.addEventListener("pointerenter", () => clearTimeout(previewTimer), events);
  preview.addEventListener("pointerleave", dismissPreviewSoon, events);
  document.addEventListener("pointerdown", (event) => {
    if (!panel.hidden && !root.contains(event.target)) closeList();
  }, events);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || (preview.hidden && panel.hidden)) return;
    event.preventDefault();
    if (!panel.hidden) closeList(true);
    else closePreview();
  }, events);
  window.addEventListener("resize", scheduleRefresh, events);
  window.navigation?.addEventListener("currententrychange", scheduleRefresh, events);

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: ["data-chatgpt-conversation-selection-target", "hidden", "aria-hidden"],
  });
  signal.addEventListener("abort", () => {
    observer.disconnect();
    resize.disconnect();
    clearTimeout(refreshTimer);
    clearTimeout(highlightTimer);
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(jumpFrame);
    closePreview();
    highlight?.classList.remove("cwb-jump-target");
    root.remove();
  }, { once: true });
  refresh();
}
