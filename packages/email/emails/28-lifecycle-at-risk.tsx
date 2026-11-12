import { LifecycleLayout } from "../components/lifecycle-layout"
import { lifecycleAdoptionPreviews } from "../src/lifecycle-adoption-fixtures"
import { LIFECYCLE_ADOPTION_TEMPLATES } from "../templates/lifecycle-adoption"

const key = "lifecycle-at-risk"

export default function LifecycleAtRiskPreview() {
  const { content } = LIFECYCLE_ADOPTION_TEMPLATES[key](
    lifecycleAdoptionPreviews[key],
  )
  return <LifecycleLayout {...content} />
}
