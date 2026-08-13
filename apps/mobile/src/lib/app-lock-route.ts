export function isCustomerShellPath(segments: readonly string[]) {
  return segments[0] === "(customer)" || segments[0] === "r"
}
