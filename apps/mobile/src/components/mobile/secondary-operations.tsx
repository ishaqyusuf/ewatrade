import { Icon, type IconKeys } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type SecondarySheetHeaderProps = {
  description: string;
  icon: IconKeys;
  title: string;
};

type SecondaryOperationalRowProps = {
  children?: ReactNode;
  className?: string;
  detail: string;
  disabled?: boolean;
  icon?: IconKeys;
  metadata?: string;
  onPress?: () => void;
  selected?: boolean;
  title: string;
  trailing?: ReactNode;
};

export function SecondarySheetHeader({
  description,
  icon,
  title,
}: SecondarySheetHeaderProps) {
  return (
    <View className="gap-3">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-base text-primary" name={icon} />
      </View>
      <View className="gap-2">
        <Text className="text-xl font-extrabold text-foreground">{title}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {description}
        </Text>
      </View>
    </View>
  );
}

export function SecondaryOperationalRow({
  children,
  className,
  detail,
  disabled = false,
  icon,
  metadata,
  onPress,
  selected = false,
  title,
  trailing,
}: SecondaryOperationalRowProps) {
  const containerClassName = cn(
    "gap-3 border-t border-border py-4",
    selected && "bg-primary/5",
    disabled && "opacity-60",
    className,
  );
  const content = (
    <>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-start gap-3">
          {icon ? (
            <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Icon className="size-sm text-muted-foreground" name={icon} />
            </View>
          ) : null}
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-extrabold text-foreground">{title}</Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {detail}
            </Text>
            {metadata ? (
              <Text className="text-xs leading-4 text-muted-foreground">
                {metadata}
              </Text>
            ) : null}
          </View>
        </View>
        {trailing}
      </View>
      {children ? (
        <View className="flex-row flex-wrap items-center gap-2">
          {children}
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View className={containerClassName}>{content}</View>;
  }

  return (
    <Pressable
      className={cn(containerClassName, "active:bg-accent")}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      {content}
    </Pressable>
  );
}
