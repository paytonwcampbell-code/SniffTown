import { Feather } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { getGetMyDogQueryKey, useGetMyDog } from "@workspace/api-client-react";
import { useSession } from "@/context/SessionContext";
export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { ready, user } = useSession();
  const dog = useGetMyDog({ query: { enabled: ready && !!user?.id, queryKey: getGetMyDogQueryKey() } });
  if (ready && !user?.id) return <Redirect href="/auth" />;
  if (ready && !dog.isLoading && !dog.data && (dog.error as { status?: number } | null)?.status === 404) return <Redirect href="/onboarding" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.mutedForeground, tabBarStyle: { height: Platform.OS === "web" ? 84 : 62 + Math.max(insets.bottom, 12), paddingTop: 7, paddingBottom: Platform.OS === "web" ? 12 : Math.max(insets.bottom, 12), backgroundColor: c.card, borderTopColor: c.border }, tabBarItemStyle: { paddingVertical: 2 }, tabBarLabelStyle: { fontWeight: "700", fontSize: 11 } }}>
    <Tabs.Screen name="index" options={{ title: "Discover", tabBarIcon: ({ color }) => <Feather name="compass" size={20} color={color} /> }} />
    <Tabs.Screen name="matches" options={{ title: "Matches", tabBarIcon: ({ color }) => <Feather name="heart" size={20} color={color} /> }} />
    <Tabs.Screen name="parks" options={{ title: "Parks", tabBarIcon: ({ color }) => <Feather name="map-pin" size={20} color={color} /> }} />
    <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: ({ color }) => <Feather name="message-circle" size={20} color={color} /> }} />
    <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color }) => <Feather name="settings" size={20} color={color} /> }} />
  </Tabs>;
}