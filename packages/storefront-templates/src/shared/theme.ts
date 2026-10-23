import type { CSSProperties } from "react"
import type { StorefrontComposition } from "../../../storefront-contracts/src/manifest"

export function editorialTheme(
  composition: StorefrontComposition,
): CSSProperties & Record<string, string> {
  return {
    ...(composition.theme.accent !== "#171717"
      ? { "--tf-ink": composition.theme.accent }
      : {}),
    ...(composition.theme.background !== "#ffffff"
      ? { "--tf-paper": composition.theme.background }
      : {}),
    ...(composition.theme.font === "serif"
      ? { "--tf-body-font": "Georgia, serif" }
      : {}),
    "--tf-radius":
      composition.theme.radius === "rounded"
        ? "12px"
        : composition.theme.radius === "none"
          ? "0px"
          : "4px",
  }
}
