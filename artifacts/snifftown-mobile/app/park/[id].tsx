import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ParkPackDetail,
  useCreateParkPackPost,
  useDeleteParkPackPost,
  useGetParkPackDetail,
  useUpdateParkPackMembership,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActionButton, DogAvatar } from "@/components/Brand";
import { useSession } from "@/context/SessionContext";
import { useColors } from "@/hooks/useColors";
import {
  canRenderPrivateParkPackContent,
  getParkListViewerQueryKey,
  getParkPackDetailViewerQueryKey,
} from "@/lib/park-pack";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MemberRow({
  member,
  onPress,
}: {
  member: NonNullable<ParkPackDetail["members"]>[number];
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      testID={`park-member-${member.dogId}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.member,
        { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <DogAvatar name={member.dogName} uri={member.dogPhotoUrl} size={43} />
      <View style={styles.memberCopy}>
        <Text style={[styles.memberName, { color: c.foreground }]}>{member.dogName}</Text>
        <Text style={[styles.memberMeta, { color: c.mutedForeground }]}>View dog profile</Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.mutedForeground} />
    </Pressable>
  );
}

export default function ParkPackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parkId = Array.isArray(id) ? id[0] : id;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { ready, user } = useSession();
  const viewerId = user?.id ?? null;
  const [content, setContent] = useState("");
  const detailQueryKey = getParkPackDetailViewerQueryKey(parkId, viewerId);
  const detail = useGetParkPackDetail(parkId, {
    query: { enabled: ready, queryKey: detailQueryKey },
  });
  const refreshDetail = () =>
    queryClient.invalidateQueries({ queryKey: detailQueryKey });
  const membership = useUpdateParkPackMembership({
    mutation: {
      onSuccess: () => {
        refreshDetail();
        queryClient.invalidateQueries({
          queryKey: getParkListViewerQueryKey(viewerId),
        });
      },
    },
  });
  const createPost = useCreateParkPackPost({
    mutation: {
      onSuccess: () => {
        setContent("");
        refreshDetail();
      },
    },
  });
  const deletePost = useDeleteParkPackPost({
    mutation: { onSuccess: refreshDetail },
  });

  if (!parkId || detail.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.mutedForeground }}>Loading park pack…</Text>
      </View>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Feather name="map-pin" size={28} color={c.mutedForeground} />
        <Text style={[styles.errorTitle, { color: c.foreground }]}>
          This park pack is unavailable.
        </Text>
        <ActionButton label="Try again" onPress={() => detail.refetch()} />
      </View>
    );
  }

  const park = detail.data;
  const canRenderPrivateContent =
    !detail.isFetching && canRenderPrivateParkPackContent(viewerId, park);
  const isCreator = canRenderPrivateContent && park.isCreator;
  const members = canRenderPrivateContent ? park.members ?? [] : [];
  const posts = canRenderPrivateContent ? park.posts ?? [] : [];
  const submitPost = () => {
    const trimmed = content.trim();
    if (!canRenderPrivateContent || !trimmed || createPost.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createPost.mutate({ parkId, data: { content: trimmed } });
  };
  const toggleMembership = () => {
    if (!viewerId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    membership.mutate({
      parkId,
      data: { action: canRenderPrivateContent ? "leave" : "join" },
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: c.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === "web" ? 67 : 18,
            paddingBottom: insets.bottom + 30,
          },
        ]}
      >
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: park.offLeash ? c.accent : c.secondary }]}>
            <Feather
              name={park.offLeash ? "map-pin" : "users"}
              size={24}
              color={park.offLeash ? c.accentForeground : c.foreground}
            />
          </View>
          <View style={styles.heroCopy}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: c.foreground }]}>{park.name}</Text>
              {park.communityCreated && (
                <Text style={[styles.badge, { color: c.accentForeground, backgroundColor: c.accent }]}>
                  COMMUNITY
                </Text>
              )}
            </View>
            {!!park.address && (
              <Text style={[styles.address, { color: c.mutedForeground }]}>{park.address}</Text>
            )}
            <Text style={[styles.memberCount, { color: c.mutedForeground }]}>
              {park.memberCount} {park.memberCount === 1 ? "neighbor" : "neighbors"} in this pack
            </Text>
          </View>
        </View>

        {!!park.description && (
          <Text style={[styles.description, { color: c.foreground }]}>{park.description}</Text>
        )}

        {!canRenderPrivateContent ? (
          <View style={[styles.privateCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.lock, { backgroundColor: c.accent }]}>
              <Feather name="lock" size={18} color={c.accentForeground} />
            </View>
            <Text style={[styles.privateTitle, { color: c.foreground }]}>
              A neighbor-only board
            </Text>
            <Text style={[styles.privateCopy, { color: c.mutedForeground }]}>
              Join this pack to meet the dogs here and see the shared board. Park details stay public.
            </Text>
            <ActionButton
              label="Join park pack"
              icon="plus"
              disabled={membership.isPending}
              onPress={toggleMembership}
            />
          </View>
        ) : (
          <>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={[styles.sectionTitle, { color: c.foreground }]}>Pack neighbors</Text>
                <Text style={[styles.sectionSubtitle, { color: c.mutedForeground }]}>
                  Tap a dog to view their profile.
                </Text>
              </View>
              <Text style={[styles.countPill, { color: c.accentForeground, backgroundColor: c.accent }]}>
                {members.length}
              </Text>
            </View>
            {members.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={{ color: c.mutedForeground }}>You’re the first dog in this pack.</Text>
              </View>
            ) : (
              <View style={styles.members}>
                {members.map((member) => (
                  <MemberRow
                    key={member.dogId}
                    member={member}
                    onPress={() => router.push(`/dog/${member.dogId}`)}
                  />
                ))}
              </View>
            )}

            <View style={[styles.board, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.sectionHeading}>
                <View>
                  <Text style={[styles.sectionTitle, { color: c.foreground }]}>Pack board</Text>
                  <Text style={[styles.sectionSubtitle, { color: c.mutedForeground }]}>
                    Quick notes for the neighborhood.
                  </Text>
                </View>
                <Feather name="message-circle" size={21} color={c.primary} />
              </View>
              <TextInput
                testID="park-post-content"
                value={content}
                onChangeText={setContent}
                multiline
                maxLength={280}
                placeholder="Share a walk plan or park update"
                placeholderTextColor={c.mutedForeground}
                style={[styles.input, { color: c.foreground, borderColor: c.border }]}
              />
              <View style={styles.composeFooter}>
                <Text style={[styles.characterCount, { color: c.mutedForeground }]}>
                  {content.length}/280
                </Text>
                <ActionButton
                  label={createPost.isPending ? "Posting…" : "Post"}
                  icon="send"
                  disabled={!content.trim() || createPost.isPending}
                  onPress={submitPost}
                />
              </View>
              {posts.length === 0 ? (
                <Text style={[styles.emptyBoard, { color: c.mutedForeground }]}>
                  No notes yet. Start the conversation.
                </Text>
              ) : (
                <View style={styles.posts}>
                  {posts.map((post) => (
                    <View key={post.id} style={[styles.post, { borderTopColor: c.border }]}>
                      <View style={styles.postTop}>
                        <Pressable
                          disabled={!post.dogId}
                          onPress={() => post.dogId && router.push(`/dog/${post.dogId}`)}
                          style={styles.postAuthor}
                        >
                          <DogAvatar name={post.dogName ?? "Dog"} uri={post.dogPhotoUrl} size={34} />
                          <View>
                            <Text style={[styles.author, { color: c.foreground }]}>
                              {post.dogName ?? post.authorDisplayName}
                            </Text>
                            <Text style={[styles.postDate, { color: c.mutedForeground }]}>
                              {post.authorDisplayName} · {formatDate(post.createdAt)}
                            </Text>
                          </View>
                        </Pressable>
                        {post.isMine && (
                          <Pressable
                            testID={`delete-park-post-${post.id}`}
                            accessibilityLabel="Delete post"
                            disabled={deletePost.isPending}
                            onPress={() => deletePost.mutate({ parkId, postId: post.id })}
                            hitSlop={10}
                          >
                            <Feather name="trash-2" size={18} color={c.mutedForeground} />
                          </Pressable>
                        )}
                      </View>
                      <Text style={[styles.postContent, { color: c.foreground }]}>{post.content}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            {isCreator ? (
              <View style={[styles.creatorNote, { backgroundColor: c.secondary }]}>
                <Feather name="shield" size={16} color={c.foreground} />
                <Text style={[styles.creatorNoteText, { color: c.foreground }]}>
                  You’re the pack creator. Creators stay members so the pack always has an owner.
                </Text>
              </View>
            ) : (
              <ActionButton
                label="Leave park pack"
                secondary
                icon="log-out"
                disabled={membership.isPending}
                onPress={toggleMembership}
              />
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  errorTitle: { fontFamily: "Georgia", fontSize: 22, fontWeight: "700" },
  hero: { flexDirection: "row", gap: 13, alignItems: "flex-start" },
  heroIcon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 6 },
  titleRow: { flexDirection: "row", gap: 7, alignItems: "flex-start" },
  title: { flex: 1, fontFamily: "Georgia", fontSize: 27, lineHeight: 32, fontWeight: "700" },
  badge: { fontSize: 9, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 4, borderRadius: 9 },
  address: { fontSize: 13, lineHeight: 18 },
  memberCount: { fontSize: 12, fontWeight: "700" },
  description: { fontSize: 15, lineHeight: 22 },
  privateCard: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  lock: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  privateTitle: { fontFamily: "Georgia", fontSize: 21, fontWeight: "700" },
  privateCopy: { fontSize: 14, lineHeight: 20, marginBottom: 3 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontFamily: "Georgia", fontSize: 21, fontWeight: "700" },
  sectionSubtitle: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  countPill: { minWidth: 28, textAlign: "center", fontWeight: "800", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 15 },
  members: { gap: 9 },
  member: { minHeight: 62, borderWidth: 1, borderRadius: 15, padding: 9, flexDirection: "row", alignItems: "center", gap: 10 },
  memberCopy: { flex: 1, gap: 2 },
  memberName: { fontWeight: "800", fontSize: 15 },
  memberMeta: { fontSize: 12 },
  emptyCard: { borderWidth: 1, borderRadius: 15, padding: 15 },
  creatorNote: { borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
  creatorNoteText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  board: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 },
  input: { minHeight: 78, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 11, textAlignVertical: "top", fontSize: 15 },
  composeFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  characterCount: { fontSize: 12 },
  emptyBoard: { fontSize: 14, lineHeight: 20 },
  posts: { marginHorizontal: -16 },
  post: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2, gap: 9 },
  postTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  postAuthor: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1 },
  author: { fontSize: 14, fontWeight: "800" },
  postDate: { fontSize: 11, marginTop: 2 },
  postContent: { fontSize: 15, lineHeight: 21, paddingLeft: 43 },
});