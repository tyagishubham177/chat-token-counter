import { findScrollContainer, getTranscript, readExchanges } from "./chatgpt.js";

const SETTLE_MS = 80;
const MAX_STEPS = 280;
const STABLE_EDGE = 3;

function mergeTurns(index, turns, preferEarlier) {
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!index.records.has(turn.id)) {
      const previous = turns[i - 1]?.id;
      const next = turns.slice(i + 1).find(({ id }) => index.records.has(id))?.id;
      const at = previous ? index.order.indexOf(previous) + 1
        : next ? index.order.indexOf(next) : preferEarlier ? 0 : index.order.length;
      index.order.splice(at, 0, turn.id);
    }
    const prior = index.records.get(turn.id);
    index.records.set(turn.id, { id: turn.id, promptText: turn.promptText,
      replyText: turn.replyText || prior?.replyText || "" });
  }
}

const emptyIndex = () => ({ order: [], records: new Map() });

export function createConversationHistory() {
  const listeners = new Set();
  let index = emptyIndex();
  let snapshot;
  let transcript;
  let scroller;
  let scrollTarget;
  let route = location.pathname;
  let identity;
  let visible = [];
  let complete = false;
  let operation;
  let timer;
  let lastPosition = 0;

  function publish() {
    snapshot = { turns: index.order.map((id) => index.records.get(id)), visible, transcript, scroller,
      complete, scanning: operation?.type === "scan", navigating: operation?.type === "seek" };
    for (const listener of listeners) listener();
  }

  function refresh() {
    clearTimeout(timer);
    timer = undefined;
    const nextTranscript = getTranscript();
    const previousTranscript = transcript;
    const nextIdentity = nextTranscript?.getAttribute("data-chatgpt-conversation-selection-target") || location.pathname;
    const changedRoute = route !== location.pathname;
    if ((changedRoute && (nextTranscript !== transcript || nextIdentity !== identity)) ||
        (nextTranscript && identity && nextIdentity !== identity)) {
      if (operation) operation.cancelled = true;
      index = emptyIndex();
      complete = false;
      lastPosition = 0;
    }
    route = location.pathname;
    transcript = nextTranscript;
    if (nextTranscript || changedRoute) identity = nextIdentity;
    visible = readExchanges(transcript);
    const nextScroller = visible.length ? findScrollContainer(visible[0].node)
      : nextTranscript && nextTranscript === previousTranscript ? scroller : null;
    if (scroller !== nextScroller) {
      scrollTarget?.removeEventListener("scroll", schedule);
      scroller = nextScroller;
      scrollTarget = scroller === document.scrollingElement ? document : scroller;
      scrollTarget?.addEventListener("scroll", schedule, { passive: true });
    }
    const position = scroller?.scrollTop ?? 0;
    const beforeCount = index.order.length;
    mergeTurns(index, visible, position < lastPosition);
    if (index.order.length !== beforeCount) complete = false;
    if (scroller && visible.length && index.order.length === visible.length && scroller.scrollHeight <= scroller.clientHeight + 2) {
      complete = true;
    }
    lastPosition = position;
    publish();
  }

  function schedule() {
    timer ??= setTimeout(refresh, SETTLE_MS);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributeFilter: ["data-chatgpt-conversation-selection-target", "hidden", "aria-hidden"] });
  window.navigation?.addEventListener("currententrychange", schedule);
  refresh();

  function sameChat(task) {
    return location.pathname === task.route && transcript === task.transcript && scroller === task.pane;
  }

  function bounds(pane) {
    return pane === document.scrollingElement ? { top: 0, bottom: innerHeight } : pane.getBoundingClientRect();
  }

  function begin(type) {
    if (!scroller || !visible.length || operation) return null;
    const pane = scroller;
    const { top } = bounds(pane);
    const reading = visible.findLast(({ node }) => node.getBoundingClientRect().top <= top + 24) || visible[0];
    const task = { type, pane, transcript, route, position: pane.scrollTop, id: reading.id,
      offset: reading.node.getBoundingClientRect().top - top, cancelled: false };
    operation = task;
    transcript.classList.add("cwb-indexing");
    publish();
    return task;
  }

  function end(task) {
    task.transcript.classList.remove("cwb-indexing");
    operation = undefined;
    refresh();
  }

  async function move(task, top) {
    task.pane.scrollTo({ top, behavior: "instant" });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    refresh();
  }

  function align(pane, node, offset) {
    pane.scrollTo({ top: pane.scrollTop + node.getBoundingClientRect().top - bounds(pane).top - offset, behavior: "instant" });
  }

  function edgeKey(pane, atTop) {
    const maximum = Math.max(0, pane.scrollHeight - pane.clientHeight);
    if (!visible.length || Math.abs((atTop ? 0 : maximum) - pane.scrollTop) > 2) return "";
    return `${pane.scrollHeight}/${visible[0].id}/${visible.at(-1).id}`;
  }

  async function findTurn(task, id, restoring = false) {
    let previousEdge = "";
    let stable = 0;
    for (let step = 0; step < MAX_STEPS && sameChat(task) && (restoring || !task.cancelled); step++) {
      const turn = visible.find((entry) => entry.id === id);
      if (turn) return turn;
      const targetOrder = index.order.indexOf(id);
      const firstOrder = index.order.indexOf(visible[0]?.id);
      if (targetOrder < 0 || firstOrder < 0) return null;
      const earlier = targetOrder < firstOrder;
      const edge = edgeKey(task.pane, earlier);
      stable = edge && edge === previousEdge ? stable + 1 : 0;
      if (stable >= STABLE_EDGE) break;
      previousEdge = edge;
      await move(task, task.pane.scrollTop + task.pane.clientHeight * (earlier ? -0.76 : 0.76));
    }
    return null;
  }

  async function restore(task) {
    if (!sameChat(task)) return;
    await move(task, task.position);
    if (!sameChat(task)) return;
    const turn = await findTurn(task, task.id, true);
    if (turn && sameChat(task)) align(task.pane, turn.node, task.offset);
    else if (sameChat(task)) task.pane.scrollTo({ top: task.position, behavior: "instant" });
  }

  async function scan() {
    if (complete) return true;
    const task = begin("scan");
    if (!task) return false;
    const scanned = emptyIndex();
    let reachedTop = false;
    let reachedBottom = false;
    let previousEdge = "";
    let stable = 0;
    try {
      for (let step = 0; step < MAX_STEPS && sameChat(task) && !task.cancelled; step++) {
        const pane = task.pane;
        await move(task, reachedTop ? pane.scrollTop + pane.clientHeight * 0.76 : 0);
        if (!sameChat(task) || task.cancelled) break;
        if (reachedTop) mergeTurns(scanned, visible, false);
        const edge = edgeKey(pane, !reachedTop);
        stable = edge && edge === previousEdge ? stable + 1 : 0;
        previousEdge = edge;
        if (stable < STABLE_EDGE) continue;
        if (reachedTop) {
          reachedBottom = true;
          break;
        }
        reachedTop = true;
        mergeTurns(scanned, visible, false);
        stable = 0;
        previousEdge = "";
      }
      await restore(task);
      if (sameChat(task) && reachedBottom && !task.cancelled && scanned.order.length) {
        index = scanned;
        complete = true;
      }
      return sameChat(task) && reachedBottom && !task.cancelled;
    } finally {
      end(task);
    }
  }

  async function seek(id, offset) {
    refresh();
    if (operation || !scroller || !transcript) return null;
    const direct = visible.find((turn) => turn.id === id);
    if (direct?.node.isConnected) {
      align(scroller, direct.node, offset);
      return direct;
    }
    const task = begin("seek");
    if (!task) return null;
    try {
      const turn = await findTurn(task, id);
      if (turn?.node.isConnected && sameChat(task) && !task.cancelled) {
        align(task.pane, turn.node, offset);
        return turn;
      }
      await restore(task);
      return null;
    } finally {
      end(task);
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    scan,
    seek,
    cancelScan() {
      if (operation?.type === "scan") operation.cancelled = true;
    },
  };
}
