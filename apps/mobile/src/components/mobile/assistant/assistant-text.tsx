import { Text } from "@/components/ui/text"
/** Plain Markdown only: strings stay React text; HTML, URLs and tool parts are never executed. */
export function AssistantText({ text, user }: { text: string; user: boolean }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g)
  return (
    <Text
      selectable
      className={
        user
          ? "text-sm leading-5 text-primary-foreground"
          : "text-sm leading-5 text-foreground"
      }
    >
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={`${index}:${part}`} className="font-bold">
            {part.slice(2, -2)}
          </Text>
        ) : part.startsWith("`") && part.endsWith("`") ? (
          <Text key={`${index}:${part}`} className="font-mono">
            {part.slice(1, -1)}
          </Text>
        ) : part.startsWith("*") && part.endsWith("*") ? (
          <Text key={`${index}:${part}`} className="italic">
            {part.slice(1, -1)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  )
}
