import { Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyDogQueryKey,
  getListDogsQueryKey,
  useGetMyDog,
  useUpdateMyDog,
} from "@workspace/api-client-react";
import { DogProfileForm } from "@/components/DogProfileForm";
import { useColors } from "@/hooks/useColors";

export default function EditDog() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const dog = useGetMyDog();
  const update = useUpdateMyDog({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyDogQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
        router.back();
      },
      onError: (error) => Alert.alert("Couldn’t update your dog", error.message),
    },
  });

  if (dog.isLoading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.mutedForeground }}>Loading profile…</Text></View>;
  }
  if (dog.isError || !dog.data) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>Add your dog before editing preferences.</Text></View>;
  }
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Refine your dog&apos;s profile</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>Keep meetup and compatibility preferences current.</Text>
      <DogProfileForm initialDog={dog.data} submitLabel="Save profile" saving={update.isPending} onSubmit={(data) => update.mutate({ data })} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 58 },
  title: { fontFamily: "Georgia", fontSize: 29, fontWeight: "700", paddingHorizontal: 22 },
  copy: { paddingHorizontal: 22, marginTop: 8, marginBottom: 5, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});