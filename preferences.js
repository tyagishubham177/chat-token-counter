export const DEFAULT_PREFERENCES = Object.freeze({
  anchorsEnabled: true,
  counterEnabled: true,
  anchorSide: "right",
});

export function normalizePreference(key, value) {
  if (key === "anchorSide") return value === "left" ? "left" : "right";
  return typeof value === "boolean" ? value : DEFAULT_PREFERENCES[key];
}
