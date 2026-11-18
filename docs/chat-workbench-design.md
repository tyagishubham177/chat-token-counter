# Chat Workbench

**Proposed Chrome extension name · Design for review · Target `v2.7.0`**

Make long ChatGPT conversations easier to revisit. Chat Workbench adds **Chat anchors** alongside the existing **Token counter**. ChatGPT is the first supported site. Future sites can supply their own conversation adapter when there is a concrete need.

## Chat anchors

| Surface | Proposed behavior |
| --- | --- |
| Rail | Place a column of short horizontal ticks in the left gutter of the conversation pane, beside the transcript and clear of the site sidebar and composer. Each user prompt creates one anchor for its exchange. Order ticks from oldest at the top to newest at the bottom. |
| Current exchange | Use a longer, higher-contrast tick for the exchange at the reading position. It stays active through the corresponding reply, including long replies with the prompt above the viewport. Give hover and keyboard focus their own indicators so previewing a different turn preserves the reading position. |
| Preview | Hover or focus a tick to open a compact card to its right. Show the first meaningful line of the user prompt, up to two lines of the associated reply, and a bookmark button. The card stays open as the pointer or focus moves into it. Escape dismisses it and returns focus to the marker when applicable. |
| Jump | Click the tick or activate it with Enter or Space. Align the beginning of that prompt below sticky chat chrome and highlight it briefly. Respect the system’s reduced-motion setting. Bookmarking is a separate action. |
| Bookmark | Toggle the bookmark from the preview or anchor list. A saved mark shows a shape change as well as a color change. The **Saved** view lets the user find bookmarked prompts in this conversation. |
| List | An **Anchors** button opens a chronological list with **All** and **Saved** tabs. Use the button by itself when the conversation gutter is too narrow for the rail. The list also works with touch and keyboard. |

For a new conversation, offer the list after the first prompt appears and the rail once there are at least two prompts and space for it. In dense conversations, combine consecutive ticks when their hit areas would overlap. A grouped tick opens the list at that group. Every detected prompt still has its own list row. Lists and previews follow the site’s light or dark theme.

The Chrome toolbar popup exposes independent **Chat anchors** and **Token counter** switches. Chat anchors default on. The token counter keeps its current default and compact, expanded, and collapsed behavior. Turning either tool off removes its UI on the page and remembers the preference.

## Conversation identity and privacy

- Identify each anchor by the site, conversation, and stable provider turn ID when available. Use the current transcript and active branch for previews. Identical prompts at different positions remain distinct. An edited prompt or switched branch can replace the target, so never resolve a saved bookmark by index or text alone.
- If the page supports navigation to unloaded history, resolve and confirm the exact target before jumping. If a saved target cannot be located, show **Turn unavailable** in **Saved** and allow the user to remove it. A visible turn without a stable identity offers session navigation only.
- Display a pending-reply state while there is no response. As the reply streams, update its excerpt in place without adding a tick, resetting focus, or scrolling. For an attachment-only prompt, use a short descriptive fallback such as **Attachment**.
- Store bookmark identifiers and tool preferences on the device using `chrome.storage.local`. Keep preview text in memory and read it from the conversation already rendered in the tab. The feature needs no new host permissions or network requests. [Chrome extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## Implementation boundaries

- Start from current `main`, which declares `2.5.4` and includes the activation fix. Review the old scroll-map branch for its scroll-container discovery and target offset logic. The new rail, preview, and bookmark behavior need a separate implementation. [Activation fix](https://github.com/tyagishubham177/chat-token-counter/pull/3) · [Earlier scroll map](https://github.com/tyagishubham177/chat-token-counter/tree/feature/scroll-anchor)
- Keep anchor discovery and mount independent of tokenizer initialization so either feature can run on its own. Isolate ChatGPT route detection, turn extraction, and scroll-target lookup from presentation and bookmark storage.
- Use one set of observers per active conversation, coalesce transcript changes, and limit scroll work to updating the current anchor. Clear stale markers and previews when the user moves to another chat. Update the visible UI when preferences change across extension tabs.

## Acceptance checks

| Scenario | Expected result |
| --- | --- |
| Wide window and a multi-turn chat | Ticks appear in conversation order. Hovering an earlier tick previews its exchange without scrolling. Clicking it lands at the start of the correct prompt. The active tick remains steady through a long reply. |
| Narrow window, keyboard-only navigation, and zoom | The list remains usable without hover. Focus is visible, the jump and bookmark actions are separately reachable, and the chat sidebar and composer stay usable. |
| Dense chat, streaming, and duplicate prompts | Markers or groups remain reachable without overlapping targets. New replies update their own previews. Repeated prompts lead to different turns. |
| Reload, chat switch, edit, or branch change | A bookmark reopens the original identifiable turn after reload. Another chat loads its own anchors. Missing or replaced saved turns display the unavailable state and remain removable. |
| Independent tools | Turning off either tool leaves the other usable. The token counter still mounts, counts, and cycles through its existing views. Anchor navigation also works if tokenizer initialization fails. |
| Same-install upgrade | Reload the existing unpacked extension with the new build. The display name updates and Chrome retains the existing extension ID. Verify the version and both tools in the same profile. |

## GitHub and versioning

The latest GitHub release is `v2.5.3`, `main` declares `2.5.4`, and the old scroll-map branch declares `2.6.0`. Use `2.7.0` provisionally so the update also advances a local installation built from that prototype. Confirm the version on the installed extension and any Chrome Web Store listing before release. The manifest version governs Chrome updates. Align the Git tag and release at `v2.7.0`. [GitHub releases](https://github.com/tyagishubham177/chat-token-counter/releases) · [Chrome manifest version](https://developer.chrome.com/docs/extensions/reference/manifest/version)

After design approval, branch the implementation from then-current `main`. Rename the Chrome display name, popup and README together. Preserve the existing extension identity by reloading from the same unpacked directory or updating the existing store item, depending on how it was installed. Keep the GitHub repository URL for this release so existing clone and release links remain valid. Tag the verified merge commit and publish a GitHub release with a changelog and an installable build archive.

For the implementation build, run `npm ci` and `npm run build` from the repository root. Reload the existing unpacked extension in `chrome://extensions`, refresh the ChatGPT tab, and run the acceptance checks above.
