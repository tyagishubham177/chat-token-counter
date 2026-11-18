import { DEFAULT_PREFERENCES } from "./preferences.js";

const inputs = new Map(
  Object.keys(DEFAULT_PREFERENCES).map((key) => [key, document.getElementById(key)]),
);
const status = document.getElementById("settings-status");
const stored = {};

function reflectPreference(key, value) {
  const enabled = typeof value === "boolean" ? value : DEFAULT_PREFERENCES[key];
  stored[key] = enabled;
  inputs.get(key).checked = enabled;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const key of inputs.keys()) {
    if (Object.hasOwn(changes, key)) reflectPreference(key, changes[key].newValue);
  }
});

try {
  const preferences = await chrome.storage.local.get(DEFAULT_PREFERENCES);
  for (const [key, input] of inputs) {
    reflectPreference(key, stored[key] ?? preferences[key]);
    input.disabled = false;
    let pending;
    input.addEventListener("change", async () => {
      if (pending !== undefined) {
        input.checked = pending;
        return;
      }
      pending = input.checked;
      status.textContent = "";
      try {
        await chrome.storage.local.set({ [key]: pending });
      } catch (error) {
        input.checked = stored[key];
        status.textContent = "Couldn’t save the setting. Try again.";
        console.error("Chat Workbench could not save a setting", error);
      } finally {
        pending = undefined;
      }
    });
  }
} catch (error) {
  status.textContent = "Couldn’t load settings. Reopen this popup to try again.";
  console.error("Chat Workbench could not load settings", error);
}
