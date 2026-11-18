import { excerpt } from "./chatgpt.js";

export function startAnchors(signal, history, preferences) {
  const root = document.createElement("div");
  root.id = "cwb-anchors";
  root.hidden = true;
  root.innerHTML = `
    <button type="button" class="cwb-launcher" aria-label="Open chat anchors" title="Chat anchors" aria-expanded="false" aria-controls="cwb-anchor-list"><span aria-hidden="true"></span></button>
    <nav class="cwb-rail" aria-label="Chat anchor rail"></nav>
    <div id="cwb-anchor-preview" role="tooltip" hidden><strong></strong><span></span></div>
    <section id="cwb-anchor-list" role="dialog" aria-labelledby="cwb-anchor-heading" hidden>
      <header><h2 id="cwb-anchor-heading">Chat anchors</h2><button type="button" aria-label="Close chat anchors">×</button></header>
      <p role="status" hidden></p>
      <ol></ol>
    </section>`;
  document.documentElement.append(root);

  const launcher = root.querySelector(".cwb-launcher");
  const rail = root.querySelector(".cwb-rail");
  const preview = root.querySelector('[role="tooltip"]');
  const previewTitle = preview.querySelector("strong");
  const previewReply = preview.querySelector("span");
  const panel = root.querySelector('[role="dialog"]');
  const status = panel.querySelector('[role="status"]');
  const list = panel.querySelector("ol");
  const closeButton = panel.querySelector("header button");
  const events = { signal };

  let state = history.getSnapshot();
  let route = location.pathname;
  let scrollTarget;
  let markers = [];
  let railKey;
  let currentId;
  let previewMarker;
  let panelOpener;
  let pendingClose = false;
  let message = "";
  let highlight;
  let highlightTimer;
  let previewTimer;
  let layoutFrame;
  let scrollFrame;

  const label = (turn) => excerpt(turn?.promptText || "", 140) || "Attachment";
  const rightSide = () => preferences.anchorSide === "right";
  const paneBounds = () => state.scroller === document.scrollingElement
    ? { left: 0, top: 0, bottom: innerHeight, right: innerWidth }
    : state.scroller?.getBoundingClientRect();

  function markCurrent() {
    if (state.scanning || state.navigating || !state.visible.length) return;
    const bounds = paneBounds();
    const mounted = state.visible.filter(({ node }) => node.isConnected);
    const turn = mounted.findLast(({ node }) => node.getBoundingClientRect().top <= bounds.top + 20) || mounted[0];
    if (!turn) return;
    const moved = currentId !== turn.id;
    currentId = turn.id;
    if (moved) {
      const position = state.turns.findIndex(({ id }) => id === currentId);
      for (const { button, first, last } of markers) {
        if (position >= first && position <= last) button.setAttribute("aria-current", "location");
        else button.removeAttribute("aria-current");
      }
    }
    if (panel.hidden) return;
    for (const button of list.querySelectorAll('[aria-current]')) button.removeAttribute("aria-current");
    const row = [...list.children].find((item) => item.dataset.turnId === currentId);
    row?.firstElementChild?.setAttribute("aria-current", "location");
  }

  function onScroll() {
    scrollFrame ||= requestAnimationFrame(() => {
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

  function positionFloating(element, control, offset) {
    const bounds = control.getBoundingClientRect();
    const left = rightSide() ? bounds.left - element.offsetWidth - 6 : bounds.right + 6;
    element.style.left = `${Math.max(8, Math.min(left, innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(bounds.top + offset, innerHeight - element.offsetHeight - 8))}px`;
  }

  function updatePreview() {
    if (!previewMarker) return;
    const { button, first, last } = previewMarker;
    const turn = state.turns[first];
    if (!turn) return closePreview();
    const title = first === last ? label(turn) : `Turns ${first + 1}–${last + 1}`;
    const reply = first === last ? excerpt(turn.replyText, 260) || "Reply preview unavailable" : "Open the list at these turns";
    if (previewTitle.textContent !== title) previewTitle.textContent = title;
    if (previewReply.textContent !== reply) previewReply.textContent = reply;
    preview.hidden = false;
    positionFloating(preview, button, -6);
  }

  function showPreview(marker) {
    clearTimeout(previewTimer);
    if (!panel.hidden || state.scanning || state.navigating) return;
    if (previewMarker !== marker) closePreview();
    previewMarker = marker;
    marker.button.setAttribute("aria-describedby", preview.id);
    updatePreview();
  }

  function dismissPreviewSoon() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(closePreview, 140);
  }

  function closeList(restoreFocus = false, force = false) {
    if (!force && state.scanning) {
      pendingClose = true;
      history.cancelScan();
      renderPanel();
      return;
    }
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    list.replaceChildren();
    if (restoreFocus) (panelOpener?.isConnected ? panelOpener : launcher).focus({ preventScroll: true });
    pendingClose = false;
    panelOpener = undefined;
    message = "";
  }

  async function jump(id) {
    if (state.scanning || state.navigating) return;
    const pane = paneBounds();
    if (!pane || !id) return;
    const path = route;
    closePreview();
    if (!state.visible.some((turn) => turn.id === id) && panel.hidden) {
      panel.hidden = false;
      launcher.setAttribute("aria-expanded", "true");
    }
    const header = document.querySelector("#page-header")?.getBoundingClientRect();
    const offset = header && header.top <= pane.top + 16 ? Math.max(16, header.bottom - pane.top + 16) : 16;
    const turn = await history.seek(id, offset);
    if (signal.aborted || path !== route) return;
    if (!turn) {
      message = "ChatGPT couldn’t load that turn. Choose another turn or reopen the list to index the chat again.";
      renderPanel();
      return;
    }
    if (!panel.hidden) closeList(true);
    highlight?.classList.remove("cwb-jump-target");
    clearTimeout(highlightTimer);
    highlight = turn.prompt;
    highlight?.classList.add("cwb-jump-target");
    highlightTimer = setTimeout(() => highlight?.classList.remove("cwb-jump-target"), 740);
  }

  function renderPanel() {
    if (panel.hidden) return;
    const busy = state.scanning || state.navigating;
    const description = pendingClose ? "Returning to your place…" : state.scanning ? "Indexing the full conversation…"
      : state.navigating ? "Finding the selected turn…" : message || (state.complete ? "" : "Showing indexed turns so far.");
    status.hidden = !description;
    if (status.textContent !== description) status.textContent = description;
    list.hidden = busy;
    closeButton.disabled = state.navigating || pendingClose;
    closeButton.title = state.scanning ? "Cancel indexing" : "Close chat anchors";
    if (!busy) {
      while (list.children.length > state.turns.length) list.lastElementChild.remove();
      state.turns.forEach((turn, index) => {
        let item = list.children[index];
        if (!item) {
          item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.addEventListener("click", () => jump(item.dataset.turnId).catch(reportError));
          item.append(button);
          list.append(item);
        }
        item.dataset.turnId = turn.id;
        const title = label(turn);
        const button = item.firstElementChild;
        if (button.textContent !== title) button.textContent = title;
        button.setAttribute("aria-label", `Turn ${index + 1}: ${title}`);
      });
    }
    positionFloating(panel, launcher, 0);
  }

  function reportError(error) {
    console.error("Chat Workbench could not traverse the conversation.", error);
    message = "The full conversation couldn’t be loaded. Showing the turns found so far.";
    renderPanel();
  }

  async function openList(id, opener) {
    closePreview();
    panelOpener = opener;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    const path = route;
    if (!state.complete) {
      const indexing = history.scan();
      closeButton.focus({ preventScroll: true });
      const finished = await indexing;
      if (signal.aborted || path !== route || panel.hidden) return;
      if (!finished) message = "The full conversation couldn’t be loaded. Showing the turns found so far.";
    }
    renderPanel();
    markCurrent();
    const row = [...list.children].find((item) => item.dataset.turnId === id);
    (row?.firstElementChild || closeButton).focus({ preventScroll: true });
  }

  function renderRail(capacity) {
    const key = capacity ? `${capacity}/${state.turns.map(({ id }) => id).join("|")}` : "";
    if (key === railKey) return;
    const focused = markers.find(({ button }) => button === document.activeElement)?.first;
    closePreview();
    railKey = key;
    currentId = undefined;
    markers = [];
    rail.replaceChildren();
    rail.hidden = !capacity;
    const groups = Math.min(state.turns.length, capacity);
    for (let index = 0; index < groups; index++) {
      const first = Math.floor(index * state.turns.length / groups);
      const last = Math.floor((index + 1) * state.turns.length / groups) - 1;
      const button = document.createElement("button");
      button.type = "button";
      const marker = { button, first, last };
      button.addEventListener("click", () => {
        const id = state.turns[first]?.id;
        const action = first === last ? jump(id) : openList(id, button);
        action.catch(reportError);
      });
      button.addEventListener("pointerenter", () => showPreview(marker));
      button.addEventListener("pointerleave", dismissPreviewSoon);
      button.addEventListener("focus", () => showPreview(marker));
      button.addEventListener("blur", closePreview);
      markers.push(marker);
      rail.append(button);
    }
    if (focused !== undefined) (markers.find(({ last }) => last >= focused)?.button || launcher).focus({ preventScroll: true });
  }

  function layout() {
    const bounds = paneBounds();
    if (!bounds || !state.turns.length) return;
    const column = state.transcript.getBoundingClientRect();
    const top = Math.max(0, bounds.top);
    const height = Math.min(innerHeight, bounds.bottom) - top;
    const right = rightSide();
    const gutter = right ? bounds.right - column.right : column.left - bounds.left;
    const paneEdge = right ? bounds.right - 24 : bounds.left;
    const columnEdge = right ? column.right + 12 : column.left - 36;
    const x = gutter >= 38 ? columnEdge : paneEdge;
    root.dataset.side = preferences.anchorSide;
    root.style.left = `${Math.max(4, Math.min(x, innerWidth - 28))}px`;
    root.style.top = `${Math.max(8, Math.round(top + height * 0.35))}px`;
    const capacity = state.turns.length > 1 && height >= 172 ? Math.min(36, Math.floor((height * 0.62 - 30) / 13)) : 0;
    renderRail(capacity);
    renderPanel();
    updatePreview();
  }

  function onLayout() {
    layoutFrame ||= requestAnimationFrame(() => {
      layoutFrame = 0;
      layout();
    });
  }

  const resize = new ResizeObserver(onLayout);

  function sync() {
    const next = history.getSnapshot();
    if (location.pathname !== route && next.transcript !== state.transcript) closeList(false, true);
    route = location.pathname;
    if (next.scroller !== state.scroller || !scrollTarget) {
      scrollTarget?.removeEventListener("scroll", onScroll);
      resize.disconnect();
      scrollTarget = next.scroller === document.scrollingElement ? document : next.scroller;
      scrollTarget?.addEventListener("scroll", onScroll, { passive: true, signal });
      if (next.scroller) resize.observe(next.scroller);
      if (next.transcript && next.transcript !== next.scroller) resize.observe(next.transcript);
    }
    state = next;
    root.hidden = !state.scroller || !state.turns.length;
    if (pendingClose && !state.scanning) closeList(true);
    if (root.hidden) return;
    if (!state.scanning && !state.navigating) layout();
    else renderPanel();
    for (const { button, first, last } of markers) {
      const name = first === last ? `Turn ${first + 1}: ${label(state.turns[first])}` : `Turns ${first + 1}–${last + 1}`;
      if (button.getAttribute("aria-label") !== name) button.setAttribute("aria-label", name);
    }
    markCurrent();
  }

  launcher.addEventListener("click", () => {
    if (panel.hidden) openList(currentId, launcher).catch(reportError);
    else closeList(true);
  }, events);
  closeButton.addEventListener("click", () => closeList(true), events);
  preview.addEventListener("pointerenter", () => clearTimeout(previewTimer), events);
  preview.addEventListener("pointerleave", dismissPreviewSoon, events);
  document.addEventListener("pointerdown", (event) => {
    if (!panel.hidden && !root.contains(event.target) && !state.navigating) closeList();
  }, events);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || (preview.hidden && panel.hidden)) return;
    event.preventDefault();
    if (panel.hidden) closePreview();
    else if (!state.navigating) closeList(true);
  }, events);
  window.addEventListener("resize", onLayout, events);
  const unsubscribe = history.subscribe(sync);
  signal.addEventListener("abort", () => {
    unsubscribe();
    resize.disconnect();
    history.cancelScan();
    clearTimeout(highlightTimer);
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(layoutFrame);
    closePreview();
    highlight?.classList.remove("cwb-jump-target");
    root.remove();
  }, { once: true });
  sync();
  return onLayout;
}
