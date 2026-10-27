import { GENERAL_PROMPT_VERSION } from "@ewatrade/assistant/general/prompt"
import { PRODUCT_ASSISTANT_PROMPT_VERSION } from "@ewatrade/assistant/product/contracts"
import { SETUP_ASSISTANT_PROMPT_VERSION } from "@ewatrade/assistant/setup/contracts"
/** Counts only. This record intentionally has no merchant text, names, identities,
 * credentials or proof fields. Existing run records own model/timeout failures.
 */
export function commercePreparationEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment.ASSISTANT_COMMERCE_PREPARATION_ENABLED !== "false"
}
export type PreparationObservation = {
  kind: "product" | "order" | "service"
  purpose?: "general" | "setup" | "product"
  durationMs: number
  lineCount: number
  unresolvedCount: number
  missingCount?: number
  defaultCount?: number
  derivedPriceCount?: number
  correction?: boolean
  phase?: "preparation" | "first_draft"
}
const bounded = (value: number | undefined, max = 1000) =>
  Number.isFinite(value)
    ? Math.max(0, Math.min(Math.round(value ?? 0), max))
    : 0
export function preparationObservation(value: PreparationObservation) {
  return {
    event: "commerce_preparation",
    version: "commerce-preparation-v1",
    taxonomyVersion: "2026-08",
    kind: value.kind,
    purpose: value.purpose ?? "general",
    promptVersion:
      value.purpose === "setup"
        ? SETUP_ASSISTANT_PROMPT_VERSION
        : value.purpose === "product"
          ? PRODUCT_ASSISTANT_PROMPT_VERSION
          : GENERAL_PROMPT_VERSION,
    durationMs: bounded(value.durationMs, 120000),
    lineCount: bounded(value.lineCount),
    unresolvedCount: bounded(value.unresolvedCount),
    missingCount: bounded(value.missingCount),
    defaultCount: bounded(value.defaultCount),
    derivedPriceCount: bounded(value.derivedPriceCount),
    correction: value.correction === true,
    phase: value.phase === "first_draft" ? "first_draft" : "preparation",
  }
}
export function recordPreparation(value: PreparationObservation) {
  try {
    console.info("[assistant-preparation]", preparationObservation(value))
  } catch {
    /* Diagnostic failure never changes draft behavior. */
  }
}
