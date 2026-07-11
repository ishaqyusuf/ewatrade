import { Stack } from "expo-router";

import NotFound from "@/screens/not-found";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <NotFound />
    </>
  );
}
