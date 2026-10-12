"use client"

import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { useSyncExternalStore } from "react"

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

export function GeneralAnswerCard({ answer }: { answer: GeneralAnswer }) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)
  const asOf = new Date(answer.asOf)
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-xs text-muted-foreground">{answer.title}</p>
      <p className="text-xl font-semibold tabular-nums">{answer.value}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {answer.scope} · as of{" "}
        <time dateTime={answer.asOf}>
          {hydrated ? asOf.toLocaleString() : asOf.toISOString()}
        </time>
      </p>
      <p className="mt-2 text-sm">{answer.detail}</p>
    </div>
  )
}
