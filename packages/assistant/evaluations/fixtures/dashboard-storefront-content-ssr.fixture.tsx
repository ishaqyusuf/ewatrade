import { expect, mock, test } from "bun:test"
import {
  canvasManifest,
  defaultComposition,
} from "@ewatrade/storefront-templates"
import dynamic from "next/dist/shared/lib/app-dynamic"
import type { ReactNode } from "react"

// Window-free server render. The actual Studio content owner, installed App
// loader, loadSheetCode, generator body, useStorefrontContent, useZodForm/
// react-hook-form, URL hook and a real QueryClient run. Transport, panel
// presentation children and UI primitives are inert.
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname

const reads: string[] = []
const commands: string[] = []
function Leaf({ children }: { children?: ReactNode }) {
  return <div>{children}</div>
}
function Button({
  children,
  disabled,
}: { children?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  )
}
function Sheet({ open, children }: { open: boolean; children?: ReactNode }) {
  return open ? <>{children}</> : null
}
function SheetFrame({
  title,
  description,
  header,
  footer,
  children,
}: {
  title: string
  description?: string
  header?: ReactNode
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {header}
      {children}
      {footer}
    </section>
  )
}
function StorefrontContentWrite({
  controller,
}: { controller: { fields: unknown[] } }) {
  return <output>write-panel {controller.fields.length}</output>
}
mock.module("next/dynamic", () => ({ default: dynamic }))
mock.module("@ewatrade/ui", () => ({
  Button,
  Sheet,
  Skeleton: () => <div />,
}))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
mock.module(app("components/sheets/sheet-frame"), () => ({
  SheetBodyLoading: () => <output aria-live="polite">Loading…</output>,
  SheetFrame,
}))
mock.module(app("components/forms/form-feedback"), () => ({
  FormFeedback: Leaf,
}))
mock.module(app("components/storefront/storefront-content.css"), () => ({}))
mock.module(app("components/storefront/storefront-content-write"), () => ({
  StorefrontContentWrite,
}))
mock.module(app("components/storefront/storefront-content-review"), () => ({
  StorefrontContentReview: () => null,
}))
mock.module(app("components/storefront/storefront-content-context"), () => ({
  StorefrontContentContextForm: () => null,
  StorefrontContentGuidance: () => null,
}))
const inert = (name: string) => () => {
  reads.push(name)
  throw Error("inert transport")
}
mock.module(app("trpc/client"), () => ({
  getDataCacheGeneration: () => 0,
  useTRPC: () => ({
    storefront: {
      contentContext: {
        queryOptions: (input: object, options: object) => ({
          ...options,
          queryKey: ["storefront", "contentContext", input],
          queryFn: inert("storefront.contentContext"),
        }),
      },
      contentGeneration: {
        queryOptions: (input: object, options: object) => ({
          ...options,
          queryKey: ["storefront", "contentGeneration", input],
          queryFn: inert("storefront.contentGeneration"),
        }),
      },
      cancelContentGeneration: {
        mutationOptions: () => ({
          mutationKey: ["storefront", "cancelContentGeneration"],
          mutationFn: async () => {
            commands.push("storefront.cancelContentGeneration")
            throw Error("inert transport")
          },
        }),
      },
    },
  }),
  useTRPCClient: () => ({
    storefront: {
      generateContent: {
        mutate: async () => {
          commands.push("storefront.generateContent")
          throw Error("inert transport")
        },
      },
    },
  }),
}))

const { renderToReadableStream } = await import("react-dom/server")
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
)
const { NuqsTestingAdapter } = await import("nuqs/adapters/testing")
const { StorefrontContentSheet } = await import(
  app("components/storefront/storefront-content-sheet")
)
const composition = defaultComposition(canvasManifest("catalog-v4"))

async function serverHtml(searchParams: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(
    ["storefront", "contentContext", { expectedSiteId: "site-inert" }],
    {
      context: {
        name: "Inert shop",
        description: "Inert description",
        location: "",
        offerings: "",
      },
      revision: 3,
      available: true,
      unavailableReason: null,
      runs: [],
    },
  )
  const errors: unknown[] = []
  const stream = await renderToReadableStream(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter searchParams={searchParams}>
        <StorefrontContentSheet
          siteId="site-inert"
          revision={3}
          composition={composition}
          pageKey="home"
          sectionId=""
          blocked={false}
          onApply={() => {
            commands.push("apply")
            return false
          }}
        />
      </NuqsTestingAdapter>
    </QueryClientProvider>,
    {
      onError: (error) => {
        errors.push(error)
      },
    },
  )
  await stream.allReady
  return { errors, html: await new Response(stream).text() }
}

test("a direct content URL server-renders the actual generator body without reads or commands", async () => {
  expect(typeof window).toBe("undefined")
  expect(typeof document).toBe("undefined")
  const { errors, html } = await serverHtml("?content=write")
  expect(errors).toEqual([])
  expect(html).toContain("Generate content")
  expect(html).toContain("Draft rev 3")
  expect(html).toContain("Business context")
  expect(html).toContain("write-panel")
  expect(html).toContain("Generate draft")
  expect(html).not.toContain("Couldn’t open this panel.")
  expect(reads).toEqual([])
  expect(commands).toEqual([])
})

test("a closed Studio URL renders no generator markup", async () => {
  const { errors, html } = await serverHtml("")
  expect(errors).toEqual([])
  expect(html).not.toContain("Generate content")
  expect(reads).toEqual([])
  expect(commands).toEqual([])
})
