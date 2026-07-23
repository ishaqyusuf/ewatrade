import { MobileScreen } from "@/components/mobile/screen";
import { View } from "@/components/ui/view";
import type { LinkProps } from "expo-router";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { ReferenceFabs } from "./reference-fabs";

type ReferenceScreenShellProps = {
  children: ReactNode;
  forceFabsHidden?: boolean;
  hideFabsOnScroll?: boolean;
  secondaryAccessibilityLabel: string;
  secondaryHref: LinkProps["href"];
  secondaryIcon: ComponentProps<typeof ReferenceFabs>["secondaryIcon"];
};

export function ReferenceScreenShell({
  children,
  forceFabsHidden = false,
  hideFabsOnScroll = false,
  secondaryAccessibilityLabel,
  secondaryHref,
  secondaryIcon,
}: ReferenceScreenShellProps) {
  const [areFabsHidden, setAreFabsHidden] = useState(false);
  const lastScrollY = useRef(0);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!hideFabsOnScroll) return;

      const nextScrollY = Math.max(event.nativeEvent.contentOffset.y, 0);
      const delta = nextScrollY - lastScrollY.current;

      if (nextScrollY < 20) setAreFabsHidden(false);
      else if (delta > 4) setAreFabsHidden(true);
      else if (delta < -4) setAreFabsHidden(false);

      lastScrollY.current = nextScrollY;
    },
    [hideFabsOnScroll],
  );

  return (
    <View className="flex-1 bg-background">
      <MobileScreen
        contentClassName="gap-6 pb-28"
        keyboardBottomOffset={132}
        onScroll={hideFabsOnScroll ? handleScroll : undefined}
        scroll
      >
        {children}
      </MobileScreen>
      <ReferenceFabs
        isHidden={areFabsHidden || forceFabsHidden}
        secondaryAccessibilityLabel={secondaryAccessibilityLabel}
        secondaryHref={secondaryHref}
        secondaryIcon={secondaryIcon}
      />
    </View>
  );
}
