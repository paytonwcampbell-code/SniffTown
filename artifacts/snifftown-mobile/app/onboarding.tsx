import { Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateDog, getGetMyDogQueryKey, getListDogsQueryKey } from "@workspace/api-client-react";
import { BrandMark } from "@/components/Brand";
import { DogProfileForm } from "@/components/DogProfileForm";
import { useColors } from "@/hooks/useColors";

export default function Onboarding() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useCreateDog({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyDogQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
        router.replace("/(tabs)");
      },
      onError: (error) => Alert.alert("Couldn’t save your dog", error.message),
    },
  });

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <BrandMark />
        <Text style={[styles.title, { color: colors.foreground }]}>First, tell Austin about your dog.</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Keep this profile friendly and fast. You can refine it whenever routines or preferences change.
        </Text>
      </View>
      <DogProfileForm submitLabel="Meet the neighborhood" saving={create.isPending} onSubmit={(data) => create.mutate({ data })} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 58 },
  header: { paddingHorizontal: 22, gap: 10 },
  title: { fontFamily: "Georgia", fontSize: 30, fontWeight: "700", marginTop: 10 },
  copy: { fontSize: 15, lineHeight: 21 },
});