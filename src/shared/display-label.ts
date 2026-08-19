/** Tray / UI label for a physical display. */
export function formatDisplayLabel(
  input: { label?: string; width: number; height: number; primary?: boolean },
  index: number,
): string {
  const name = (input.label ?? '').trim() || `Display ${index + 1}`
  const size = `${input.width}x${input.height}`
  return input.primary ? `${name} — ${size} (primary)` : `${name} — ${size}`
}
