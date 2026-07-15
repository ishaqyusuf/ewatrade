"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
} from "@ewatrade/ui"
import { useMemo, useState } from "react"

type DetectionCandidate = {
  confidence: number
  distanceMeters: number
  radiusMeters: number
  store: {
    id: string
    name: string
    slug: string
  }
  tenant: {
    id: string
    name: string
    slug: string
  }
}

type DetectionResult = {
  candidates: DetectionCandidate[]
  match: DetectionCandidate | null
  status: "confirmed" | "manual_required" | "needs_confirmation"
}

type FlowState =
  | { status: "idle" }
  | { status: "locating" }
  | { message: string; status: "error" }
  | { result: DetectionResult; selectedStoreId?: string; status: "resolved" }
  | { status: "manual"; storeCode: string }
  | {
      candidate: DetectionCandidate | { store: { name: string } }
      status: "ready"
    }

function getApiUrl() {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://localhost:3095"
  )
}

function confidenceLabel(confidence: number) {
  return `${Math.round(confidence * 100)}% match`
}

export function SelfServiceStoreDetection() {
  const [state, setState] = useState<FlowState>({ status: "idle" })
  const selectedCandidate = useMemo(() => {
    if (state.status !== "resolved") return null

    return (
      state.result.candidates.find(
        (candidate) => candidate.store.id === state.selectedStoreId,
      ) ??
      state.result.match ??
      state.result.candidates[0] ??
      null
    )
  }, [state])

  function resolveCurrentStore() {
    if (!("geolocation" in navigator)) {
      setState({ status: "manual", storeCode: "" })
      return
    }

    setState({ status: "locating" })

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/self-service/store-detection/resolve`,
            {
              body: JSON.stringify({
                accuracyMeters: position.coords.accuracy,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                maxCandidates: 5,
              }),
              headers: {
                "content-type": "application/json",
              },
              method: "POST",
            },
          )

          if (!response.ok) {
            throw new Error("Store detection is unavailable right now.")
          }

          const result = (await response.json()) as DetectionResult

          if (result.status === "manual_required") {
            setState({ status: "manual", storeCode: "" })
            return
          }

          setState({
            result,
            selectedStoreId: result.match?.store.id,
            status: "resolved",
          })
        } catch (error) {
          setState({
            message:
              error instanceof Error
                ? error.message
                : "Store detection is unavailable right now.",
            status: "error",
          })
        }
      },
      () => {
        setState({ status: "manual", storeCode: "" })
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    )
  }

  function confirmSelection() {
    if (!selectedCandidate) return
    setState({ candidate: selectedCandidate, status: "ready" })
  }

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-background p-5 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Self-service launch</Badge>
          {state.status === "locating" ? (
            <Badge variant="outline">Locating</Badge>
          ) : null}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Choose the store before scanning.
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Use location to find the nearest enabled branch, then confirm it
          before checkout starts. If the match is uncertain, enter the store
          code at the counter.
        </p>
      </div>

      {state.status === "idle" || state.status === "locating" ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            disabled={state.status === "locating"}
            onClick={resolveCurrentStore}
          >
            {state.status === "locating"
              ? "Finding store..."
              : "Use my location"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setState({ status: "manual", storeCode: "" })}
          >
            Enter store code
          </Button>
        </div>
      ) : null}

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Detection failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "resolved" ? (
        <div className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>
              {state.result.status === "confirmed"
                ? "Likely store found"
                : "Confirm the store"}
            </AlertTitle>
            <AlertDescription>
              We still need your confirmation before using this store for
              checkout.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {state.result.candidates.map((candidate) => (
              <label
                className="flex cursor-pointer items-start gap-3 p-4"
                key={candidate.store.id}
              >
                <input
                  checked={selectedCandidate?.store.id === candidate.store.id}
                  className="mt-1"
                  name="detected-store"
                  onChange={() =>
                    setState({
                      ...state,
                      selectedStoreId: candidate.store.id,
                    })
                  }
                  type="radio"
                />
                <span className="flex flex-1 flex-col gap-1">
                  <span className="font-medium">{candidate.store.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {candidate.tenant.name} - {candidate.distanceMeters}m away -{" "}
                    {confidenceLabel(candidate.confidence)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button disabled={!selectedCandidate} onClick={confirmSelection}>
              Confirm store
            </Button>
            <Button
              variant="outline"
              onClick={() => setState({ status: "manual", storeCode: "" })}
            >
              Use store code instead
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === "manual" ? (
        <div className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>Manual fallback</AlertTitle>
            <AlertDescription>
              Ask staff for the branch code or scan the posted code near
              checkout.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="store-code">
              Store code
            </label>
            <input
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
              id="store-code"
              onChange={(event) =>
                setState({ status: "manual", storeCode: event.target.value })
              }
              placeholder="Example: MAIN"
              value={state.storeCode}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              disabled={!state.storeCode.trim()}
              onClick={() =>
                setState({
                  candidate: {
                    store: {
                      name: state.storeCode.trim().toUpperCase(),
                    },
                  },
                  status: "ready",
                })
              }
            >
              Continue
            </Button>
            <Button variant="outline" onClick={resolveCurrentStore}>
              Try location again
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <Alert>
          <AlertTitle>Store selected</AlertTitle>
          <AlertDescription>
            {state.candidate.store.name} is ready for the self-service checkout
            session.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  )
}
