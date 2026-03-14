# Chat Token Bottle (MV3)
Tall bottle + live token count for ChatGPT using the local `tiktoken` tokenizer.

## What it does

- Injects a floating token counter on `chatgpt.com` and `chat.openai.com`
- Counts conversation text plus the current prompt locally in the page
- Lets you click the widget to cycle compact, expanded, and collapsed views
- Includes a small extension popup so the extension has an active toolbar action

## Dev

```bash
npm ci
npm run build
```

Load this folder as an unpacked extension in `chrome://extensions`, then reload the extension and refresh your ChatGPT tab after any code change.
