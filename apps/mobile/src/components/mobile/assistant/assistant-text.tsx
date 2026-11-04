import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { Fragment, useMemo } from "react"
import {
  type MarkdownBlock,
  type MarkdownLine,
  parseMarkdown,
} from "./assistant-markdown"

const BODY = "text-base [-rn-line-height:24] text-foreground"
// Money and counts line up in columns and don't jitter while they stream.
const NUMBERS = { fontVariant: ["tabular-nums" as const] }

function Inline({ line }: { line: MarkdownLine }) {
  return line.map((part, index) =>
    part.kind === "bold" ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts keep their order
      <Text key={index} className="font-bold">
        {part.text}
      </Text>
    ) : part.kind === "italic" ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts keep their order
      <Text key={index} className="italic">
        {part.text}
      </Text>
    ) : part.kind === "code" ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts keep their order
      <Text key={index} className="bg-muted font-mono">
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  )
}

function Table({
  block,
  large,
}: {
  block: Extract<MarkdownBlock, { type: "table" }>
  large: boolean
}) {
  // At large text each row becomes a small stack: name, then "Column · value".
  if (large)
    return (
      <View>
        {block.rows.map((row, rowIndex) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: rows keep their order
            key={rowIndex}
            className={cn("py-2", rowIndex > 0 && "border-t border-border")}
          >
            {row.map((cell, column) => (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: cells keep their order
                key={column}
                selectable
                className={cn(BODY, column === 0 && "font-bold")}
                style={NUMBERS}
              >
                {column > 0 ? (
                  <Text className="text-muted-foreground">
                    <Inline line={block.head[column] ?? []} />
                    {" · "}
                  </Text>
                ) : null}
                <Inline line={cell} />
              </Text>
            ))}
          </View>
        ))}
      </View>
    )
  const cellClass = (column: number) =>
    cn(
      column === 0 ? "flex-[1.6]" : "flex-1",
      block.right[column] && "text-right",
    )
  return (
    <View>
      <View className="flex-row gap-2 border-b border-border pb-1.5">
        {block.head.map((cell, column) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: cells keep their order
            key={column}
            className={cn(
              "text-xs font-bold [-rn-line-height:18] text-muted-foreground",
              cellClass(column),
            )}
          >
            <Inline line={cell} />
          </Text>
        ))}
      </View>
      {block.rows.map((row, rowIndex) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: rows keep their order
          key={rowIndex}
          className={cn(
            "flex-row gap-2 py-2",
            rowIndex > 0 && "border-t border-border",
          )}
        >
          {row.map((cell, column) => (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: cells keep their order
              key={column}
              selectable
              className={cn(
                "text-sm [-rn-line-height:20] text-foreground",
                cellClass(column),
              )}
              style={NUMBERS}
            >
              <Inline line={cell} />
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function Block({ block, large }: { block: MarkdownBlock; large: boolean }) {
  if (block.type === "heading")
    return (
      <Text
        accessibilityRole="header"
        selectable
        className="text-[17px] font-extrabold tracking-tight [-rn-line-height:24] text-foreground"
      >
        <Inline line={block.line} />
      </Text>
    )
  if (block.type === "list")
    return (
      <View className="gap-1.5">
        {block.items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: items keep their order
          <View key={index} className="flex-row gap-2">
            <Text
              className={cn(
                BODY,
                "text-muted-foreground",
                block.ordered ? "min-w-[22px] text-right" : "min-w-[12px]",
              )}
              style={NUMBERS}
            >
              {block.ordered ? `${block.start + index}.` : "•"}
            </Text>
            <Text selectable className={cn(BODY, "flex-1")} style={NUMBERS}>
              <Inline line={item} />
            </Text>
          </View>
        ))}
      </View>
    )
  if (block.type === "table") return <Table block={block} large={large} />
  return (
    <Text selectable className={BODY} style={NUMBERS}>
      {block.lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines keep their order
        <Fragment key={index}>
          {index > 0 ? "\n" : null}
          <Inline line={line} />
        </Fragment>
      ))}
    </Text>
  )
}

/**
 * Assistant replies as structured Markdown (Workshop A2d v2.2, Open reply);
 * the owner's own words stay as typed. Nothing in either is executed.
 */
export function AssistantText({
  text,
  user,
  streaming = false,
}: {
  text: string
  user: boolean
  streaming?: boolean
}) {
  const large = useLargeTextLayout()
  const blocks = useMemo(
    () => (user ? [] : parseMarkdown(text, { streaming })),
    [text, user, streaming],
  )
  if (user)
    return (
      <Text selectable className={BODY}>
        {text}
      </Text>
    )
  return (
    <View className="gap-2.5">
      {blocks.map((block, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks keep their order
        <Block key={index} block={block} large={large} />
      ))}
    </View>
  )
}
