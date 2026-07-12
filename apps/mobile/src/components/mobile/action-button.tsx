import { Button, type ButtonProps } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ActionButtonProps = ButtonProps & {
  children: ReactNode;
};

export function ActionButton({
  children,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      className={cn("h-12 w-full rounded-xl", className)}
      size="lg"
      {...props}
    >
      <Text className="font-semibold">{children}</Text>
    </Button>
  );
}
