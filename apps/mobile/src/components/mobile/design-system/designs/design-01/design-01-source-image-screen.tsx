import { ActionButton } from "@/components/mobile/action-button";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useCallback, useState } from "react";
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { ReferenceScreenShell } from "../../references/reference-screen-shell";
import {
  DESIGN_01_ADMIN_MORE_REFERENCE,
  DESIGN_01_PRIMARY_REFERENCE,
  DESIGN_01_ROUTES,
  type Design01ReferenceImage,
} from "./design-01.data";

export function Design01SourceImageScreen({
  reference = DESIGN_01_PRIMARY_REFERENCE,
}: {
  reference?: Design01ReferenceImage;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const [isBoardPanned, setIsBoardPanned] = useState(false);
  const asset = Image.resolveAssetSource(reference.source);
  const aspectRatio = asset.width / asset.height;
  const isLandscapeBoard = aspectRatio > 1;
  const implementationLabel = reference.implementationLabel ?? "Design 01 home";
  const implementationRoute =
    reference.implementationRoute ?? DESIGN_01_ROUTES.home;
  const reviewImageWidth = isLandscapeBoard
    ? Math.max(viewportWidth * 2.4, 840)
    : Math.max(viewportWidth - 48, 1);
  const reviewImageHeight = reviewImageWidth / aspectRatio;
  const handleBoardScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIsBoardPanned(event.nativeEvent.contentOffset.x > 8);
    },
    [],
  );

  return (
    <ReferenceScreenShell
      forceFabsHidden={isBoardPanned}
      hideFabsOnScroll
      secondaryAccessibilityLabel={`Open ${implementationLabel}`}
      secondaryHref={implementationRoute}
      secondaryIcon="LayoutDashboard"
    >
      <View className="gap-5">
        <View className="gap-1">
          <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
            {reference.sourceLabel}
          </Text>
          <Text className="text-3xl font-extrabold leading-9 text-foreground">
            Source Image
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Use this fullscreen reference beside the implemented screen while
            checking spacing, hierarchy, and navigation rhythm.
          </Text>
        </View>

        <View className="overflow-hidden rounded-[32px] bg-card">
          {isLandscapeBoard ? (
            <ScrollView
              accessibilityLabel={`${reference.title} horizontal review canvas`}
              horizontal
              nestedScrollEnabled
              onScroll={handleBoardScroll}
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator
            >
              <Image
                accessibilityLabel={`Full ${reference.title} design reference`}
                resizeMode="contain"
                source={reference.source}
                style={{
                  height: reviewImageHeight,
                  width: reviewImageWidth,
                }}
              />
            </ScrollView>
          ) : (
            <Image
              accessibilityLabel={`Full ${reference.title} design reference`}
              resizeMode="contain"
              source={reference.source}
              style={{
                aspectRatio,
                width: "100%",
              }}
            />
          )}
        </View>

        {isLandscapeBoard ? (
          <Text className="text-center text-xs leading-5 text-muted-foreground">
            Swipe horizontally to inspect each screen at review scale.
          </Text>
        ) : null}

        <ActionButton
          href={implementationRoute}
          icon="LayoutDashboard"
          variant="outline"
        >
          Back to {implementationLabel}
        </ActionButton>
      </View>
    </ReferenceScreenShell>
  );
}

export function Design01AdminMoreSourceImageScreen() {
  return (
    <Design01SourceImageScreen reference={DESIGN_01_ADMIN_MORE_REFERENCE} />
  );
}
