# Chat Workbench

A Chrome extension for navigating conversations, counting tokens, and adding an ambient wallpaper on `chatgpt.com` and `chat.openai.com`.

- **Chat anchors** adds a rail beside the transcript. Hover or focus a tick to preview its prompt and reply. Activate it to jump. Select the pin above the rail to build a full-chat list. Chat Workbench scans the page as ChatGPT loads turns, then restores your reading position. If ChatGPT cannot load the entire history, the list shows that its results are partial.
- **Token counter** estimates the text tokens in indexed messages and the current draft locally with `tiktoken`. In long chats, open the anchor list to index older messages for the estimate. Click the counter to cycle through compact, expanded, and collapsed views.
- **Aurora** adds ambient wallpaper and optional glass styling. Turn it on in the toolbar popup, then open **Aurora settings** to choose a built-in preset, enter an HTTPS image URL, or upload an image from your device. Set the glow theme or keep wallpaper on the ChatGPT home screen only. You can also use standard ChatGPT styling, skip Aurora's menu animations, and hide recognized upgrade buttons or model-limit notices. A recognized limit notice stays visible for five minutes before it is hidden.
- The Chrome toolbar popup lets you enable each tool independently and move the anchor rail to the left or right. It starts on the right. Chrome stores the preferences on your device.

## Build and load

From the repository root, run:

```bash
npm ci
npm run build
```

Open `chrome://extensions` and turn on **Developer mode**. Choose **Load unpacked** and select the folder containing `manifest.json`. To update a previously loaded copy from the same folder, use its **Reload** button. Then refresh any open ChatGPT tabs.

### Moving from Aurora for ChatGPT

Record any custom settings and keep the original file for any uploaded wallpaper. Chrome stores each extension's settings separately. Apply your settings in Chat Workbench, then remove the standalone Aurora extension and refresh ChatGPT. Aurora starts off in Chat Workbench so the two extensions can be switched over without both applying styles.

## Verify in Chrome

1. On `chrome://extensions`, check that the extension card reads **Chat Workbench** and `2.8.0`. Check for the Jump Brackets icon on the card and in the toolbar’s Extensions menu.
2. Open a ChatGPT conversation with several turns. Hover or focus a tick and confirm that the preview matches the turn. Click the tick or press Enter and confirm that the page jumps to that prompt.
3. Open the pin in a long chat and confirm the list includes the earliest and latest prompts. Check that the conversation returns to your reading position after indexing. Choose an offscreen turn. Repeat in a narrow window and after switching chats.
4. Type in the composer and confirm the token estimate updates. Scroll after the chat is fully indexed and confirm the estimate stays stable. Click the widget to cycle its three views.
5. In the Chrome toolbar popup, turn each tool off and on independently and switch the rail between **Left** and **Right**. Reload the page to check that the settings persist.
6. Turn on **Aurora** and choose **Blue** under **Aurora settings**. Disable **Show wallpaper in chats** and switch between the ChatGPT home screen and a chat. Turn Aurora off and check that the standard ChatGPT appearance returns while the anchor rail and token counter remain available.

Aurora styling is adapted from Aurora for ChatGPT by Jakub Michałek. See [LICENSE-AURORA](LICENSE-AURORA).
