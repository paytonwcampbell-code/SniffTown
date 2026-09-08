import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getListParksQueryKey,
  type Park,
  useListParks,
  useUpdateParkPackMembership,
} from "@workspace/api-client-react";
import { ActionButton, BrandMark } from "@/components/Brand";
import { useColors } from "@/hooks/useColors";

type ParkRow = { kind: "heading"; id: string; title: string; subtitle: string } | { kind: "park"; id: string; park: Park };

function ParkCard({ park }: { park: Park }) {
  const c = useColors();
  const qc = useQueryClient();
  const membership = useUpdateParkPackMembership({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListParksQueryKey() }),
    },
  });

  const toggleMembership = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    membership.mutate({ parkId: park.id, data: { action: park.isMember ? "leave" : "join" } });
  };

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.pin, { backgroundColor: park.offLeash ? c.accent : c.secondary }]}>
        <Feather name={park.offLeash ? "map-pin" : "users"} size={21} color={park.offLeash ? c.accentForeground : c.foreground} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Text style={[styles.parkName, { color: c.foreground }]}>{park.name}</Text>
          {park.communityCreated && <Text style={[styles.badge, { color: c.accentForeground, backgroundColor: c.accent }]}>COMMUNITY</Text>}
        </View>
        {!!park.address && <Text style={[styles.address, { color: c.mutedForeground }]}>{park.address}</Text>}
        <Text style={[styles.members, { color: c.mutedForeground }]}>{park.memberCount} {park.memberCount === 1 ? "neighbor" : "neighbors"} in this pack</Text>
        <ActionButton label={park.isMember ? "Joined" : "Join park pack"} secondary={park.isMember} disabled={membership.isPending} onPress={toggleMembership} icon={park.isMember ? "check" : "plus"} />
      </View>
    </View>
  );
}

export default function Parks() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const parks = useListParks();
  const local = (parks.data ?? []).filter((park) => !park.offLeash);
  const offLeash = (parks.data ?? []).filter((park) => park.offLeash);
  const rows: ParkRow[] = [
    { kind: "heading", id: "local", title: "Local Park Packs", subtitle: "Join neighbors who visit the same Austin parks." },
    ...local.map((park) => ({ kind: "park" as const, id: park.id, park })),
    { kind: "heading", id: "off-leash", title: "Austin Dog Off-Leash Areas", subtitle: "The city’s verified off-leash destinations." },
    ...offLeash.map((park) => ({ kind: "park" as const, id: park.id, park })),
  ];
  const top = Platform.OS === "web" ? 67 : insets.top + 12;

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: top }]}>
        <BrandMark compact />
        <Text style={[styles.kicker, { color: c.accentForeground }]}>YOUR AUSTIN DOG COMMUNITY</Text>
        <Text style={[styles.heading, { color: c.foreground }]}>Find your park pack</Text>
      </View>
      {parks.isLoading ? (
        <Text style={[styles.loading, { color: c.mutedForeground }]}>Finding Austin parks…</Text>
      ) : parks.isError ? (
        <View style={styles.loading}>
          <Text style={{ color: c.foreground }}>We couldn’t load the parks.</Text>
          <ActionButton label="Try again" onPress={() => parks.refetch()} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => `${row.kind}-${row.id}`}
          refreshControl={<RefreshControl refreshing={parks.isRefetching} onRefresh={parks.refetch} tintColor={c.primary} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => item.kind === "heading" ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: c.foreground }]}>{item.title}</Text>
              <Text style={[styles.sectionSubtitle, { color: c.mutedForeground }]}>{item.subtitle}</Text>
            </View>
          ) : <ParkCard park={item.park} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 7 },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  heading: { fontFamily: "Georgia", fontSize: 30, fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  section: { paddingTop: 13, paddingHorizontal: 3, gap: 4 },
  sectionTitle: { fontFamily: "Georgia", fontSize: 22, fontWeight: "700" },
  sectionSubtitle: { fontSize: 14, lineHeight: 19 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", gap: 12 },
  pin: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 7 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  parkName: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: "800" },
  badge: { fontSize: 9, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 4, borderRadius: 9 },
  address: { fontSize: 13, lineHeight: 18 },
  members: { fontSize: 12, fontWeight: "600" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 13, padding: 24 },
});