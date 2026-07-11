import { Text } from "@/components/ui/text";
import { FontAwesome } from "@expo/vector-icons";
import { Link, Stack } from "expo-router";
import { TouchableOpacity, View } from "react-native";

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops! Not Found" }} />
      <View className="flex-1 bg-white justify-center items-center px-8">
        <View className="mb-10 relative w-full h-64 justify-center items-center">
          <View className="absolute w-56 h-56 bg-gray-100 rounded-full opacity-30" />
          <View className="absolute w-40 h-40 bg-blue-100 rounded-full opacity-20" />

          <View className="absolute">
            <Text className="text-9xl font-bold text-gray-200">404</Text>
          </View>
          <View className="absolute bg-white p-6 rounded-full shadow-lg">
            <FontAwesome name="compass" size={48} color="#10B981" />
          </View>
        </View>

        <View className="items-center gap-3 mb-10">
          <Text className="text-3xl font-bold text-[#333] text-center">
            Page Not Found
          </Text>
          <Text className="text-base text-[#666] text-center leading-6 px-4">
            Oops! The page you&apos;re looking for doesn&apos;t exist.
          </Text>
          <Text className="text-base text-[#666] text-center leading-6">
            It might have been moved or deleted.
          </Text>
        </View>

        <Link href="/" asChild>
          <TouchableOpacity className="bg-[#1BC464] px-8 py-4 rounded-2xl shadow-lg active:opacity-80">
            <View className="flex-row items-center gap-2">
              <FontAwesome name="home" size={20} color="white" />
              <Text className="text-white text-lg font-bold">Go Back Home</Text>
            </View>
          </TouchableOpacity>
        </Link>

        {/* Additional Help Text */}
        <Text className="text-sm text-[#999] text-center mt-8">
          Need help? Contact our support team
        </Text>
      </View>
    </>
  );
}
