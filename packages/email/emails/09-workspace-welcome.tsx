import { workspaceWelcome } from "../src/preview-fixtures"
import { WorkspaceWelcomeEmail } from "../templates/workspace-welcome"

export default function Preview() {
  return <WorkspaceWelcomeEmail input={workspaceWelcome} />
}
