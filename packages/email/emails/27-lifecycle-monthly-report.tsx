import { LifecycleLayout } from "../components/lifecycle-layout"
import { lifecycleAdoptionPreviews } from "../src/lifecycle-adoption-fixtures"
import { LIFECYCLE_ADOPTION_TEMPLATES } from "../templates/lifecycle-adoption"

const key = "lifecycle-monthly-report"

export default function LifecycleMonthlyReportPreview() {
  const { content } = LIFECYCLE_ADOPTION_TEMPLATES[key](
    lifecycleAdoptionPreviews[key],
  )
  return <LifecycleLayout {...content} />
}
