import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type Park,
  useCreateLocalParkPack,
  useListParks,
  useUpdateParkPackMembership,
} from "@workspace/api-client-react";
import { ActionButton, BrandMark } from "@/components/Brand";
import { useSession } from "@/context/SessionContext";
import { useColors } from "@/hooks/useColors";
import { getParkListViewerQueryKey } from "@/lib/park-pack";

type ParkRow = { kind: "heading"; id: string; title: string; subtitle: string } | { kind: "park"; id: string; park: Park };

function getCreateError(error: unknown): string {
  if (error && typeof error === "object") {
    const apiError = error as { status?: number; data?: unknown };
    if (apiError.status === 409) return "A park pack already exists for that park or address.";
    if (apiError.data && typeof apiError.data === "object") {
      const data = apiError.data as Record<string, unknown>;
      const detail = data.error ?? data.message ?? data.detail;
      if (typeof detail === "string" && detail.trim()) return detail;
    }
  }
  return "We couldn’t start this park pack. Check your details and try again.";
}

function ParkCard({ park }: { park: Park }) {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useSession();
  const listQueryKey = getParkListViewerQueryKey(user?.id ?? null);
  const membership = useUpdateParkPackMembership({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: listQueryKey }),
    },
  });

  const toggleMembership = () => {
    if (park.isCreator) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    membership.mutate({ parkId: park.id, data: { action: park.isMember ? "leave" : "join" } });
  };

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={[styles.pin, { backgroundColor: park.offLeash ? c.accent : c.secondary }]}>
        <Feather name={park.offLeash ? "map-pin" : "users"} size={21} color={park.offLeash ? c.accentForeground : c.foreground} />
      </View>
      <View style={styles.cardBody}>
        <Pressable
          testID={`open-park-${park.id}`}
          onPress={() => router.push(`/park/${park.id}`)}
          style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.parkName, { color: c.foreground }]}>{park.name}</Text>
            {park.communityCreated && <Text style={[styles.badge, { color: c.accentForeground, backgroundColor: c.accent }]}>COMMUNITY</Text>}
            <Feather name="chevron-right" size={18} color={c.mutedForeground} />
          </View>
          {!!park.address && <Text style={[styles.address, { color: c.mutedForeground }]}>{park.address}</Text>}
        </Pressable>
        <Text style={[styles.members, { color: c.mutedForeground }]}>{park.memberCount} {park.memberCount === 1 ? "neighbor" : "neighbors"} in this pack</Text>
        <ActionButton label={park.isCreator ? "Pack creator" : park.isMember ? "Joined" : "Join park pack"} secondary={park.isMember} disabled={membership.isPending || park.isCreator} onPress={toggleMembership} icon={park.isCreator ? "shield" : park.isMember ? "check" : "plus"} />
      </View>
    </View>
  );
}

export default function Parks() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { ready, user } = useSession();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const listQueryKey = getParkListViewerQueryKey(user?.id ?? null);
  const parks = useListParks({
    query: {
      enabled: ready,
      queryKey: listQueryKey,
    },
  });
  const createParkPack = useCreateLocalParkPack({
    mutation: {
      onSuccess: async () => {
        setName("");
        setAddress("");
        setDescription("");
        setFormError(null);
        setShowCreate(false);
        await qc.invalidateQueries({ queryKey: listQueryKey });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: (error) => {
        setFormError(getCreateError(error));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    },
  });
  const local = (parks.data ?? []).filter((park) => !park.offLeash);
  const offLeash = (parks.data ?? []).filter((park) => park.offLeash);
  const rows: ParkRow[] = [
    { kind: "heading", id: "local", title: "Local Park Packs", subtitle: "Join neighbors who visit the same Austin parks." },
    ...local.map((park) => ({ kind: "park" as const, id: park.id, park })),
    { kind: "heading", id: "off-leash", title: "Austin Dog Off-Leash Areas", subtitle: "The city’s verified off-leash destinations." },
    ...offLeash.map((park) => ({ kind: "park" as const, id: park.id, park })),
  ];
  const top = Platform.OS === "web" ? 67 : insets.top + 12;

  const submitParkPack = () => {
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const trimmedDescription = description.trim();

    if (trimmedName.length < 3) {
      setFormError("Enter a park name with at least 3 characters.");
      return;
    }
    if (trimmedName.length > 100) {
      setFormError("Keep the park name to 100 characters or fewer.");
      return;
    }
    if (trimmedAddress.length < 5) {
      setFormError("Enter the park’s Austin street address.");
      return;
    }
    if (trimmedAddress.length > 160) {
      setFormError("Keep the address to 160 characters or fewer.");
      return;
    }
    if (trimmedDescription.length > 500) {
      setFormError("Keep the description to 500 characters or fewer.");
      return;
    }

    setFormError(null);
    createParkPack.mutate({
      data: {
        name: trimmedName,
        address: trimmedAddress,
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      },
    });
  };

  const createForm = (
    <View style={[styles.createCard, { backgroundColor: c.card, borderColor: c.border }]}>
      <Pressable
        testID="start-park-pack"
        accessibilityRole="button"
        accessibilityState={{ expanded: showCreate }}
        onPress={() => {
          setShowCreate((current) => !current);
          setFormError(null);
        }}
        style={({ pressed }) => [styles.createToggle, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.createIcon, { backgroundColor: c.accent }]}>
          <Feather name="plus" size={20} color={c.accentForeground} />
        </View>
        <View style={styles.createToggleText}>
          <Text style={[styles.createTitle, { color: c.foreground }]}>Start a park pack</Text>
          <Text style={[styles.createSubtitle, { color: c.mutedForeground }]}>Bring together neighbors at an Austin park.</Text>
        </View>
        <Feather name={showCreate ? "chevron-up" : "chevron-down"} size={20} color={c.mutedForeground} />
      </Pressable>
      {showCreate && (
        <View style={[styles.form, { borderTopColor: c.border }]}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.foreground }]}>Park name</Text>
            <TextInput
              testID="park-pack-name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ramsey Neighborhood Park"
              placeholderTextColor={c.mutedForeground}
              maxLength={100}
              returnKeyType="next"
              style={[styles.input, { color: c.foreground, borderColor: c.input, backgroundColor: c.background }]}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.foreground }]}>Austin address</Text>
            <TextInput
              testID="park-pack-address"
              value={address}
              onChangeText={setAddress}
              placeholder="4301 Rosedale Ave, Austin, TX"
              placeholderTextColor={c.mutedForeground}
              maxLength={160}
              autoCapitalize="words"
              textContentType="fullStreetAddress"
              returnKeyType="next"
              style={[styles.input, { color: c.foreground, borderColor: c.input, backgroundColor: c.background }]}
            />
          </View>
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: c.foreground }]}>Description</Text>
              <Text style={[styles.optional, { color: c.mutedForeground }]}>Optional</Text>
            </View>
            <TextInput
              testID="park-pack-description"
              value={description}
              onChangeText={setDescription}
              placeholder="Share when neighbors meet or what makes this park special."
              placeholderTextColor={c.mutedForeground}
              maxLength={500}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea, { color: c.foreground, borderColor: c.input, backgroundColor: c.background }]}
            />
          </View>
          {!!formError && (
            <View style={[styles.errorBox, { backgroundColor: c.accent }]}>
              <Feather name="alert-circle" size={17} color={c.destructive} />
              <Text accessibilityRole="alert" style={[styles.errorText, { color: c.foreground }]}>{formError}</Text>
            </View>
          )}
          <ActionButton
            label={createParkPack.isPending ? "Starting pack…" : "Start this park pack"}
            icon="users"
            disabled={createParkPack.isPending}
            onPress={submitParkPack}
          />
        </View>
      )}
    </View>
  );

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
          ListHeaderComponent={createForm}
          refreshControl={<RefreshControl refreshing={parks.isRefetching} onRefresh={parks.refetch} tintColor={c.primary} />}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} bottomOffset={70} />}
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
  createCard: { borderWidth: 1, borderRadius: 16, overflow: "hidden", marginBottom: 1 },
  createToggle: { minHeight: 74, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  createIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  createToggleText: { flex: 1, gap: 2 },
  createTitle: { fontSize: 17, fontWeight: "800" },
  createSubtitle: { fontSize: 13, lineHeight: 18 },
  form: { borderTopWidth: 1, padding: 14, gap: 14 },
  field: { gap: 7 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, fontWeight: "800" },
  optional: { fontSize: 12, fontWeight: "600" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 },
  textarea: { minHeight: 92, paddingTop: 12, paddingBottom: 12 },
  errorBox: { padding: 11, borderRadius: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
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