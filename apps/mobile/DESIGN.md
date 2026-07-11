# Ewatrade Mobile Design Notes

## Purpose

`apps/mobile` is the Expo starter for Ewatrade's small-business sales and inventory workflows. It should feel fast, calm, and operational: clear cards, strong status cues, thumb-friendly controls, and dense-but-readable information for repeated phone use.

## Current System

- App: `apps/mobile`
- Router: Expo Router under `src/app`
- Tokens: `src/lib/theme.ts` and `src/styles/global.css`
- Styling: NativeWind class names with React Native styles only when needed
- Icons: `@hugeicons/react-native` through `src/components/ui/icon.tsx`
- Common primitives: `Pressable`, `Button`, `Text`, `View`, inputs, switches, tabs, alerts

## Direction

- Use the saved Smart Sales & Order Management mobile reference as inspiration for onboarding, sales status, analytics cards, and quick actions.
- Adapt the visual direction toward inventory custody, sales reps, orders, low-stock alerts, and closeout readiness.
- Keep API/auth placeholders honest until production mobile auth and Retail Ops tRPC procedures are implemented.
