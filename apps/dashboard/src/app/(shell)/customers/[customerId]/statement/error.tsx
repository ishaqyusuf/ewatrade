"use client"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import Link from "next/link"
export default function StatementError({ reset }: { reset: () => void }) {
  return (
    <Alert appearance="dashboard" variant="destructive">
      <AlertDescription>
        Couldn’t load this statement. Check your connection and try again.
      </AlertDescription>
      <Button onClick={reset}>Try again</Button>
      <Button variant="outline" render={<Link href="/customers" />}>
        Back to Customers
      </Button>
    </Alert>
  )
}
