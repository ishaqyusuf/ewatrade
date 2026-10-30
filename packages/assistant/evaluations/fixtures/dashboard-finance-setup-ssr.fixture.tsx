import { expect, mock, test } from "bun:test"
import dynamic from "next/dist/shared/lib/app-dynamic"
import type { ReactNode } from "react"
import { type Control, useController } from "react-hook-form"

// Window-free server render. Actual FinanceWorkspace, its no-Book intro, the
// installed App loader, loadSheetCode, FinanceSetupForm, useZodForm/react-hook-form,
// useMutation, the URL hook and a real QueryClient run. Transport, unrelated
// Finance views and presentation primitives are inert.
const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname

const reads: string[] = []
const mutations: string[] = []
const toasts: string[] = []
function Leaf({ children }: { children?: ReactNode }) {
  return <div>{children}</div>
}
function ControlField({
  label,
  description,
  error,
  children,
}: {
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
  children?: ReactNode
}) {
  return (
    <div>
      <span>{label}</span>
      {children}
      {description ? <span>{description}</span> : null}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  )
}
function SubmitButton({
  children,
  disabled,
  type,
}: {
  children?: ReactNode
  disabled?: boolean
  type?: "button" | "submit"
}) {
  return (
    <button type={type} disabled={disabled}>
      {children}
    </button>
  )
}
// Date picker presentation only; the field stays bound to the actual form.
function FormDatePicker({
  control,
  max,
  name,
}: {
  control: Control<{ date: string }>
  max?: string
  name: "date"
}) {
  const { field } = useController({ control, name })
  return (
    <input
      type="date"
      name={field.name}
      value={field.value}
      max={max}
      readOnly
    />
  )
}
mock.module("next/dynamic", () => ({ default: dynamic }))
mock.module(app("components/sheets/sheet-frame"), () => ({
  SheetBodyLoading: () => <output aria-live="polite">Loading…</output>,
}))
mock.module("next/dist/client/components/error-boundary", () => ({
  ErrorBoundary: Leaf,
}))
mock.module("@ewatrade/ui", () => ({
  Button: Leaf,
  ControlField,
  FieldGroup: Leaf,
  FormActions: Leaf,
  SubmitButton,
  toast: {
    success: (message: string) => {
      toasts.push(message)
    },
  },
}))
mock.module(app("observability/sentry"), () => ({ captureDashboardError() {} }))
mock.module(app("components/forms/form-feedback"), () => ({
  FormFeedback: Leaf,
}))
mock.module(app("components/forms/form-controls"), () => ({ FormDatePicker }))
mock.module(app("trpc/client"), () => ({
  useTRPC: () => ({
    finance: {
      book: {
        queryOptions: () => ({
          queryKey: ["finance", "book"],
          queryFn: () => {
            reads.push("finance.book")
            throw Error("inert transport")
          },
        }),
      },
      setup: {
        mutationOptions: (options: object) => ({
          ...options,
          mutationKey: ["finance", "setup"],
          mutationFn: async () => {
            mutations.push("finance.setup")
            throw Error("inert transport")
          },
        }),
      },
    },
  }),
}))
for (const [path, name] of [
  ["components/dashboard/workspace-error", "WorkspaceError"],
  ["components/scrollable-content", "ScrollableContent"],
  ["components/tables/core", "TableToolbarSlotProvider"],
  ["components/tables/expenses/skeleton", "ExpenseTableSkeleton"],
  ["components/tables/expenses/data-table", "ExpenseDataTable"],
  [
    "components/tables/finance-bank-statements/skeleton",
    "FinanceBankStatementTableSkeleton",
  ],
  [
    "components/tables/finance-suppliers/data-table",
    "FinanceSupplierDataTable",
  ],
  [
    "components/tables/finance-suppliers/skeleton",
    "FinanceSupplierTableSkeleton",
  ],
  ["components/finance/bank-statements", "FinanceBankStatements"],
  ["components/finance/cash-count-history", "FinanceCashCountHistory"],
  ["components/finance/finance-accounts", "FinanceAccounts"],
  ["components/finance/finance-directory-view", "FinanceDirectoryView"],
  ["components/finance/finance-header", "FinanceHeader"],
  ["components/finance/finance-reports", "FinanceReports"],
] as const)
  mock.module(app(path), () => ({ [name]: Leaf, financeRowViewOptions: [] }))
mock.module(app("components/finance/finance-overview"), () => ({
  FinanceOverview: () => <output>finance-overview</output>,
}))

const { renderToReadableStream } = await import("react-dom/server")
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
)
const { NuqsTestingAdapter } = await import("nuqs/adapters/testing")
const { FinanceWorkspace } = await import(
  app("components/finance/finance-workspace")
)
const { todayIn } = await import(app("components/finance/review-changes"))

async function serverHtml(book: object | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(["finance", "book"], book)
  const errors: unknown[] = []
  const stream = await renderToReadableStream(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter>
        <FinanceWorkspace view="overview" initialViewSettings={{}} />
      </NuqsTestingAdapter>
    </QueryClientProvider>,
    {
      onError: (error) => {
        errors.push(error)
      },
    },
  )
  await stream.allReady
  return {
    errors,
    html: await new Response(stream).text(),
    cachedMutations: client.getMutationCache().getAll().length,
  }
}

test("no-Book Finance server render streams its intro and the actual setup form", async () => {
  expect(typeof window).toBe("undefined")
  expect(typeof document).toBe("undefined")
  const { errors, html, cachedMutations } = await serverHtml(null)
  expect(errors).toEqual([])
  expect(html).toContain("Start tracking your business money")
  expect(html).toContain("Older sales and payments")
  expect(html).toContain("<form")
  expect(html).toContain("Start date")
  expect(html).toContain('name="date"')
  expect(html).toContain(`value="${todayIn().slice(0, 8)}01"`)
  expect(html).toContain("Set up finance")
  expect(html).not.toContain("Couldn’t open this panel.")
  expect(reads).toEqual([])
  expect(mutations).toEqual([])
  expect(cachedMutations).toBe(0)
  expect(toasts).toEqual([])
})

test("a Book keeps setup markup out of the server render", async () => {
  const { errors, html } = await serverHtml({ id: "book-inert" })
  expect(errors).toEqual([])
  expect(html).toContain("finance-overview")
  expect(html).not.toContain("Start tracking your business money")
  expect(html).not.toContain("Set up finance")
  expect(reads).toEqual([])
  expect(mutations).toEqual([])
})
