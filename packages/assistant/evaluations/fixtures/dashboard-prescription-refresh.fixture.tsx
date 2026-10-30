import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  InfiniteQueryObserver,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { FormProvider, useForm } from "react-hook-form"

const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
mock.module("@ewatrade/ui", () =>
  Object.fromEntries(
    [
      "Badge",
      "Button",
      "Checkbox",
      "CheckboxField",
      "ControlField",
      "FieldGroup",
      "FormActions",
      "Input",
      "MoneyInput",
      "SelectControl",
      "SubmitButton",
      "Textarea",
    ].map((name) => [name, leaf]),
  ),
)
mock.module(app("components/forms/form-feedback"), () => ({
  FormFeedback: leaf,
}))
mock.module(app("components/forms/form-controls"), () => ({
  FormCheckboxControl: leaf,
  FormSelectControl: leaf,
}))
mock.module(app("components/prescriptions/prescription-media-viewer"), () => ({
  PrescriptionMediaViewer: leaf,
}))
mock.module(app("components/prescriptions/prescription-sheet-header"), () => ({
  PrescriptionSheetHeader: leaf,
}))
let selected: unknown
mock.module(app("hooks/use-prescription-params"), () => ({
  usePrescriptionParams: () => ({
    setParams: (value: unknown) => {
      selected = value
    },
  }),
}))
const calls: Array<{ path: string; input: unknown }> = []
const handlers = new Map<string, (...args: unknown[]) => unknown>()
let client: QueryClient
const page = {
  data: [
    {
      id: "new-request",
      reference: "RX001",
      createdAt: new Date(),
      updatedAt: new Date(),
      fulfilmentPreference: "pickup",
      source: "staff_walk_in",
      status: "received",
    },
  ],
  meta: { cursor: null, hasNextPage: false, hasPreviousPage: false },
}
const rpc = createTRPCClient<AppRouter>({
  links: [
    () =>
      ({ op }) =>
        observable((observer) => {
          if (op.type !== "query" || op.path !== "prescriptions.queue")
            throw Error("Only inert queue reads are allowed")
          calls.push({ path: op.path, input: op.input })
          observer.next({ result: { data: page } })
          observer.complete()
        }),
  ],
})
let trpc = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: () => client,
})
// Capture the callbacks supplied by the actual components; keep real tRPC keys,
// options, query observers and invalidation. No mutation is submitted.
mock.module(app("trpc/client"), () => ({
  useTRPC: () =>
    new Proxy(trpc, {
      get(root, property) {
        if (property !== "prescriptions") return Reflect.get(root, property)
        return new Proxy(root.prescriptions, {
          get(group, name) {
            const endpoint = Reflect.get(group, name)
            return new Proxy(endpoint, {
              get(target, method) {
                if (method !== "mutationOptions")
                  return Reflect.get(target, method)
                return (...args: unknown[]) => {
                  const options = Reflect.apply(
                    Reflect.get(target, method),
                    target,
                    args,
                  )
                  if (
                    options &&
                    typeof options === "object" &&
                    "onSuccess" in options
                  ) {
                    const handler = options.onSuccess
                    if (typeof handler === "function")
                      handlers.set(String(name), (...values) =>
                        Reflect.apply(handler, undefined, values),
                      )
                  }
                  return options
                }
              },
            })
          },
        })
      },
    }),
}))
const { PrescriptionIntakeForm } = await import(
  "../../../../apps/dashboard/src/components/prescriptions/prescription-intake-form"
)
const { PrescriptionRequestWorkspace } = await import(
  "../../../../apps/dashboard/src/components/prescriptions/prescription-request-workspace"
)
function Form({ children }: { children: ReactNode }) {
  const form = useForm({
    defaultValues: {
      clearerReason: "",
      lineMapping: {},
      prices: {},
      revisionText: "",
      verifiedText: {},
    },
  })
  return <FormProvider {...form}>{children}</FormProvider>
}
beforeEach(() => {
  calls.length = 0
  handlers.clear()
  selected = undefined
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  trpc = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: () => client,
  })
})
afterEach(() => client.clear())

for (const action of [
  "staffIntake",
  "startTranscription",
  "requestClearerMedia",
  "verifyLine",
  "reviseTranscription",
  "submitForPharmacistReview",
  "pharmacistReview",
  "issueQuote",
]) {
  test(`actual ${action} success refreshes every active infinite queue variant once`, async () => {
    renderToString(
      <QueryClientProvider client={client}>
        <Form>
          {action === "staffIntake" ? (
            <PrescriptionIntakeForm storeId="selected-store" />
          ) : (
            <PrescriptionRequestWorkspace
              storeId="selected-store"
              requestId="request"
              mode="media-review"
            />
          )}
        </Form>
      </QueryClientProvider>,
    )
    expect(calls).toEqual([])
    const inputs = [
      { storeId: "selected-store", pageSize: 25 },
      { storeId: "selected-store", pageSize: 25, q: "retained-filter" },
    ]
    const previous = {
      pages: [
        {
          data: [],
          meta: { cursor: null, hasNextPage: false, hasPreviousPage: false },
        },
      ],
      pageParams: [null],
    }
    for (const input of inputs)
      client.setQueryData(
        trpc.prescriptions.queue.infiniteQueryKey(input),
        previous,
      )
    const inactive = trpc.prescriptions.queue.infiniteQueryKey({
      storeId: "other-store",
      pageSize: 25,
    })
    client.setQueryData(inactive, previous)
    const unrelated = ["unrelated"]
    client.setQueryData(unrelated, "retained")
    const observers = inputs.map(
      (input) =>
        new InfiniteQueryObserver(
          client,
          trpc.prescriptions.queue.infiniteQueryOptions(input, {
            getNextPageParam: (result) => result.meta.cursor ?? undefined,
            staleTime: Number.POSITIVE_INFINITY,
            retry: false,
          }),
        ),
    )
    const stops = observers.map((observer) => observer.subscribe(() => {}))
    try {
      const success = handlers.get(action)
      if (!success) throw Error("Missing actual component success callback")
      await success({ requestId: "new-request" })
      expect(calls).toEqual(
        inputs.map((input) => ({
          path: "prescriptions.queue",
          input: { ...input, direction: "forward" },
        })),
      )
      for (const observer of observers)
        expect(observer.getCurrentResult().data?.pages[0]?.data[0]?.id).toBe(
          "new-request",
        )
      expect(client.getQueryState(inactive)?.isInvalidated).toBe(true)
      expect(client.getQueryData(inactive)).toEqual(previous)
      expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false)
      expect(client.getQueryData(unrelated)).toBe("retained")
      expect(selected).toEqual(
        action === "staffIntake"
          ? { prescriptionId: "new-request", prescriptionSheet: "success" }
          : undefined,
      )
    } finally {
      for (const stop of stops) stop()
    }
  })
}
