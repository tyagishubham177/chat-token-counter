export const DEFAULT_PREFERENCES = Object.freeze({
  anchorsEnabled: true,
  counterEnabled: true,
  anchorSide: "right",
  auroraEnabled: false,
  auroraShowInChats: true,
  auroraTheme: "auto",
  auroraStandardStyle: false,
  auroraDisableAnimations: false,
  auroraHideUpgrade: false,
  auroraHideLimit: false,
});

export function normalizePreference(key, value) {
  if (key === "anchorSide") return value === "left" ? "left" : "right";
  if (key === "auroraTheme") return value === "light" || value === "dark" ? value : "auto";
  return typeof value === "boolean" ? value : DEFAULT_PREFERENCES[key];
}

export const AURORA_WALLPAPER_KEY = "auroraWallpaper";
export const MAX_WALLPAPER_BYTES = 4 * 1024 * 1024;
export const WALLPAPER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];

export function normalizeWallpaper(wallpaper) {
  const { type, value } = wallpaper ?? {};
  if (type === "blue") return { type };
  if (type === "url" && typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password) {
        return { type, value: url.href };
      }
    } catch {
      // A malformed URL is not a saved wallpaper.
    }
  }
  if (type === "upload" && typeof value === "string" &&
      value.length <= Math.ceil(MAX_WALLPAPER_BYTES / 3) * 4 + 32 &&
      WALLPAPER_TYPES.some((mime) => value.startsWith("data:" + mime + ";base64,"))) {
    return { type, value };
  }
  return { type: "aurora" };
}
