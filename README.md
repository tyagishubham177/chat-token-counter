# Chat Workbench

A Chrome extension for navigating conversations and counting tokens on `chatgpt.com` and `chat.openai.com`.

- **Chat anchors** adds a rail beside the transcript. Hover or focus a tick to preview a prompt and its reply, then activate the tick to jump. Open **Anchors** to choose a turn from a list, including in narrow windows and when multiple turns share a tick. In long conversations, the rail reflects the turns ChatGPT has currently loaded in the page.
- **Token counter** counts the conversation and current draft locally with `tiktoken`. Click the widget to cycle through compact, expanded, and collapsed views.
- The Chrome toolbar popup lets you enable each tool independently. Chrome stores the preferences on your device.

## Build and load

From the repository root, run:

```bash
npm ci
npm run build
```

Open `chrome://extensions` and turn on **Developer mode**. Choose **Load unpacked** and select the folder containing `manifest.json`. To update a previously loaded copy from the same folder, use its **Reload** button. Then refresh any open ChatGPT tabs.

## Verify in Chrome

1. On `chrome://extensions`, check that the extension card reads **Chat Workbench** and `2.7.0`.
2. Open a ChatGPT conversation with several turns. Hover or focus a tick and confirm that the preview matches the turn. Click the tick or press Enter and confirm that the page jumps to that prompt.
3. Open **Anchors** and choose a different turn from the list. Repeat in a narrow window and after switching chats.
4. Type in the composer and confirm that the token count updates. Click the widget to cycle its three views.
5. In the Chrome toolbar popup, turn each tool off and on independently. Reload the page to check that both settings persist.
