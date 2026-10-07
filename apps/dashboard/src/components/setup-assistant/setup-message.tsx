"use client"

import {
  SETUP_ATTACHMENT_PART,
  type SetupAttachmentPartData,
} from "@ewatrade/assistant/setup/attachments"
import { SETUP_TOOL_LABELS } from "@ewatrade/assistant/setup/messages"
import { cn } from "@ewatrade/ui"
import { CheckmarkCircle02Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { UIMessage } from "ai"
import { memo } from "react"
import { Streamdown } from "streamdown"
import { SetupSentAttachment } from "./setup-attachment-chips"

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc space-y-1 pl-5 text-sm">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal space-y-1 pl-5 text-sm">{children}</ol>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  // The assistant never needs to send owners elsewhere; links render as text.
  a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  img: () => null,
}

export const SetupMessage = memo(function SetupMessage({
  message,
  streaming,
}: {
  message: UIMessage
  streaming: boolean
}) {
  if (message.role === "user") {
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
    const files = message.parts.flatMap((part) =>
      part.type === SETUP_ATTACHMENT_PART
        ? [(part as { data: SetupAttachmentPartData }).data]
        : [],
    )
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col gap-2 rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {text ? <p className="whitespace-pre-wrap">{text}</p> : null}
          {files.map((file) => (
            <SetupSentAttachment key={file.attachmentId} data={file} inverted />
          ))}
        </div>
      </div>
    )
  }

  const tools = message.parts.filter((part) => part.type.startsWith("tool-"))
  const texts = message.parts.filter((part) => part.type === "text")

  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
      </span>
      <div className="flex min-w-0 max-w-[85%] flex-col gap-2 text-foreground/85">
        {tools.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((part) => {
              const toolName = part.type.slice("tool-".length)
              const done =
                "state" in part &&
                (part.state === "output-available" ||
                  part.state === "output-error")
              return (
                <span
                  key={"toolCallId" in part ? part.toolCallId : part.type}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground",
                    !done && "animate-pulse",
                  )}
                >
                  {done ? (
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      className="size-3"
                    />
                  ) : null}
                  {SETUP_TOOL_LABELS[toolName] ?? "Working"}
                  {done ? "" : "…"}
                </span>
              )
            })}
          </div>
        ) : null}
        {texts.map((part, index) =>
          part.type === "text" ? (
            <Streamdown
              // biome-ignore lint/suspicious/noArrayIndexKey: text parts have no ids
              key={index}
              className="space-y-2"
              components={markdownComponents}
              isAnimating={streaming}
            >
              {part.text}
            </Streamdown>
          ) : null,
        )}
      </div>
    </div>
  )
})
