import { type StyleProp, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function SafeArea({
	children,
	style,
}: {
	children: React.ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	const insets = useSafeAreaInsets();

	return (
		<View
			style={[
				style,
				{
					flex: 1,
					paddingTop: insets.top,
				},
			]}
		>
			{children}
		</View>
	);
}
