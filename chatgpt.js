const modernMessage = '[data-chatgpt-search-unit-key]';
const classicMessage = '[data-message-author-role]';

export function getTranscript() {
  const transcripts = [...document.querySelectorAll('[data-rail-chat-transcript="true"]')];
  if (!transcripts.length) return document.querySelector("main");
  const visible = transcripts.filter((node) => node.getClientRects().length > 0 &&
    !node.closest('[hidden], [inert], [aria-hidden="true"]'));
  const conversationId = location.pathname.match(/\/c\/([^/]+)\/?$/)?.[1];
  if (!conversationId) return visible[0] || null;

  const renderedId = (node) => node.getAttribute("data-chatgpt-conversation-selection-target");
  // ChatGPT can retain the previous transcript in the DOM after an in-app navigation.
  const exact = visible.find((node) => renderedId(node) === conversationId ||
    encodeURIComponent(renderedId(node)) === conversationId);
  if (exact) return exact;

  // A new chat can keep its local transcript ID after the URL switches to its final ID.
  return visible.find((node) => renderedId(node)?.startsWith("local-chatgpt:")) || null;
}

export function findScrollContainer(node) {
  const chatPane = node?.closest('[data-thread-frame-scrollbar="true"]');
  if (chatPane) return chatPane;
  let fallback;
  for (let parent = node?.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (!/^(auto|scroll|overlay)$/.test(getComputedStyle(parent).overflowY)) continue;
    if (parent.scrollHeight > parent.clientHeight) return parent;
    fallback ??= parent;
  }
  const page = document.scrollingElement;
  return page.scrollHeight > page.clientHeight ? page : fallback || page;
}

export function readMessages(transcript) {
  if (!transcript) return [];
  const modern = transcript.querySelectorAll(modernMessage);
  const selector = modern.length ? modernMessage : classicMessage;
  const nodes = modern.length ? modern : transcript.querySelectorAll(selector);
  const messages = [];

  for (const node of nodes) {
    if (node.parentElement.closest(selector) || node.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
    const role = node.dataset.messageAuthorRole || node.dataset.chatgptSearchUnitKey?.split(":").at(-1);
    if (role !== "user" && role !== "assistant") continue;
    const content = role === "user"
      ? node.querySelector('[data-user-message-bubble], .whitespace-pre-wrap') || node
      : node.querySelector('[data-markdown-text-style], .markdown, .prose') || (modern.length ? null : node);
    messages.push({ role, node, content });
  }
  return messages;
}

const nodeKeys = new WeakMap();
let nextNodeKey = 0;

function messageKey(node) {
  const id = node.dataset.chatgptSearchMessageIds || node.dataset.messageId ||
    node.closest('[data-turn-key]')?.dataset.turnKey || node.dataset.chatgptSearchUnitKey;
  if (id) return id;
  if (!nodeKeys.has(node)) nodeKeys.set(node, `node:${++nextNodeKey}`);
  return nodeKeys.get(node);
}

function messageText(node) {
  return (node?.innerText || node?.textContent || "").trim();
}

export function readExchanges(transcript) {
  const exchanges = [];
  for (const message of readMessages(transcript)) {
    if (message.role === "user") {
      exchanges.push({ id: messageKey(message.node), node: message.node, prompt: message.content,
        promptText: messageText(message.content), replyText: "" });
    } else if (message.content && exchanges.length) {
      const reply = messageText(message.content);
      if (reply) {
        const turn = exchanges.at(-1);
        turn.replyText = turn.replyText ? `${turn.replyText}\n\n${reply}` : reply;
      }
    }
  }
  return exchanges;
}

export function excerpt(value, limit) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
