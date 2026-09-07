import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/context/SessionContext";
import { useColors } from "@/hooks/useColors";
import { getGetMyDogQueryKey, useGetMyDog } from "@workspace/api-client-react";
import { ActionButton } from "@/components/Brand";
export default function Index() { const { ready, user } = useSession(); const c = useColors(); const dog = useGetMyDog({ query: { enabled: ready && !!user?.id, queryKey: getGetMyDogQueryKey() } }); if (!ready || (user?.id && dog.isLoading)) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: c.background }}><ActivityIndicator color={c.primary} /></View>; if (!user?.id) return <Redirect href="/auth" />; if (dog.isError && (dog.error as { status?: number }).status !== 404) return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: c.background, gap: 12 }}><ActivityIndicator color={c.primary}/><ActionButton label="Try again" onPress={()=>dog.refetch()}/></View>; return <Redirect href={dog.data ? "/(tabs)" : "/onboarding"} />; }