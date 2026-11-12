"use client"

import { useTRPC } from "@/trpc/client"
import { Button, Switch } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

type Values = {
  productTips: boolean
  offers: boolean
  monthlyReport: boolean
  unsubscribedAll: boolean
}
type Change = Partial<Omit<Values, "unsubscribedAll">> & {
  unsubscribeAll?: boolean
}

const CATEGORIES = [
  {
    key: "productTips",
    label: "Product tips",
    hint: "Short emails that help you set up and get more from EwaTrade.",
  },
  {
    key: "offers",
    label: "Plans and offers",
    hint: "When your business is close to a plan limit, or a plan would save you money.",
  },
  {
    key: "monthlyReport",
    label: "Monthly report",
    hint: "Your sales and top items on the first of each month.",
  },
] as const

/**
 * Lifecycle email preferences. `token` mode serves the no-login page linked
 * from every email; without a token it edits the signed-in user's settings.
 * Login codes, receipts and limit notices are not affected.
 */
export function EmailPreferencesForm({
  token,
  unsubscribeIntent = false,
}: {
  token?: string
  unsubscribeIntent?: boolean
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const query = token
    ? trpc.marketingPreferences.byToken.queryOptions({ token })
    : trpc.marketingPreferences.get.queryOptions()
  const preferences = useQuery({ ...query, retry: false })
  const onSuccess = (data: Values) =>
    queryClient.setQueryData(query.queryKey, data)
  const byToken = useMutation(
    trpc.marketingPreferences.updateByToken.mutationOptions({ onSuccess }),
  )
  const bySession = useMutation(
    trpc.marketingPreferences.update.mutationOptions({ onSuccess }),
  )
  const mutation = token ? byToken : bySession
  const save = (change: Change) =>
    token ? byToken.mutate({ token, ...change }) : bySession.mutate(change)

  if (preferences.isPending)
    return <p className="text-sm text-muted-foreground">Loading…</p>
  if (preferences.isError || !preferences.data)
    return (
      <p className="text-sm text-muted-foreground">
        This link has expired or is not valid. Sign in to EwaTrade and open
        Settings → Notifications to change your emails.
      </p>
    )
  const values = preferences.data

  return (
    <div className="grid gap-5">
      {values.unsubscribedAll ? (
        <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="font-medium">
            You won’t get tips or offers from EwaTrade.
          </p>
          <p className="text-sm text-muted-foreground">
            Turn on any email below to hear from us again.
          </p>
        </div>
      ) : unsubscribeIntent ? (
        <div className="grid gap-3 rounded-lg border border-border p-4">
          <p className="font-medium">Stop all tips and offers?</p>
          <Button
            className="w-fit"
            disabled={mutation.isPending}
            onClick={() => save({ unsubscribeAll: true })}
          >
            Unsubscribe from all
          </Button>
        </div>
      ) : null}
      <ul className="grid gap-4">
        {CATEGORIES.map((category) => {
          const checked = !values.unsubscribedAll && values[category.key]
          return (
            <li key={category.key} className="flex items-start gap-4">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <label
                  htmlFor={`email-${category.key}`}
                  className="font-medium"
                >
                  {category.label}
                </label>
                <p className="text-sm text-muted-foreground">{category.hint}</p>
              </div>
              <Switch
                id={`email-${category.key}`}
                checked={checked}
                disabled={mutation.isPending}
                onCheckedChange={(next) =>
                  save(
                    next && values.unsubscribedAll
                      ? {
                          // Opting back in to one category does not re-enable the others.
                          productTips: category.key === "productTips",
                          offers: category.key === "offers",
                          monthlyReport: category.key === "monthlyReport",
                        }
                      : { [category.key]: next },
                  )
                }
              />
            </li>
          )
        })}
      </ul>
      {mutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          Couldn’t save. Try again.
        </p>
      ) : null}
    </div>
  )
}
