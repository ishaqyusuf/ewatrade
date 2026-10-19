"use client"

import {
  type AttachmentAccess,
  attachmentScope,
  checkAttachmentAccess,
} from "@/lib/attachment-access"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export function useAttachmentAccess(resourceId: string) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const router = useRouter()
  const current = useQuery(trpc.tenant.current.queryOptions())
  const generation = useRef(getDataCacheGeneration())
  const latest = useRef({ resourceId, generation: 0 })
  if (latest.current.resourceId !== resourceId) {
    latest.current = { resourceId, generation: latest.current.generation + 1 }
  }
  const resourceGeneration = latest.current.generation
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [explanation, setExplanation] = useState<
    | (AttachmentAccess & {
        active: () => boolean
        check: () => Promise<AttachmentAccess>
      })
    | null
  >(null)
  const [checking, setChecking] = useState(false)
  const scope = attachmentScope(current.data)
  const active = () =>
    mounted.current &&
    latest.current.resourceId === resourceId &&
    latest.current.generation === resourceGeneration &&
    generation.current === getDataCacheGeneration()
  const check = () =>
    checkAttachmentAccess({
      read: () => client.tenant.current.query(),
      scope,
      active,
    })
  async function allow() {
    const result = await check()
    if (result.status === "stale") return false
    if (result.status !== "allowed") {
      if (active()) setExplanation({ ...result, active, check })
      return false
    }
    return true
  }
  const knownFree = current.data?.tenant.retailOpsPlanId === "free"
  const dialog = (
    <Dialog
      open={Boolean(explanation?.active())}
      onOpenChange={(open) => {
        if (!open) setExplanation(null)
      }}
    >
      <DialogContent className="grid max-w-md gap-5 p-6 text-foreground max-md:content-start">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg font-semibold">
            {explanation?.status === "free"
              ? "Attachments need a different plan"
              : "Attachments are unavailable"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {explanation?.status === "free"
              ? "Photos, videos, documents and private evidence are not included on Free. You can still add text notes and view existing history."
              : "We couldn't confirm attachment access. Try again when your business and plan are available. Your text notes and existing history are still available."}
          </DialogDescription>
        </DialogHeader>
        {explanation?.status === "free" && !explanation.canReviewPlan ? (
          <p className="text-sm">Ask your owner to review the business plan.</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setExplanation(null)}>
            Close
          </Button>
          {explanation?.canReviewPlan ? (
            <Button
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  if (!explanation?.active()) return
                  const result = await explanation.check()
                  if (
                    result.status !== "stale" &&
                    result.status !== "unknown" &&
                    result.canReviewPlan
                  ) {
                    setExplanation(null)
                    router.push("/settings/billing")
                  } else if (explanation.active())
                    setExplanation(
                      result.status === "stale"
                        ? null
                        : {
                            ...result,
                            active: explanation.active,
                            check: explanation.check,
                          },
                    )
                } finally {
                  if (active()) setChecking(false)
                }
              }}
            >
              View plan
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return { allow, knownFree, dialog }
}
