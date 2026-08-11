import { timingSafeEqual } from "node:crypto"

type CanPreviewMarketingExperienceOptions = {
  configuredToken?: string
  nodeEnvironment?: string
  providedToken?: string
}

export function canPreviewMarketingExperience({
  configuredToken = process.env.MARKETING_EXPERIENCE_PREVIEW_TOKEN,
  nodeEnvironment = process.env.NODE_ENV,
  providedToken,
}: CanPreviewMarketingExperienceOptions): boolean {
  if (nodeEnvironment !== "production") {
    return true
  }

  if (!configuredToken || !providedToken) {
    return false
  }

  const configuredBuffer = Buffer.from(configuredToken)
  const providedBuffer = Buffer.from(providedToken)

  return (
    configuredBuffer.length === providedBuffer.length &&
    timingSafeEqual(configuredBuffer, providedBuffer)
  )
}
