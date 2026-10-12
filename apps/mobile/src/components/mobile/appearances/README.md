# Mobile presentation modules

`classic/` holds the presentation for screens whose layout was extracted from
their feature controller. Feature controllers (for example
`mobile/orders/orders-screen.tsx` or `mobile/create-sale/use-create-sale.ts`) own
queries, mutations, auth, navigation and local form state, and pass current state
and callbacks into these views. Expo routes stay thin.

`workflow-chrome.tsx` is the shared full-screen workflow frame used by Create
Sale and Closeout through their feature wrappers.

## Implementation rules

Use className with semantic colors. Do not mix className and inline style on an
element; carry measured or safe-area values through scoped NativeWind variables.
The installed styled `FlatList`/`ScrollView` map `contentContainerClassName`
separately from `className`.

Extracted text uses `[-rn-line-height:N]` when preserving an exact original
native line height. The installed NativeWind theme overrides numeric `leading-*`
as unitless CSS; the installed react-native-css custom `-rn-` property path
directly maps numeric values to native properties. Choice labels similarly use
`[-rn-include-font-padding:false]` and `[-rn-text-align-vertical:center]` to
retain Android-safe text metrics without inline style.
