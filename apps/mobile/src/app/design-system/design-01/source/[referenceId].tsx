import {
  Design01SourceImageScreen,
  getDesign01Reference,
} from "@/components/mobile/design-system/designs/design-01";
import { Redirect, useLocalSearchParams } from "expo-router";

export default function Design01ReferenceSourceRoute() {
  const { referenceId } = useLocalSearchParams<{ referenceId: string }>();
  const reference = getDesign01Reference(referenceId ?? "");

  if (!reference) {
    return <Redirect href="/design-system/design-01/reference" />;
  }

  return <Design01SourceImageScreen reference={reference} />;
}
