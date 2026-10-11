import { useQueryClient } from "@tanstack/react-query";
import {
  getListBlockedMembersQueryKey,
  getListConversationsQueryKey,
  getListDogsQueryKey,
  useListBlockedMembers,
  useUnblockMember,
} from "@workspace/api-client-react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

import { ActionButton } from "@/components/Brand";
import { useColors } from "@/hooks/useColors";

export default function BlockedMembers() {
  const c = useColors();
  const qc = useQueryClient();
  const blocked = useListBlockedMembers();
  const unblock = useUnblockMember({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBlockedMembersQueryKey() });
        qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        qc.invalidateQueries({ queryKey: getListDogsQueryKey() });
      },
      onError: () => Alert.alert("Couldn't unblock", "Please try again."),
    },
  });

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      contentContainerStyle={s.list}
      data={blocked.data ?? []}
      keyExtractor={(item) => item.userId}
      ListHeaderComponent={
        <Text style={[s.intro, { color: c.mutedForeground }]}>
          Blocked members can't message you and won't appear in your dog
          discovery. They aren't told when you block or unblock them.
        </Text>
      }
      ListEmptyComponent={
        <Text style={[s.empty, { color: c.mutedForeground }]}>
          {blocked.isLoading
            ? "Loading…"
            : blocked.isError
              ? "We couldn't load your blocked members."
              : "You haven't blocked anyone."}
        </Text>
      }
      renderItem={({ item }) => (
        <View style={[s.row, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.name, { color: c.foreground }]}>
            {item.displayName ?? "SniffTown member"}
          </Text>
          <ActionButton
            label="Unblock"
            secondary
            disabled={unblock.isPending}
            onPress={() =>
              Alert.alert(
                `Unblock ${item.displayName ?? "this member"}?`,
                "You'll be able to message each other again.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Unblock", onPress: () => unblock.mutate({ userId: item.userId }) },
                ],
              )
            }
          />
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  list: { padding: 20, gap: 10 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  empty: { textAlign: "center", marginTop: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  name: { flex: 1, fontSize: 16, fontWeight: "700" },
});
