/** Recording mode (`?rec=1`): hides dev-only chrome and reports sound cues to the capture script. */
export const REC = new URLSearchParams(location.search).has("rec");

export function reportSfx(name: string, arg?: unknown) {
  (window as { __sfx?: (name: string, arg?: unknown) => void }).__sfx?.(name, arg);
}
