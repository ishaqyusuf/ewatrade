"use client"

import { useTRPC, useTRPCClient } from "@/trpc/client"
import {
  formatCurrencyInput,
  getCurrencySymbol,
  majorToMinor,
  minorToMajorInput,
} from "@ewatrade/utils/currency"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { ClaimReveal } from "./claim-reveal"
import { CustomerCredit } from "./customer-credit"
import { closeDraftForReplacement, preparedFromStatus } from "./draft-report"
import {
  type IssuedAttempt,
  startNextPaymentAttempt,
} from "./next-payment-attempt"
import { initialPayerName } from "./payer-name"
import {
  type PublicPaymentLink,
  type PublicReportStatus,
  money,
} from "./payment-format"
import {
  AmountField,
  BankDetails,
  BusinessHeader,
  DetailList,
  FixedAmount,
  OrderSummary,
  PaymentShell,
  ReceiptPicker,
  ReferenceValue,
  StatusCard,
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./payment-parts"
import {
  confirmedExcessLabel,
  confirmedOutcome,
  outcomeNextStep,
  reportReference,
  resolvePaymentView,
} from "./payment-view"
import {
  LoadingView,
  OutcomeCard,
  PaymentHero,
  VerifiedNote,
  WaitingView,
} from "./payment-views"
import { receiptAmountSuggestion } from "./receipt-assessment"
import { ReceiptCheck } from "./receipt-check"
import type { PickedReceipt } from "./receipt-file"
import {
  type RefundDestination,
  emptyRefundDestination,
  readRefundDestination,
  sameRefundDestination,
} from "./refund-destination"
import { RefundFields } from "./refund-fields"
import {
  type ExcessChoice,
  reportAllocation,
  reviewSentAmount,
} from "./report-allocation"
import {
  type StoredReport,
  clearStoredReport,
  hasPersistedReport,
  newClientReportId,
  readStoredReport,
  sameReportDetails,
  writeStoredReport,
} from "./report-storage"
import {
  type PreparedReport,
  ReportFlowError,
  type SendStep,
  prepareReport,
  submitPreparedReport,
  trpcErrorCode,
  uploadPreparedReceipt,
} from "./send-payment-report"
import { SentAmount } from "./sent-amount"
import { useCustomerCredit } from "./use-customer-credit"
import { useReceiptPreflight } from "./use-receipt-preflight"
import { useReportStatus } from "./use-report-status"

const ALREADY_CHECKING =
  "A payment report for this link is already being checked. If you told them from another phone or browser, open this link there to see the result."

export function PaymentPage({
  token,
  initialLink,
}: { token: string; initialLink?: PublicPaymentLink }) {
  const activeVisit = useRef({ token, generation: 0 })
  if (activeVisit.current.token !== token)
    activeVisit.current = {
      token,
      generation: activeVisit.current.generation + 1,
    }
  const visitGeneration = activeVisit.current.generation
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const trpc = useTRPC()
  const client = useTRPCClient()
  const queryClient = useQueryClient()
  const linkOptions = trpc.businessBanking.paymentLink.queryOptions({ token })
  const linkQuery = useQuery({ ...linkOptions, initialData: initialLink })
  const link = linkQuery.data

  const [record, setRecord] = useState<StoredReport | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [recordOwner, setRecordOwner] = useState(token)
  useEffect(() => {
    setRecord(readStoredReport(token))
    setStorageReady(true)
    setRecordOwner(token)
    setDraftMode(false)
    setCheckedDraftId(null)
    setPreflightStartedAt(null)
    setRefundText(emptyRefundDestination)
    setRefundError(null)
    preparedDestination.current = null
    setReceipt(null)
    setReceiptEdited(false)
    setRevealed(false)
    setPayerName(null)
    setStep(null)
    setFlowError(null)
    sendingRef.current = false
    setNextForm(null)
    setNextNotice(null)
  }, [token])

  const reportToken =
    storageReady && recordOwner === token ? (record?.reportToken ?? null) : null
  const {
    query: statusQuery,
    connection,
    reload: reloadStatus,
  } = useReportStatus(reportToken)
  const status = statusQuery.data
  const statusCode = trpcErrorCode(statusQuery.error)
  const linkCode = trpcErrorCode(linkQuery.error)

  // A stored report token that expired or vanished is forgotten, never retried.
  useEffect(() => {
    if (!reportToken) return
    if (statusCode !== "NOT_FOUND" && statusCode !== "BAD_REQUEST") return
    clearStoredReport(token)
    setRecord(null)
  }, [reportToken, statusCode, token])

  // A decision changes the order balance: read the link again.
  const decision =
    status && status.state !== "checking" && status.state !== "draft_cancelled"
      ? `${status.reportId}:${status.revision}`
      : null
  const linkKey = linkOptions.queryKey
  useEffect(() => {
    if (decision) void queryClient.invalidateQueries({ queryKey: linkKey })
  }, [decision, queryClient, linkKey])

  const [draftMode, setDraftMode] = useState(false)
  const [checkedDraftId, setCheckedDraftId] = useState<string | null>(null)
  const [preflightStartedAt, setPreflightStartedAt] = useState<number | null>(
    null,
  )
  const preflight = useReceiptPreflight({
    reportToken,
    startedAt: preflightStartedAt,
  })
  const [refundText, setRefundText] = useState(emptyRefundDestination)
  const [refundError, setRefundError] = useState<string | null>(null)
  // These private values are never put in storage, query keys or status cache.
  const preparedDestination = useRef<RefundDestination | null>(null)
  const [receiptEdited, setReceiptEdited] = useState(false)
  const invalidateCheck = () => {
    setCheckedDraftId(null)
    setPreflightStartedAt(null)
  }

  const view = resolvePaymentView({
    preflight: draftMode,
    link: recordOwner === token ? link : undefined,
    linkError: linkQuery.error
      ? linkCode === "NOT_FOUND" || linkCode === "BAD_REQUEST"
        ? "not_found"
        : "error"
      : null,
    hasReportToken: Boolean(reportToken),
    status,
    statusPending: statusQuery.isPending,
    statusError:
      statusQuery.error && !status
        ? statusCode === "NOT_FOUND" || statusCode === "BAD_REQUEST"
          ? "not_found"
          : "error"
        : null,
  })

  // Amount: fixed, or editable up to the amount due when the business allows it.
  const dueMinor =
    view.kind === "link"
      ? view.link.amountPrefilledMinor
      : (link?.amountPrefilledMinor ?? 0)
  const [amountText, setAmountText] = useState<string | null>(null)
  const [amountError, setAmountError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  // What the customer says they actually sent, entered in the "I have paid" step.
  const [sentText, setSentText] = useState<string | null>(null)
  const [sentError, setSentError] = useState<string | null>(null)
  const [excessChoice, setExcessChoice] = useState<ExcessChoice | null>(null)
  const sentRef = useRef<HTMLInputElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the amount due changes
  useEffect(() => {
    setAmountText(null)
    setAmountError(null)
    setSentText(null)
    setSentError(null)
    setExcessChoice(null)
    setCheckedDraftId(null)
    setPreflightStartedAt(null)
  }, [dueMinor])
  const shownAmountText =
    amountText ?? formatCurrencyInput(minorToMajorInput(dueMinor))

  const [receipt, setReceipt] = useState<PickedReceipt | null>(null)
  // "I have paid" opens the name step in place; a second explicit submit reports.
  const [revealed, setRevealed] = useState(false)
  // Set once when the step first opens, so refetches never replace what the customer typed.
  const [payerName, setPayerName] = useState<string | null>(null)
  const [step, setStep] = useState<SendStep | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const revealId = useId()
  const paidButtonRef = useRef<HTMLButtonElement>(null)
  // A decided report stays the whole page until the customer explicitly starts a new one, the
  // server issues its payment attempt, and the link shows that exact attempt.
  const [nextForm, setNextForm] = useState<{
    outcomeKey: string
    paymentAttemptId: string
  } | null>(null)
  const [nextNotice, setNextNotice] = useState<
    | { outcomeKey: string; kind: "error"; message: string }
    | { outcomeKey: string; kind: "changed"; attempt: IssuedAttempt }
    | null
  >(null)
  const [nextBusy, setNextBusy] = useState(false)
  const nextBusyRef = useRef(false)
  const newFormRef = useRef<HTMLElement>(null)
  const focusNewForm = useRef(false)

  const finishing = view.kind === "unfinished" && Boolean(record?.reportToken)
  // What the customer plans to transfer: drives the payment details and copy.
  const claimMinor = finishing
    ? (record?.claimedAmountMinor ?? 0)
    : link?.allowPartial
      ? (majorToMinor(shownAmountText) ?? 0)
      : dueMinor

  const balanceMinor =
    view.kind === "link" ? view.link.balanceMinor : (link?.balanceMinor ?? 0)
  const shownSentText =
    sentText ??
    formatCurrencyInput(minorToMajorInput(claimMinor > 0 ? claimMinor : 0))
  const sentMinor = finishing
    ? (record?.claimedAmountMinor ?? 0)
    : majorToMinor(shownSentText)
  const sentReview =
    finishing || !link
      ? ({ kind: "ordinary" } as const)
      : reviewSentAmount({
          sentMinor,
          dueMinor,
          balanceMinor,
          allowPartial: link.allowPartial,
          currencyCode: link.currencyCode,
        })
  const allocation = finishing
    ? (record?.allocation ?? null)
    : reportAllocation(sentReview, excessChoice)

  const credit = useCustomerCredit({
    token,
    link: view.kind === "link" ? view.link : link,
    enabled: view.kind === "link" && view.link.state === "active",
    allowApply: !revealed && !draftMode,
    reportToken,
    linkUpdatedAt: linkQuery.dataUpdatedAt,
  })

  // The link closed or expired while the name step was open.
  useEffect(() => {
    if (link && link.state !== "active" && step === null && !finishing)
      setRevealed(false)
  }, [link, step, finishing])

  useEffect(() => {
    if (!nextForm || !focusNewForm.current) return
    focusNewForm.current = false
    newFormRef.current?.focus()
  }, [nextForm])

  const amountIsValid = () => {
    if (finishing || !link?.allowPartial) return true
    const value = majorToMinor(shownAmountText)
    const problem =
      value === null || value <= 0
        ? "Enter the amount you sent."
        : value > dueMinor
          ? `Enter up to ${money(dueMinor, link.currencyCode)}.`
          : null
    setAmountError(problem)
    if (problem) amountRef.current?.focus()
    return !problem
  }

  /** The amount actually sent, and the customer's choice for any extra, before reporting. */
  const sentIsValid = () => {
    if (finishing) return true
    const problem =
      sentReview.kind === "invalid"
        ? sentReview.message
        : allocation === "choice_required"
          ? "Choose what should happen to the extra."
          : null
    setSentError(problem)
    if (problem && sentReview.kind === "invalid") sentRef.current?.focus()
    return !problem
  }

  const openClaim = () => {
    setFlowError(null)
    if (!link || !amountIsValid()) return
    setPayerName(
      (current) =>
        current ??
        (finishing
          ? (record?.payerName ?? "")
          : initialPayerName({ record, customerName: link.customerName })),
    )
    if (finishing && record) {
      setPayerName(record.payerName)
      setSentText(
        formatCurrencyInput(minorToMajorInput(record.claimedAmountMinor)),
      )
      setExcessChoice(
        record.allocation &&
          record.allocation.allocationPreference !== "ORDER_MORE"
          ? record.allocation.allocationPreference
          : null,
      )
      setDraftMode(true)
      invalidateCheck()
    }
    setRevealed(true)
  }

  const closeClaim = () => {
    setRevealed(false)
    setFlowError(null)
    requestAnimationFrame(() => paidButtonRef.current?.focus())
  }

  const recoverConflict = useCallback(
    async (attempt: StoredReport) => {
      const candidates = [
        attempt.reportToken,
        attempt.previousReportToken,
      ].filter((value): value is string => Boolean(value))
      for (const candidate of candidates) {
        try {
          const existing = await client.businessBanking.reportStatus.query({
            reportToken: candidate,
          })
          if (existing.state !== "checking" || existing.status !== "SUBMITTED")
            continue
          const own = candidate === attempt.reportToken
          const recovered: StoredReport = {
            ...attempt,
            reportToken: candidate,
            payerName: own ? attempt.payerName : "",
            receipt: own ? attempt.receipt : null,
            claimedAmountMinor: existing.claimedAmountMinor,
            allocation: own ? (attempt.allocation ?? null) : null,
            reportedAt: own ? attempt.reportedAt : null,
            // The report being checked keeps the attempt it was made against.
            paymentAttemptId: existing.paymentAttemptId,
            paymentReference: existing.paymentReference,
          }
          writeStoredReport(token, recovered)
          if (
            mounted.current &&
            activeVisit.current.token === token &&
            activeVisit.current.generation === visitGeneration
          )
            setRecord(recovered)
          return true
        } catch {
          /* Try the next stored token. */
        }
      }
      return false
    },
    [client, token, visitGeneration],
  )

  const confirm = async (payerName: string) => {
    if (
      !link ||
      sendingRef.current ||
      credit.blocksTransfer ||
      allocation === "choice_required" ||
      sentMinor === null
    )
      return
    setFlowError(null)
    setRefundError(null)
    const parsedDestination =
      allocation?.allocationPreference === "REFUND"
        ? readRefundDestination(refundText)
        : { kind: "empty" as const }
    if (parsedDestination.kind === "invalid") {
      setRefundError(parsedDestination.message)
      return
    }
    const destination =
      parsedDestination.kind === "valid" ? parsedDestination.destination : null
    if (destination && credit.refundProof.kind !== "verified") {
      setRefundError(
        "Sign in as this order's customer before attaching bank details.",
      )
      return
    }
    const existingDraft =
      record &&
      !record.reportedAt &&
      record.paymentAttemptId === link.paymentAttemptId
        ? record
        : null
    const keepSavedDestination = Boolean(
      existingDraft?.reportToken &&
        existingDraft.refundDetails &&
        !destination &&
        allocation?.allocationPreference === "REFUND",
    )
    const details = {
      payerName,
      claimedAmountMinor: sentMinor,
      allocation,
      refundDetails: Boolean(destination) || keepSavedDestination,
      receipt: link.receiptAllowed
        ? (receipt?.meta ??
          (!receiptEdited ? (existingDraft?.receipt ?? null) : null))
        : null,
      paymentAttemptId: link.paymentAttemptId,
    }
    const samePrivate =
      !destination ||
      sameRefundDestination(preparedDestination.current, destination)
    const unchanged = Boolean(
      existingDraft && sameReportDetails(existingDraft, details) && samePrivate,
    )
    // A separate click after preparing/checking is the only path to final receipt submit.
    const explicitFinal =
      unchanged && checkedDraftId === existingDraft?.clientReportId
    let attempt: StoredReport = existingDraft ?? {
      v: 1,
      clientReportId: newClientReportId(),
      ...details,
      paymentReference: link.paymentReference,
      reportToken: null,
      previousReportToken:
        record?.reportToken ?? record?.previousReportToken ?? null,
      reportedAt: null,
    }
    const isCurrent = () =>
      mounted.current &&
      activeVisit.current.token === token &&
      activeVisit.current.generation === visitGeneration
    const save = () => {
      writeStoredReport(token, attempt)
      if (isCurrent()) setRecord(attempt)
    }
    sendingRef.current = true
    setStep("preparing")
    setDraftMode(true)
    try {
      let prepared: PreparedReport | null = null
      if (existingDraft) {
        // A lost prepare answer is recovered with its original stable key before any replacement.
        if (!attempt.reportToken) {
          prepared = await prepareReport({
            client,
            linkToken: token,
            report: attempt,
            refundDestination: preparedDestination.current ?? destination,
          })
          attempt = { ...attempt, reportToken: prepared.reportToken }
          save()
          if (!isCurrent()) return
        }
        const oldToken = attempt.reportToken
        if (!oldToken)
          throw new ReportFlowError(
            "network",
            "Couldn't recover this draft. Try again.",
          )
        const oldStatus = await client.businessBanking.reportStatus.query({
          reportToken: oldToken,
        })
        if (!isCurrent()) return
        if (oldStatus.status !== "DRAFT") {
          queryClient.setQueryData(
            trpc.businessBanking.reportStatus.queryKey({
              reportToken: oldToken,
            }),
            oldStatus,
          )
          setDraftMode(false)
          setRevealed(false)
          return
        }
        if (!unchanged || oldStatus.state === "draft_cancelled") {
          await closeDraftForReplacement(client, oldToken)
          if (!isCurrent()) return
          // The old proof remains saved if closing it has an uncertain answer.
          attempt = {
            v: 1,
            clientReportId: newClientReportId(),
            ...details,
            reportToken: null,
            previousReportToken: oldToken,
            reportedAt: null,
            paymentReference: link.paymentReference,
          }
          preparedDestination.current = destination
          save()
          invalidateCheck()
        } else
          prepared = preparedFromStatus(
            oldToken,
            oldStatus,
            Boolean(attempt.receipt),
          )
      } else {
        preparedDestination.current = destination
        save()
        if (!isCurrent()) return
      }
      if (!prepared || prepared.reportToken !== attempt.reportToken) {
        if (attempt.refundDetails && !destination)
          throw new ReportFlowError(
            "refund_details_needed",
            "Re-enter all three refund bank fields to prepare a replacement report.",
          )
        preparedDestination.current = destination
        prepared = await prepareReport({
          client,
          linkToken: token,
          report: attempt,
          refundDestination: destination,
        })
        attempt = { ...attempt, reportToken: prepared.reportToken }
        save()
      }
      if (
        !(
          explicitFinal &&
          attempt.clientReportId === existingDraft?.clientReportId
        ) &&
        attempt.receipt &&
        prepared.status === "DRAFT"
      ) {
        if (receipt) {
          setStep("uploading")
          await uploadPreparedReceipt({
            prepared,
            report: attempt,
            file: receipt.file,
          })
          if (!isCurrent()) return
        }
        const canonical = await client.businessBanking.reportStatus.query({
          reportToken: prepared.reportToken,
        })
        if (!isCurrent()) return
        queryClient.setQueryData(
          trpc.businessBanking.reportStatus.queryKey({
            reportToken: prepared.reportToken,
          }),
          canonical,
        )
        if (canonical.state === "draft_cancelled")
          throw new ReportFlowError(
            "stale",
            "This draft was cancelled. Check your details and try again.",
          )
        if (canonical.status !== "DRAFT") {
          setDraftMode(false)
          setRevealed(false)
          return
        }
        // A reload may have lost the file before it uploaded. Never display a check as started.
        if (!receipt && !canonical.receiptAssessment)
          throw new ReportFlowError(
            "receipt_needed",
            "Add the same receipt again to check it, or remove it and send for manual review.",
          )
        setCheckedDraftId(attempt.clientReportId)
        setPreflightStartedAt(Date.now())
        return
      }
      setStep("submitting")
      const submitted = await submitPreparedReport({
        client,
        prepared,
        hasFile: Boolean(receipt),
      })
      attempt = {
        ...attempt,
        reportedAt: attempt.reportedAt ?? new Date().toISOString(),
      }
      save()
      if (!isCurrent()) return
      queryClient.setQueryData(
        trpc.businessBanking.reportStatus.queryKey({
          reportToken: prepared.reportToken,
        }),
        { ...submitted, statusSocketUrl: status?.statusSocketUrl ?? null },
      )
      void queryClient.invalidateQueries({
        queryKey: trpc.businessBanking.reportStatus.queryKey({
          reportToken: prepared.reportToken,
        }),
      })
      if (!isCurrent()) return
      setDraftMode(false)
      invalidateCheck()
      setRevealed(false)
      setPayerName(null)
      setReceipt(null)
      setReceiptEdited(false)
      setAmountText(null)
      setSentText(null)
      setExcessChoice(null)
      setRefundText(emptyRefundDestination)
      preparedDestination.current = null
    } catch (error) {
      save()
      if (!isCurrent()) return
      if (error instanceof ReportFlowError) {
        if (error.kind === "conflict" && (await recoverConflict(attempt))) {
          setDraftMode(false)
          setRevealed(false)
          return
        }
        if (error.kind === "unavailable" || error.kind === "conflict")
          void queryClient.invalidateQueries({ queryKey: linkKey })
        setFlowError(
          /already being checked/i.test(error.message)
            ? ALREADY_CHECKING
            : error.message,
        )
      } else
        setFlowError(
          "Couldn't finish this step. Your draft is saved; try again.",
        )
    } finally {
      if (isCurrent()) {
        sendingRef.current = false
        setStep(null)
      }
    }
  }

  /** Pay remaining / Tell them again, with the decided report's proof. */
  const startNextAttempt = async (decided: PublicReportStatus, key: string) => {
    if (!record?.reportToken || nextBusyRef.current) return
    nextBusyRef.current = true
    setNextBusy(true)
    setNextNotice(null)
    try {
      const result = await startNextPaymentAttempt({
        client,
        record,
        decidedAttemptId: decided.paymentAttemptId,
        save: (saved) => {
          writeStoredReport(token, saved)
          setRecord(saved)
        },
        readLink: async () => {
          // Never settle for an older read that was already in flight.
          await queryClient.cancelQueries({ queryKey: linkKey })
          return queryClient.fetchQuery({ ...linkOptions, staleTime: 0 })
        },
      })
      if (result.kind === "ready") {
        focusNewForm.current = true
        setNextForm({
          outcomeKey: key,
          paymentAttemptId: result.attempt.paymentAttemptId,
        })
        return
      }
      if (result.kind === "changed") {
        setNextNotice({
          outcomeKey: key,
          kind: "changed",
          attempt: result.attempt,
        })
        return
      }
      if (result.refresh)
        void queryClient.invalidateQueries({ queryKey: linkKey })
      setNextNotice({ outcomeKey: key, kind: "error", message: result.message })
    } finally {
      nextBusyRef.current = false
      setNextBusy(false)
    }
  }

  const retryAll = () => {
    void linkQuery.refetch()
    if (reportToken) reloadStatus()
  }

  const nameLocked = false
  const checkReady = Boolean(
    checkedDraftId && checkedDraftId === record?.clientReportId,
  )
  const checkedStatus = checkReady ? preflight.status : undefined
  const suggestion =
    checkedStatus && link
      ? receiptAmountSuggestion({
          assessment: checkedStatus.receiptAssessment,
          currencyCode: link.currencyCode,
          claimedAmountMinor: checkedStatus.claimedAmountMinor,
        })
      : null
  const hasReceiptToCheck = Boolean(
    receipt || (!receiptEdited && draftMode && record?.receipt),
  )
  const claimStep = (receiptSlot?: ReactNode) =>
    link && revealed && (link.state === "active" || finishing) ? (
      <ClaimReveal
        id={revealId}
        link={link}
        amountMinor={
          sentReview.kind !== "invalid" && sentMinor ? sentMinor : claimMinor
        }
        name={nameLocked ? (record?.payerName ?? "") : (payerName ?? "")}
        onNameChange={(name) => {
          setPayerName(name)
          invalidateCheck()
        }}
        nameLocked={nameLocked}
        amount={
          <>
            <SentAmount
              id={revealId}
              value={
                finishing
                  ? formatCurrencyInput(
                      minorToMajorInput(record?.claimedAmountMinor ?? 0),
                    )
                  : shownSentText
              }
              onChange={(value) => {
                invalidateCheck()
                setSentText(formatCurrencyInput(value))
                if (sentError) setSentError(null)
              }}
              currencyCode={link.currencyCode}
              currencySymbol={getCurrencySymbol(link.currencyCode)}
              businessName={link.businessName}
              error={sentError}
              locked={finishing}
              review={sentReview}
              choice={excessChoice}
              onChoiceChange={(choice) => {
                invalidateCheck()
                setExcessChoice(choice)
                if (sentError) setSentError(null)
              }}
              disabled={step !== null}
              inputRef={sentRef}
            />
            {allocation !== "choice_required" &&
            allocation?.allocationPreference === "REFUND" ? (
              <RefundFields
                id={revealId}
                value={refundText}
                onChange={(value) => {
                  setRefundText(value)
                  setRefundError(null)
                  invalidateCheck()
                }}
                proof={credit.refundProof}
                disabled={step !== null}
                error={refundError}
                saved={Boolean(record?.reportToken && record.refundDetails)}
              />
            ) : null}
            {checkedStatus && reportToken ? (
              <ReceiptCheck
                reportToken={reportToken}
                status={checkedStatus}
                businessName={link.businessName}
                accountNumber={link.bank.accountNumber}
                hasReceipt
                stage="draft"
                inline
                timedOut={preflight.timedOut}
                onRetry={() => setPreflightStartedAt(Date.now())}
              >
                {suggestion !== null ? (
                  <button
                    type="button"
                    className={`${secondaryButtonClass} mt-2`}
                    disabled={step !== null}
                    onClick={() => {
                      setSentText(
                        formatCurrencyInput(minorToMajorInput(suggestion)),
                      )
                      setExcessChoice(null)
                      setSentError(null)
                      invalidateCheck()
                    }}
                  >
                    Use receipt amount · {money(suggestion, link.currencyCode)}
                  </button>
                ) : null}
              </ReceiptCheck>
            ) : null}
            {checkReady ? (
              <p className="text-[13px] text-muted-foreground">
                Your report is still a draft. Send it below when you're ready;{" "}
                {link.businessName} will check their account.
              </p>
            ) : null}
            {draftMode && record?.receipt && !receipt && !receiptEdited ? (
              <p className="text-[13px] text-muted-foreground">
                Receipt saved for this draft: {record.receipt.fileName}.{" "}
                <button
                  type="button"
                  className="underline"
                  disabled={step !== null}
                  onClick={() => {
                    setReceiptEdited(true)
                    invalidateCheck()
                  }}
                >
                  Remove receipt
                </button>
              </p>
            ) : null}
          </>
        }
        receipt={receiptSlot}
        step={step}
        submitLabel={
          hasReceiptToCheck && !checkReady
            ? "Check receipt"
            : hasReceiptToCheck
              ? "Send for business review"
              : "Yes, I've paid"
        }
        error={flowError}
        onConfirm={(name) => {
          if (amountIsValid() && sentIsValid()) void confirm(name)
        }}
        onCancel={closeClaim}
      />
    ) : null

  if (view.kind === "loading") return <LoadingView />
  if (view.kind === "not_found")
    return (
      <PaymentShell>
        <StatusCard tone="info" title="We can't find this page">
          The link may be wrong or incomplete. Ask the business that sent it for
          a new one.
        </StatusCard>
      </PaymentShell>
    )
  if (view.kind === "error")
    return (
      <PaymentShell>
        <StatusCard
          tone="info"
          title="We couldn't load this page"
          footer={
            <button
              type="button"
              className={`${primaryButtonClass} mt-3`}
              onClick={retryAll}
              disabled={linkQuery.isFetching}
            >
              Try again
            </button>
          }
        >
          Check your connection and try again.
        </StatusCard>
      </PaymentShell>
    )

  const viewLink = view.link
  if (view.kind === "waiting")
    return (
      <WaitingView
        link={viewLink}
        status={view.status}
        reportToken={reportToken}
        record={record}
        connection={connection}
        onReload={reloadStatus}
        canRecover={hasPersistedReport(token, reportToken)}
      />
    )

  if (view.kind === "unfinished")
    return (
      <PaymentShell>
        <BusinessHeader
          businessName={viewLink.businessName}
          orderNumber={viewLink.orderNumber}
        />
        <StatusCard
          tone="wait"
          title={
            status?.state === "draft_cancelled"
              ? "This draft was cancelled"
              : "You haven't finished telling them"
          }
          footer={
            revealed ? null : (
              <button
                ref={paidButtonRef}
                type="button"
                className={`${primaryButtonClass} mt-3`}
                aria-expanded={false}
                aria-controls={revealId}
                onClick={openClaim}
              >
                Finish telling them
              </button>
            )
          }
        >
          {status?.state === "draft_cancelled" ? (
            "This draft was never submitted to the business. Check your details to prepare a fresh report."
          ) : (
            <>
              Your report didn't reach {viewLink.businessName} yet. Finish it so
              they can check their account.
            </>
          )}
        </StatusCard>
        {record ? (
          <DetailList
            rows={[
              {
                label: "You said you paid",
                value: (
                  <b className="tabular-nums">
                    {money(record.claimedAmountMinor, viewLink.currencyCode)}
                  </b>
                ),
              },
              ...(record.payerName
                ? [{ label: "Your name", value: record.payerName }]
                : []),
              ...(record.paymentReference
                ? [
                    {
                      label: "Payment reference",
                      value: (
                        <ReferenceValue reference={record.paymentReference} />
                      ),
                    },
                  ]
                : []),
              {
                label: "Receipt",
                value: record.receipt?.fileName ?? "No receipt",
              },
            ]}
          />
        ) : null}
        {revealed ? (
          <section className={`${cardClass} flex flex-col p-4`}>
            {claimStep(
              viewLink.receiptAllowed ? (
                <ReceiptPicker
                  receipt={receipt}
                  onChange={(value) => {
                    setReceipt(value)
                    setReceiptEdited(true)
                    invalidateCheck()
                  }}
                  disabled={step !== null}
                />
              ) : null,
            )}
          </section>
        ) : null}
      </PaymentShell>
    )

  const outcome = view.outcome
  const outcomeCard = outcome ? (
    <OutcomeCard
      link={viewLink}
      outcome={outcome.state}
      status={outcome.status}
      updatedAt={statusQuery.dataUpdatedAt}
    />
  ) : null
  const header = (
    <BusinessHeader
      businessName={viewLink.businessName}
      orderNumber={viewLink.orderNumber}
    />
  )

  // What the business confirmed and what is still due, from the decided report.
  const outcomeReference = outcome ? reportReference(outcome.status) : null
  const confirmed = outcome ? confirmedOutcome(outcome.status) : null
  const outcomeAmounts =
    outcome && outcome.state !== "not_received" ? (
      <DetailList
        rows={[
          {
            label: "Received",
            value: (
              <b className="tabular-nums">
                {money(
                  confirmed?.receivedMinor ??
                    outcome.status.receivedAmountMinor ??
                    0,
                  viewLink.currencyCode,
                )}
              </b>
            ),
          },
          ...(confirmed
            ? [
                {
                  label: "Applied to this order",
                  value: (
                    <b className="tabular-nums">
                      {money(confirmed.appliedMinor, viewLink.currencyCode)}
                    </b>
                  ),
                },
              ]
            : []),
          ...(confirmed?.excess
            ? [
                {
                  label: confirmedExcessLabel(confirmed.excess),
                  value: (
                    <b className="tabular-nums">
                      {money(
                        confirmed.excess.amountMinor,
                        viewLink.currencyCode,
                      )}
                    </b>
                  ),
                },
              ]
            : []),
          {
            label: "Still to pay",
            value: (
              <b className="tabular-nums">
                {money(outcome.status.balanceMinor, viewLink.currencyCode)}
              </b>
            ),
          },
          ...(outcomeReference
            ? [
                {
                  label: "Payment reference",
                  value: <ReferenceValue reference={outcomeReference} />,
                },
              ]
            : []),
        ]}
      />
    ) : null
  const verifiedNote =
    outcome && outcome.state !== "not_received" ? (
      <VerifiedNote
        businessName={viewLink.businessName}
        status={outcome.status}
      />
    ) : null

  if (viewLink.state === "paid")
    return (
      <PaymentShell>
        {header}
        {outcomeCard ?? (
          <StatusCard tone="ok" title="This order is paid">
            {money(viewLink.totalMinor, viewLink.currencyCode)} confirmed by{" "}
            {viewLink.businessName}.
          </StatusCard>
        )}
        {verifiedNote}
        {outcomeAmounts}
        <OrderSummary link={viewLink} />
      </PaymentShell>
    )
  if (viewLink.state === "expired")
    return (
      <PaymentShell>
        {header}
        {outcomeCard}
        <StatusCard tone="info" title="This payment link has expired">
          Ask {viewLink.businessName} for a new link. Don't transfer using old
          details.
        </StatusCard>
      </PaymentShell>
    )
  if (viewLink.state === "unavailable")
    return (
      <PaymentShell>
        {header}
        {outcomeCard}
        <StatusCard tone="bad" title="This link no longer takes payments">
          The order was cancelled or the link was closed. Don't transfer using
          these details. If you think this is wrong, reply to{" "}
          {viewLink.businessName} where you got this link.
        </StatusCard>
      </PaymentShell>
    )

  const next = outcome
    ? outcomeNextStep(outcome.state, {
        linkState: viewLink.state,
        balanceMinor: outcome.status.balanceMinor,
      })
    : null
  const outcomeKey = outcome
    ? `${outcome.status.reportId}:${outcome.status.revision}`
    : null
  // Open only while the link still shows the exact attempt the customer moved on to.
  const nextFormOpen =
    nextForm !== null &&
    nextForm.outcomeKey === outcomeKey &&
    nextForm.paymentAttemptId === viewLink.paymentAttemptId
  if (outcome && outcomeKey && !(next && nextFormOpen)) {
    // What a new report would ask for: this link's amount, up to what is still due.
    const nextMinor = Math.min(
      viewLink.amountRequestedMinor,
      outcome.status.balanceMinor,
    )
    // A newer reference is offered only while the link still shows it.
    const notice =
      nextNotice?.outcomeKey === outcomeKey &&
      (nextNotice.kind === "error" ||
        nextNotice.attempt.paymentAttemptId === viewLink.paymentAttemptId)
        ? nextNotice
        : null
    const decided = outcome.status
    return (
      <PaymentShell>
        {header}
        {outcomeCard}
        {verifiedNote}
        {outcomeAmounts}
        {next && notice?.kind === "changed" ? (
          <section
            className={`${cardClass} flex flex-col gap-2 border-l-4 border-l-warning px-3.5 py-3 text-sm leading-relaxed`}
            aria-live="polite"
          >
            <b>This link has a newer payment reference</b>
            <span className="text-muted-foreground">
              Your last report keeps its own reference. Use this one only for a
              new transfer.
            </span>
            <div>
              <ReferenceValue reference={notice.attempt.paymentReference} />
            </div>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                focusNewForm.current = true
                setNextForm({
                  outcomeKey,
                  paymentAttemptId: notice.attempt.paymentAttemptId,
                })
              }}
            >
              Continue with this reference
            </button>
          </section>
        ) : next ? (
          <button
            type="button"
            className={primaryButtonClass}
            disabled={nextBusy}
            onClick={() => void startNextAttempt(decided, outcomeKey)}
          >
            {nextBusy
              ? "Getting a new payment reference…"
              : next === "tell_again"
                ? "Tell them again"
                : nextMinor < outcome.status.balanceMinor
                  ? `Pay ${money(nextMinor, viewLink.currencyCode)} more`
                  : `Pay remaining ${money(nextMinor, viewLink.currencyCode)}`}
          </button>
        ) : null}
        {next && notice?.kind === "error" ? (
          <p
            role="alert"
            className="text-center text-[13px] leading-relaxed text-destructive"
          >
            {notice.message}
          </p>
        ) : null}
        <OrderSummary link={viewLink} />
      </PaymentShell>
    )
  }
  // The decided report keeps its own reference; say which one this transfer uses instead.
  const previousReference = outcome ? reportReference(outcome.status) : null

  const creditCard = (
    <CustomerCredit
      credit={credit}
      businessName={viewLink.businessName}
      currencyCode={viewLink.currencyCode}
      appliedMinor={viewLink.attemptAppliedMinor}
      transferMinor={viewLink.amountPrefilledMinor}
    />
  )
  // Credit used (or possibly used) on this payment, and no link read yet includes it: the
  // link's amount may still be the whole installment, so no transfer is offered until it does.
  if (credit.blocksTransfer)
    return (
      <PaymentShell>
        {header}
        {creditCard}
        {credit.command?.result ? (
          <StatusCard
            tone="info"
            title="Updating what's left to pay"
            footer={
              <button
                type="button"
                className={`${secondaryButtonClass} mt-3`}
                disabled={linkQuery.isFetching}
                onClick={() => void linkQuery.refetch()}
              >
                Reload
              </button>
            }
          >
            This page shows the amount to transfer once it has the latest
            balance from {viewLink.businessName}.
          </StatusCard>
        ) : null}
        <OrderSummary link={viewLink} />
      </PaymentShell>
    )
  // This payment's amount is already covered (by credit or confirmed transfers) while the order
  // still owes money: the rest needs a new payment from the business, not a ₦0 transfer.
  if (viewLink.amountPrefilledMinor <= 0)
    return (
      <PaymentShell>
        {header}
        {creditCard}
        <StatusCard tone="info" title="Nothing to transfer on this payment">
          To pay the remaining{" "}
          {money(viewLink.balanceMinor, viewLink.currencyCode)}, ask{" "}
          {viewLink.businessName} for a new payment link.
        </StatusCard>
        <OrderSummary link={viewLink} />
      </PaymentShell>
    )

  const again = next === "tell_again"
  return (
    <PaymentShell hero={<PaymentHero link={viewLink} />}>
      {creditCard}
      <section
        ref={newFormRef}
        tabIndex={-1}
        aria-label="Pay by bank transfer"
        className={`${cardClass} flex flex-col gap-3 p-4 outline-none`}
      >
        {viewLink.allowPartial ? (
          <AmountField
            value={shownAmountText}
            onChange={(value) => {
              invalidateCheck()
              setAmountText(formatCurrencyInput(value))
              if (amountError) setAmountError(null)
            }}
            maxMinor={dueMinor}
            currencyCode={viewLink.currencyCode}
            currencySymbol={getCurrencySymbol(viewLink.currencyCode)}
            error={amountError}
            inputRef={amountRef}
            disabled={step !== null}
          />
        ) : outcome ? (
          <FixedAmount
            amountMinor={dueMinor}
            currencyCode={viewLink.currencyCode}
          />
        ) : null}
        {previousReference &&
        viewLink.paymentReference &&
        previousReference !== viewLink.paymentReference ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            This transfer has a new payment reference. Your last report used{" "}
            <span className="break-all">{previousReference}</span>.
          </p>
        ) : null}
        <BankDetails
          link={viewLink}
          amountMinor={viewLink.allowPartial ? null : dueMinor}
          detailsAmountMinor={
            !viewLink.allowPartial
              ? dueMinor
              : claimMinor > 0 && claimMinor <= dueMinor
                ? claimMinor
                : null
          }
        />
        {viewLink.receiptAllowed ? (
          <ReceiptPicker
            receipt={receipt}
            onChange={(value) => {
              setReceipt(value)
              setReceiptEdited(true)
              invalidateCheck()
            }}
            disabled={step !== null}
          />
        ) : null}
        {revealed ? (
          claimStep()
        ) : (
          <div className="sticky bottom-0 -mx-4 -mb-4 rounded-b-2xl bg-card px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              ref={paidButtonRef}
              type="button"
              className={primaryButtonClass}
              aria-expanded={false}
              aria-controls={revealId}
              onClick={openClaim}
            >
              {again ? "I have paid · tell them again" : "I have paid"}
            </button>
          </div>
        )}
      </section>
    </PaymentShell>
  )
}
