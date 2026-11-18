# Chat Workbench

A Chrome extension for navigating conversations and counting tokens on `chatgpt.com` and `chat.openai.com`.

- **Chat anchors** adds a rail beside the transcript. Hover or focus a tick to preview its prompt and reply. Activate it to jump. Select the pin above the rail to build a full-chat list. Chat Workbench scans the page as ChatGPT loads turns, then restores your reading position. If ChatGPT cannot load the entire history, the list shows that its results are partial.
- **Token counter** estimates the text tokens in indexed messages and the current draft locally with `tiktoken`. In long chats, open the anchor list to index older messages for the estimate. Click the counter to cycle through compact, expanded, and collapsed views.
- The Chrome toolbar popup lets you enable each tool independently and move the anchor rail to the left or right. It starts on the right. Chrome stores the preferences on your device.

## Build and load

From the repository root, run:

```bash
npm ci
npm run build
```

Open `chrome://extensions` and turn on **Developer mode**. Choose **Load unpacked** and select the folder containing `manifest.json`. To update a previously loaded copy from the same folder, use its **Reload** button. Then refresh any open ChatGPT tabs.

## Verify in Chrome

1. On `chrome://extensions`, check that the extension card reads **Chat Workbench** and `2.7.1`.
2. Open a ChatGPT conversation with several turns. Hover or focus a tick and confirm that the preview matches the turn. Click the tick or press Enter and confirm that the page jumps to that prompt.
3. Open the pin in a long chat and confirm the list includes the earliest and latest prompts. Check that the conversation returns to your reading position after indexing. Choose an offscreen turn. Repeat in a narrow window and after switching chats.
4. Type in the composer and confirm the token estimate updates. Scroll after the chat is fully indexed and confirm the estimate stays stable. Click the widget to cycle its three views.
5. In the Chrome toolbar popup, turn each tool off and on independently and switch the rail between **Left** and **Right**. Reload the page to check that the settings persist.
