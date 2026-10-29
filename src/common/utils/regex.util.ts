/**
 * Escapes user input before interpolation into a RegExp / Mongo `$regex`.
 * Prevents regex injection (e.g. `a|x@evil.com` matching other users) and ReDoS.
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
