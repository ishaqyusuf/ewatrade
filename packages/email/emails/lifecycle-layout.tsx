import { LifecycleLayout } from "../components/lifecycle-layout"
import { lifecycleLayoutFixture } from "../src/preview-fixtures"

/** Shared lifecycle layout (W1). Play templates 21+ reuse it. */
export default function Preview() {
  return <LifecycleLayout {...lifecycleLayoutFixture} />
}
