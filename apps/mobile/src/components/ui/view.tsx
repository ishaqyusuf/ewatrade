import { cn } from "@/lib/utils"
import { type VariantProps, cva } from "class-variance-authority"
import * as React from "react"
import { View as RNView } from "react-native"

const viewVariants = cva("", {
  variants: {
    variant: {
      accent: "bg-accent",
      card: "rounded-2xl bg-card",
      default: "",
      muted: "rounded-2xl bg-muted",
      outline: "rounded-2xl border border-input bg-card",
      screen: "bg-background",
      surface: "rounded-2xl bg-card",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

type ViewVariantProps = VariantProps<typeof viewVariants>

type ViewVariant = NonNullable<ViewVariantProps["variant"]>

const ViewClassContext = React.createContext<string | undefined>(undefined)

function View({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof RNView> &
  ViewVariantProps &
  React.RefAttributes<RNView>) {
  const viewClass = React.useContext(ViewClassContext)

  return (
    <RNView
      className={cn(viewVariants({ variant }), viewClass, className)}
      {...props}
    />
  )
}

export { View, ViewClassContext }
