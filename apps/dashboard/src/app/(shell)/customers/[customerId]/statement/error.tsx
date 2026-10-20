"use client"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
export default function StatementError({ reset }: { reset: () => void }) {
  return (
    <Alert appearance="dashboard" variant="destructive">
      <AlertDescription>
        Customer statement could not be loaded.
      </AlertDescription>
      <Button onClick={reset}>Try again</Button>
    </Alert>
  )
}
