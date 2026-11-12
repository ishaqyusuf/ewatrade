import { LifecycleLayout } from "../components/lifecycle-layout"
import { lifecycleRevenuePreviews } from "../src/lifecycle-revenue-fixtures"
import { LIFECYCLE_REVENUE_TEMPLATES } from "../templates/lifecycle-revenue"

const key = "lifecycle-second-business"

export default function LifecycleSecondBusinessPreview() {
  const { content } = LIFECYCLE_REVENUE_TEMPLATES[key](
    lifecycleRevenuePreviews[key],
  )
  return <LifecycleLayout {...content} />
}
