import {
  AURORA_WALLPAPER_KEY,
  DEFAULT_PREFERENCES,
  MAX_WALLPAPER_BYTES,
  WALLPAPER_TYPES,
  normalizePreference,
  normalizeWallpaper,
} from "./preferences.js";

const inputs = new Map(
  Object.keys(DEFAULT_PREFERENCES).map((key) => [key, document.getElementById(key)]),
);
const status = document.getElementById("settings-status");
const stored = {};
const wallpaperControls = document.getElementById("wallpaper-controls");
const wallpaperStatus = document.getElementById("wallpaper-status");
const preset = document.getElementById("auroraPreset");
const urlInput = document.getElementById("wallpaper-url");
const fileInput = document.getElementById("wallpaper-file");
let storedWallpaper;

function reflectWallpaper(value) {
  storedWallpaper = normalizeWallpaper(value);
  preset.value = storedWallpaper.type;
  urlInput.value = storedWallpaper.type === "url" ? storedWallpaper.value : "";
}

async function saveWallpaper(nextWallpaper) {
  wallpaperControls.disabled = true;
  wallpaperStatus.textContent = "";
  try {
    await chrome.storage.local.set({ [AURORA_WALLPAPER_KEY]: await nextWallpaper() });
  } catch (error) {
    reflectWallpaper(storedWallpaper);
    wallpaperStatus.textContent = "Couldn’t save the wallpaper. Check the source and try again.";
    console.error("Chat Workbench could not save the wallpaper", error);
  } finally {
    fileInput.value = "";
    wallpaperControls.disabled = false;
  }
}

function controlProperty(key) {
  return typeof DEFAULT_PREFERENCES[key] === "boolean" ? "checked" : "value";
}

function reflectPreference(key, value) {
  const normalized = normalizePreference(key, value);
  stored[key] = normalized;
  inputs.get(key)[controlProperty(key)] = normalized;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (Object.hasOwn(changes, AURORA_WALLPAPER_KEY)) {
    reflectWallpaper(changes[AURORA_WALLPAPER_KEY].newValue);
  }
  for (const key of inputs.keys()) {
    if (Object.hasOwn(changes, key)) reflectPreference(key, changes[key].newValue);
  }
});

try {
  const preferences = await chrome.storage.local.get({ ...DEFAULT_PREFERENCES, [AURORA_WALLPAPER_KEY]: null });
  for (const [key, input] of inputs) {
    reflectPreference(key, stored[key] ?? preferences[key]);
    input.disabled = false;
    const property = controlProperty(key);
    let pending;
    input.addEventListener("change", async () => {
      if (pending !== undefined) {
        input[property] = pending;
        return;
      }
      pending = normalizePreference(key, input[property]);
      status.textContent = "";
      try {
        await chrome.storage.local.set({ [key]: pending });
      } catch (error) {
        input[property] = stored[key];
        status.textContent = "Couldn’t save the setting. Try again.";
        console.error("Chat Workbench could not save a setting", error);
      } finally {
        pending = undefined;
      }
    });
  }
  reflectWallpaper(storedWallpaper ?? preferences[AURORA_WALLPAPER_KEY]);
  wallpaperControls.disabled = false;

  preset.addEventListener("change", () => saveWallpaper(() => ({ type: preset.value })));
  document.getElementById("reset-wallpaper").addEventListener("click", () =>
    saveWallpaper(() => ({ type: "aurora" })));

  document.getElementById("wallpaper-url-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const wallpaper = normalizeWallpaper({ type: "url", value: urlInput.value.trim() });
    if (wallpaper.type !== "url") {
      wallpaperStatus.textContent = "Enter an HTTPS image URL without embedded credentials.";
      return;
    }
    saveWallpaper(async () => {
      const image = new Image();
      image.referrerPolicy = "no-referrer";
      image.src = wallpaper.value;
      await image.decode();
      return wallpaper;
    });
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!WALLPAPER_TYPES.includes(file.type) || file.size > MAX_WALLPAPER_BYTES) {
      wallpaperStatus.textContent = "Choose a PNG, JPEG, WebP, AVIF, or GIF up to 4 MB.";
      fileInput.value = "";
      return;
    }
    saveWallpaper(async () => {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      const value = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      return { type: "upload", value };
    });
  });
} catch (error) {
  status.textContent = "Couldn’t load settings. Reopen this popup to try again.";
  console.error("Chat Workbench could not load settings", error);
}
