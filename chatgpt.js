const modernMessage = '[data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"]';
const classicMessage = '[data-message-author-role="user"], [data-message-author-role="assistant"]';

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
    const content = role === "user"
      ? node.querySelector('[data-user-message-bubble], .whitespace-pre-wrap') || node
      : node.querySelector('[data-markdown-text-style], .markdown, .prose') || (modern.length ? null : node);
    messages.push({ role, node, content });
  }
  return messages;
}

export function readExchanges(transcript) {
  const exchanges = [];
  for (const message of readMessages(transcript)) {
    if (message.role === "user") {
      exchanges.push({ node: message.node, prompt: message.content, replies: [] });
    } else if (message.content && exchanges.length) {
      exchanges.at(-1).replies.push(message.content);
    }
  }
  return exchanges;
}

export function excerpt(node, limit) {
  const text = (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
