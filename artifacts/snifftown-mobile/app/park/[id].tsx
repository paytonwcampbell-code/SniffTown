import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ParkPackPostReportInput,
  type ParkPackDetail,
  type ParkPackModerators,
  useAppointParkPackModerator,
  useCreateParkPackPost,
  useDeleteParkPackPost,
  useGetParkPackDetail,
  useGetParkPackModerators,
  useListParkPackModerationReports,
  useModerateParkPackPostReport,
  useRemoveParkPackModerator,
  useReportParkPackPost,
  useUpdateParkPackMembership,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
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
  getParkPackModeratorsViewerQueryKey,
  getParkPackModerationReportsViewerQueryKey,
} from "@/lib/park-pack";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const reportReasons: Array<{
  value: ParkPackPostReportInput["reason"];
  label: string;
  description: string;
}> = [
  { value: "spam", label: "Spam", description: "Unwanted promotion or repeated content" },
  { value: "harassment", label: "Harassment", description: "Bullying, threats, or targeted abuse" },
  { value: "unsafe", label: "Unsafe", description: "Could put a dog or neighbor at risk" },
  { value: "other", label: "Other", description: "Something else that needs a review" },
];

function errorStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : null;
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message) return fallback;
  return error.message.replace(/^HTTP \d+(?: [^:]*)?:\s*/, "");
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
  const { id, screen: requestedScreen } = useLocalSearchParams<{
    id: string | string[];
    screen?: string | string[];
  }>();
  const parkId = Array.isArray(id) ? id[0] : id;
  const moderationRequested =
    (Array.isArray(requestedScreen) ? requestedScreen[0] : requestedScreen) === "moderation";
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { ready, user } = useSession();
  const viewerId = user?.id ?? null;
  const [content, setContent] = useState("");
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] =
    useState<ParkPackPostReportInput["reason"]>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [reportedPostIds, setReportedPostIds] = useState<Set<string>>(() => new Set());
  const [reportMessage, setReportMessage] = useState<{
    postId: string;
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [moderationMessage, setModerationMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [moderationLayout, setModerationLayout] = useState<{
    key: string;
    y: number;
  } | null>(null);
  const moderationScrollKey = useRef<string | null>(null);
  const detailQueryKey = getParkPackDetailViewerQueryKey(parkId, viewerId);
  const detail = useGetParkPackDetail(parkId, {
    query: { enabled: ready, queryKey: detailQueryKey },
  });
  const canAccessPrivateContent = canRenderPrivateParkPackContent(viewerId, detail.data);
  const moderators = useGetParkPackModerators(parkId, {
    query: {
      enabled: ready && Boolean(parkId) && canAccessPrivateContent && Boolean(detail.data?.isCreator),
      queryKey: getParkPackModeratorsViewerQueryKey(parkId, viewerId),
    },
  });
  const moderationReports = useListParkPackModerationReports(parkId, {
    query: {
      enabled: ready && Boolean(parkId) && canAccessPrivateContent,
      queryKey: getParkPackModerationReportsViewerQueryKey(parkId, viewerId),
    },
  });
  const park = detail.data;
  const canRenderPrivateContent = Boolean(park) && !detail.isFetching && canAccessPrivateContent;
  const isCreator = canRenderPrivateContent && Boolean(park?.isCreator);
  const moderationForbidden = errorStatus(moderationReports.error) === 403;
  // The detail response intentionally does not disclose designated moderators.
  // A member-only request lets moderators see the queue, while a 403 keeps it
  // completely absent for other members.
  const canReviewReports =
    Boolean(park) &&
    canRenderPrivateContent &&
    !moderationForbidden &&
    (isCreator || moderationReports.isSuccess);
  const visibleModerationReports = (moderationReports.data ?? []).slice(0, 10);
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
  const reportPost = useReportParkPackPost();
  const moderateReport = useModerateParkPackPostReport();
  const appointModerator = useAppointParkPackModerator();
  const removeModerator = useRemoveParkPackModerator();
  const [moderatorActionUserId, setModeratorActionUserId] = useState<string | null>(null);
  const [moderatorMessage, setModeratorMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (
      !moderationRequested ||
      !parkId ||
      !canReviewReports ||
      !moderationLayout
    ) {
      return;
    }
    const key = `${parkId}:moderation`;
    if (moderationLayout.key !== key) return;
    if (moderationScrollKey.current === key) return;
    const timeout = setTimeout(() => {
      if (moderationScrollKey.current === key) return;
      moderationScrollKey.current = key;
      scrollRef.current?.scrollTo({
        y: Math.max(0, moderationLayout.y - 18),
        animated: true,
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [canReviewReports, moderationLayout, moderationRequested, parkId]);

  if (!parkId || detail.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.mutedForeground }}>Loading park pack…</Text>
      </View>
    );
  }

  if (detail.isError || !park) {
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
  const startReport = (postId: string) => {
    if (reportPost.isPending || reportedPostIds.has(postId)) return;
    setReportingPostId(postId);
    setReportReason("spam");
    setReportDetails("");
    setReportMessage(null);
  };
  const submitReport = (postId: string) => {
    const details = reportDetails.trim();
    if (
      reportPost.isPending ||
      reportedPostIds.has(postId) ||
      details.length > 500
    ) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reportPost.mutate(
      {
        parkId,
        postId,
        data: { reason: reportReason, ...(details ? { details } : {}) },
      },
      {
        onSuccess: () => {
          setReportedPostIds((ids) => new Set(ids).add(postId));
          setReportingPostId(null);
          setReportMessage({
            postId,
            tone: "success",
            text: "Thanks. Your report was sent to the pack moderators.",
          });
        },
        onError: (error) => {
          if (errorStatus(error) === 409) {
            setReportedPostIds((ids) => new Set(ids).add(postId));
            setReportingPostId(null);
            setReportMessage({
              postId,
              tone: "success",
              text: "You already reported this post. Thank you for helping keep the pack safe.",
            });
            return;
          }
          setReportMessage({
            postId,
            tone: "error",
            text: errorMessage(error, "We couldn't send your report. Please try again."),
          });
        },
      },
    );
  };
  const confirmModeration = (
    reportId: string,
    action: "hide" | "dismiss",
  ) => {
    if (moderateReport.isPending) return;
    const isHide = action === "hide";
    Alert.alert(
      isHide ? "Hide this post?" : "Dismiss this report?",
      isHide
        ? "This removes the post from the pack board. This action cannot be undone."
        : "This closes the report and leaves the post visible.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isHide ? "Hide post" : "Dismiss report",
          style: isHide ? "destructive" : "default",
          onPress: () => {
            setModerationMessage(null);
            moderateReport.mutate(
              { parkId, reportId, data: { action } },
              {
                onSuccess: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setModerationMessage(
                    isHide ? "Post hidden from the pack board." : "Report dismissed.",
                  );
                  refreshDetail();
                  moderationReports.refetch();
                },
                onError: (error: unknown) => {
                  setModerationMessage(
                    errorMessage(error, "We couldn't save that moderation action. Please try again."),
                  );
                },
              },
            );
          },
        },
      ],
    );
  };
  const confirmModeratorChange = (member: {
    userId: string;
    displayName: string;
    isModerator: boolean;
  }) => {
    if (
      !isCreator ||
      member.userId === moderators.data?.creatorId ||
      appointModerator.isPending ||
      removeModerator.isPending
    ) {
      return;
    }
    const appoint = !member.isModerator;
    Alert.alert(
      appoint ? "Appoint moderator?" : "Remove moderator?",
      appoint
        ? `${member.displayName} will be able to review reports and hide posts in this pack.`
        : `${member.displayName} will no longer be able to review reports or hide posts in this pack.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: appoint ? "Appoint" : "Remove",
          style: appoint ? "default" : "destructive",
          onPress: () => {
            setModeratorActionUserId(member.userId);
            setModeratorMessage(null);
            const mutation = appoint ? appointModerator : removeModerator;
            mutation.mutate(
              { parkId, userId: member.userId },
              {
                onSuccess: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setModeratorActionUserId(null);
                  setModeratorMessage({
                    tone: "success",
                    text: appoint
                      ? `${member.displayName} is now a pack moderator.`
                      : `${member.displayName} is no longer a pack moderator.`,
                  });
                  const moderatorsQueryKey = getParkPackModeratorsViewerQueryKey(parkId, viewerId);
                  queryClient.setQueryData<ParkPackModerators>(
                    moderatorsQueryKey,
                    (current) =>
                      current
                        ? {
                            ...current,
                            members: current.members.map((currentMember) =>
                              currentMember.userId === member.userId
                                ? { ...currentMember, isModerator: appoint }
                                : currentMember,
                            ),
                          }
                        : current,
                  );
                  queryClient.invalidateQueries({
                    queryKey: moderatorsQueryKey,
                  });
                  // A moderator's report access is private viewer state. Refresh both
                  // caches after every role change so a changed permission cannot linger.
                  queryClient.invalidateQueries({
                    queryKey: getParkPackModerationReportsViewerQueryKey(parkId, viewerId),
                  });
                },
                onError: (error: unknown) => {
                  setModeratorActionUserId(null);
                  setModeratorMessage({
                    tone: "error",
                    text: errorMessage(
                      error,
                      appoint
                        ? "We couldn't appoint that moderator. Please try again."
                        : "We couldn't remove that moderator. Please try again.",
                    ),
                  });
                },
              },
            );
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: c.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scrollRef}
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
                        {post.isMine ? (
                          <Pressable
                            testID={`delete-park-post-${post.id}`}
                            accessibilityLabel="Delete post"
                            disabled={deletePost.isPending}
                            onPress={() => deletePost.mutate({ parkId, postId: post.id })}
                            hitSlop={10}
                          >
                            <Feather name="trash-2" size={18} color={c.mutedForeground} />
                          </Pressable>
                        ) : (
                          <Pressable
                            testID={`report-park-post-${post.id}`}
                            accessibilityLabel={reportedPostIds.has(post.id) ? "Post reported" : "Report post"}
                            disabled={reportPost.isPending || reportedPostIds.has(post.id)}
                            onPress={() => startReport(post.id)}
                            hitSlop={10}
                            style={({ pressed }) => [
                              styles.reportTrigger,
                              {
                                borderColor: c.border,
                                opacity:
                                  reportPost.isPending || reportedPostIds.has(post.id)
                                    ? 0.55
                                    : pressed
                                      ? 0.7
                                      : 1,
                              },
                            ]}
                          >
                            <Feather
                              name={reportedPostIds.has(post.id) ? "check" : "flag"}
                              size={14}
                              color={c.mutedForeground}
                            />
                            <Text style={[styles.reportTriggerText, { color: c.mutedForeground }]}>
                              {reportedPostIds.has(post.id) ? "Reported" : "Report"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                      <Text style={[styles.postContent, { color: c.foreground }]}>{post.content}</Text>
                      {reportingPostId === post.id && (
                        <View
                          style={[
                            styles.reportForm,
                            { backgroundColor: c.secondary, borderColor: c.border },
                          ]}
                        >
                          <Text style={[styles.reportTitle, { color: c.foreground }]}>
                            Report this post
                          </Text>
                          <Text style={[styles.reportCopy, { color: c.mutedForeground }]}>
                            Choose the closest reason. Your identity is not shared with the post author.
                          </Text>
                          <View style={styles.reasonList}>
                            {reportReasons.map((reason) => {
                              const selected = reportReason === reason.value;
                              return (
                                <Pressable
                                  key={reason.value}
                                  accessibilityRole="radio"
                                  accessibilityState={{ selected }}
                                  onPress={() => setReportReason(reason.value)}
                                  style={[
                                    styles.reasonOption,
                                    {
                                      borderColor: selected ? c.primary : c.border,
                                      backgroundColor: selected ? c.card : "transparent",
                                    },
                                  ]}
                                >
                                  <Feather
                                    name={selected ? "check-circle" : "circle"}
                                    size={17}
                                    color={selected ? c.primary : c.mutedForeground}
                                  />
                                  <View style={styles.reasonCopy}>
                                    <Text style={[styles.reasonLabel, { color: c.foreground }]}>
                                      {reason.label}
                                    </Text>
                                    <Text style={[styles.reasonDescription, { color: c.mutedForeground }]}>
                                      {reason.description}
                                    </Text>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </View>
                          <TextInput
                            testID={`report-details-${post.id}`}
                            value={reportDetails}
                            onChangeText={setReportDetails}
                            multiline
                            maxLength={500}
                            placeholder="Add details (optional)"
                            placeholderTextColor={c.mutedForeground}
                            style={[
                              styles.reportDetails,
                              { color: c.foreground, borderColor: c.border, backgroundColor: c.card },
                            ]}
                          />
                          <View style={styles.reportFooter}>
                            <Text style={[styles.characterCount, { color: c.mutedForeground }]}>
                              {reportDetails.length}/500
                            </Text>
                            <View style={styles.reportActions}>
                              <Pressable
                                onPress={() => setReportingPostId(null)}
                                disabled={reportPost.isPending}
                                hitSlop={8}
                              >
                                <Text style={[styles.cancelText, { color: c.foreground }]}>Cancel</Text>
                              </Pressable>
                              <ActionButton
                                label={reportPost.isPending ? "Sending…" : "Send report"}
                                disabled={reportPost.isPending}
                                onPress={() => submitReport(post.id)}
                              />
                            </View>
                          </View>
                        </View>
                      )}
                      {reportMessage?.postId === post.id && (
                        <View
                          style={[
                            styles.reportFeedback,
                            {
                              backgroundColor:
                                reportMessage.tone === "success" ? c.secondary : c.card,
                              borderColor:
                                reportMessage.tone === "success" ? c.border : c.destructive,
                            },
                          ]}
                        >
                          <Feather
                            name={reportMessage.tone === "success" ? "check-circle" : "alert-circle"}
                            size={16}
                            color={
                              reportMessage.tone === "success" ? c.foreground : c.destructive
                            }
                          />
                          <Text
                            style={[
                              styles.reportFeedbackText,
                              {
                                color:
                                  reportMessage.tone === "success"
                                    ? c.foreground
                                    : c.destructive,
                              },
                            ]}
                          >
                            {reportMessage.text}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
            {canReviewReports && (
              <View
                testID="park-moderation-queue"
                onLayout={(event) => {
                  const y = event.nativeEvent.layout.y;
                  const key = `${parkId}:moderation`;
                  // This card is a direct child of ScrollView's content container
                  // (the fragment above does not create a native wrapper), so y is
                  // already in the content coordinate space used by scrollTo.
                  setModerationLayout((current) =>
                    current?.key === key && current.y === y ? current : { key, y },
                  );
                }}
                style={[styles.moderationCard, { backgroundColor: c.card, borderColor: c.border }]}
              >
                <View style={styles.sectionHeading}>
                  <View style={styles.moderationHeading}>
                    <View style={[styles.moderationIcon, { backgroundColor: c.secondary }]}>
                      <Feather name="shield" size={17} color={c.foreground} />
                    </View>
                    <View>
                      <Text style={[styles.sectionTitle, { color: c.foreground }]}>Report review</Text>
                      <Text style={[styles.sectionSubtitle, { color: c.mutedForeground }]}>
                        Open reports only · oldest 10 shown
                      </Text>
                    </View>
                  </View>
                  {moderationReports.isFetching && (
                    <Text style={[styles.loadingLabel, { color: c.mutedForeground }]}>Loading…</Text>
                  )}
                </View>
                {moderationMessage && (
                  <Text style={[styles.moderationFeedback, { color: c.foreground }]}>
                    {moderationMessage}
                  </Text>
                )}
                {moderationReports.isError && !moderationForbidden ? (
                  <Text style={[styles.moderationError, { color: c.destructive }]}>
                    {errorMessage(
                      moderationReports.error,
                      "We couldn't load report review. Pull down to try again.",
                    )}
                  </Text>
                ) : visibleModerationReports.length === 0 && !moderationReports.isLoading ? (
                  <Text style={[styles.emptyBoard, { color: c.mutedForeground }]}>
                    No open reports right now.
                  </Text>
                ) : (
                  <View style={styles.moderationReports}>
                    {visibleModerationReports.map((report) => (
                      <View
                        key={report.id}
                        style={[styles.moderationReport, { borderTopColor: c.border }]}
                      >
                        <Text style={[styles.moderationReason, { color: c.foreground }]}>
                          {report.reason.charAt(0).toUpperCase() + report.reason.slice(1)} report
                        </Text>
                        <Text style={[styles.moderationMeta, { color: c.mutedForeground }]}>
                          Post by {report.authorDisplayName} · {formatDate(report.createdAt)}
                        </Text>
                        <Text style={[styles.moderationPost, { color: c.foreground }]}>
                          {report.postContent}
                        </Text>
                        {!!report.details && (
                          <Text style={[styles.moderationDetails, { color: c.mutedForeground }]}>
                            Note: {report.details}
                          </Text>
                        )}
                        <View style={styles.moderationActions}>
                          <Pressable
                            testID={`dismiss-park-report-${report.id}`}
                            disabled={moderateReport.isPending}
                            onPress={() => confirmModeration(report.id, "dismiss")}
                            style={({ pressed }) => [
                              styles.dismissButton,
                              {
                                borderColor: c.border,
                                opacity: moderateReport.isPending ? 0.5 : pressed ? 0.72 : 1,
                              },
                            ]}
                          >
                            <Text style={[styles.dismissText, { color: c.foreground }]}>Dismiss</Text>
                          </Pressable>
                          <Pressable
                            testID={`hide-park-post-${report.id}`}
                            disabled={moderateReport.isPending}
                            onPress={() => confirmModeration(report.id, "hide")}
                            style={({ pressed }) => [
                              styles.hideButton,
                              {
                                backgroundColor: c.destructive,
                                opacity: moderateReport.isPending ? 0.5 : pressed ? 0.72 : 1,
                              },
                            ]}
                          >
                            <Feather name="eye-off" size={15} color={c.primaryForeground} />
                            <Text style={[styles.hideText, { color: c.primaryForeground }]}>Hide post</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            {isCreator && (
              <View style={[styles.moderatorCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.sectionHeading}>
                  <View style={styles.moderationHeading}>
                    <View style={[styles.moderationIcon, { backgroundColor: c.secondary }]}>
                      <Feather name="users" size={17} color={c.foreground} />
                    </View>
                    <View style={styles.moderatorHeadingCopy}>
                      <Text style={[styles.sectionTitle, { color: c.foreground }]}>Pack moderators</Text>
                      <Text style={[styles.sectionSubtitle, { color: c.mutedForeground }]}>
                        Choose members who can review reports.
                      </Text>
                    </View>
                  </View>
                  {moderators.isFetching && (
                    <Text style={[styles.loadingLabel, { color: c.mutedForeground }]}>Loading…</Text>
                  )}
                </View>
                {moderatorMessage && (
                  <View
                    style={[
                      styles.moderatorFeedback,
                      {
                        backgroundColor: moderatorMessage.tone === "success" ? c.secondary : c.card,
                        borderColor:
                          moderatorMessage.tone === "success" ? c.border : c.destructive,
                      },
                    ]}
                  >
                    <Feather
                      name={moderatorMessage.tone === "success" ? "check-circle" : "alert-circle"}
                      size={16}
                      color={
                        moderatorMessage.tone === "success" ? c.foreground : c.destructive
                      }
                    />
                    <Text
                      style={[
                        styles.moderatorFeedbackText,
                        {
                          color:
                            moderatorMessage.tone === "success"
                              ? c.foreground
                              : c.destructive,
                        },
                      ]}
                    >
                      {moderatorMessage.text}
                    </Text>
                  </View>
                )}
                {moderators.isError ? (
                  <View style={styles.moderatorError}>
                    <Text style={[styles.moderationError, { color: c.destructive }]}>
                      {errorMessage(
                        moderators.error,
                        "We couldn't load pack members. Please try again.",
                      )}
                    </Text>
                    <Pressable
                      testID="retry-park-moderators"
                      onPress={() => moderators.refetch()}
                      disabled={moderators.isFetching}
                      style={({ pressed }) => ({ opacity: pressed || moderators.isFetching ? 0.6 : 1 })}
                    >
                      <Text style={[styles.retryText, { color: c.primary }]}>Try again</Text>
                    </Pressable>
                  </View>
                ) : moderators.isLoading ? (
                  <View style={styles.moderatorLoading}>
                    <Feather name="loader" size={16} color={c.mutedForeground} />
                    <Text style={[styles.moderationMeta, { color: c.mutedForeground }]}>
                      Loading pack members…
                    </Text>
                  </View>
                ) : !moderators.data?.members?.length ? (
                  <Text style={[styles.emptyBoard, { color: c.mutedForeground }]}>
                    No other members can be appointed yet.
                  </Text>
                ) : (
                  <View style={styles.moderatorList}>
                    {moderators.data.members.map((member) => {
                      const isPackCreator = member.userId === moderators.data?.creatorId;
                      const isChanging = moderatorActionUserId === member.userId;
                      const canChange = !isPackCreator && !appointModerator.isPending && !removeModerator.isPending;
                      return (
                        <View
                          key={member.userId}
                          style={[styles.moderatorRow, { borderTopColor: c.border }]}
                        >
                          <View style={[styles.moderatorAvatar, { backgroundColor: c.accent }]}>
                            <Feather
                              name={isPackCreator ? "star" : member.isModerator ? "shield" : "user"}
                              size={15}
                              color={c.accentForeground}
                            />
                          </View>
                          <View style={styles.moderatorCopy}>
                            <Text style={[styles.moderatorName, { color: c.foreground }]}>
                              {member.displayName}
                            </Text>
                            <Text style={[styles.moderatorStatus, { color: c.mutedForeground }]}>
                              {isPackCreator
                                ? "Pack creator"
                                : member.isModerator
                                  ? "Moderator"
                                  : "Member"}
                            </Text>
                          </View>
                          {isPackCreator ? (
                            <Feather name="check" size={17} color={c.mutedForeground} />
                          ) : (
                            <Pressable
                              testID={`park-moderator-${member.userId}`}
                              accessibilityRole="button"
                              accessibilityLabel={
                                member.isModerator
                                  ? `Remove ${member.displayName} as moderator`
                                  : `Appoint ${member.displayName} as moderator`
                              }
                              accessibilityState={{ disabled: !canChange, busy: isChanging }}
                              disabled={!canChange}
                              onPress={() => confirmModeratorChange(member)}
                              style={({ pressed }) => [
                                styles.moderatorAction,
                                {
                                  borderColor: member.isModerator ? c.destructive : c.primary,
                                  opacity: !canChange ? 0.45 : pressed ? 0.7 : 1,
                                },
                              ]}
                            >
                              {isChanging ? (
                                <Feather name="loader" size={14} color={c.primary} />
                              ) : (
                                <Feather
                                  name={member.isModerator ? "minus" : "plus"}
                                  size={14}
                                  color={member.isModerator ? c.destructive : c.primary}
                                />
                              )}
                              <Text
                                style={[
                                  styles.moderatorActionText,
                                  { color: member.isModerator ? c.destructive : c.primary },
                                ]}
                              >
                                {isChanging
                                  ? "Saving…"
                                  : member.isModerator
                                    ? "Remove"
                                    : "Appoint"}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
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
  reportTrigger: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 },
  reportTriggerText: { fontSize: 12, fontWeight: "700" },
  reportForm: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 10, marginLeft: 43 },
  reportTitle: { fontSize: 15, fontWeight: "800" },
  reportCopy: { fontSize: 12, lineHeight: 17 },
  reasonList: { gap: 7 },
  reasonOption: { borderWidth: 1, borderRadius: 10, padding: 9, flexDirection: "row", gap: 8, alignItems: "flex-start" },
  reasonCopy: { flex: 1, gap: 1 },
  reasonLabel: { fontSize: 13, fontWeight: "800" },
  reasonDescription: { fontSize: 11, lineHeight: 15 },
  reportDetails: { minHeight: 64, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, textAlignVertical: "top", fontSize: 13 },
  reportFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  reportActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  cancelText: { fontSize: 13, fontWeight: "800" },
  reportFeedback: { marginLeft: 43, borderWidth: 1, borderRadius: 10, padding: 9, flexDirection: "row", alignItems: "flex-start", gap: 7 },
  reportFeedbackText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  moderationCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  moderatorCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  moderationHeading: { flexDirection: "row", gap: 9, alignItems: "center", flex: 1 },
  moderatorHeadingCopy: { flex: 1 },
  moderationIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  loadingLabel: { fontSize: 12, fontWeight: "700" },
  moderationFeedback: { fontSize: 13, fontWeight: "700" },
  moderationError: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  moderationReports: { marginHorizontal: -16 },
  moderationReport: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 13, gap: 6 },
  moderationReason: { fontSize: 14, fontWeight: "800" },
  moderationMeta: { fontSize: 11, lineHeight: 15 },
  moderationPost: { fontSize: 14, lineHeight: 20 },
  moderationDetails: { fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  moderationActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 9, marginTop: 3 },
  dismissButton: { borderWidth: 1, borderRadius: 17, minHeight: 34, paddingHorizontal: 12, justifyContent: "center" },
  dismissText: { fontSize: 12, fontWeight: "800" },
  hideButton: { borderRadius: 17, minHeight: 34, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  hideText: { fontSize: 12, fontWeight: "800" },
  moderatorFeedback: { borderWidth: 1, borderRadius: 10, padding: 9, flexDirection: "row", alignItems: "flex-start", gap: 7 },
  moderatorFeedbackText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  moderatorError: { gap: 7 },
  retryText: { fontSize: 13, fontWeight: "800" },
  moderatorLoading: { flexDirection: "row", alignItems: "center", gap: 8 },
  moderatorList: { marginHorizontal: -16 },
  moderatorRow: { minHeight: 62, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  moderatorAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  moderatorCopy: { flex: 1, gap: 2 },
  moderatorName: { fontSize: 14, fontWeight: "800" },
  moderatorStatus: { fontSize: 11 },
  moderatorAction: { minHeight: 32, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  moderatorActionText: { fontSize: 11, fontWeight: "800" },
});