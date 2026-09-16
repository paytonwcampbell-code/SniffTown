import { Feather } from "@expo/vector-icons";
import {
  getListConversationsQueryKey,
  getListNotificationsQueryKey,
  type Notification,
  useListConversations,
  useListNotifications,
  useMarkNotificationRead,
} from "@workspace/api-client-react";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { DogAvatar } from "@/components/Brand";
import { useSession } from "@/context/SessionContext";
import { useColors } from "@/hooks/useColors";

const MODERATION_ALERT_TITLE = "Park pack post needs review";
const MODERATION_ALERT_BODY = "A new report is waiting in the moderation queue.";

function formatAlertDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NotificationCard({
  notification,
  onPress,
}: {
  notification: Notification;
  onPress: (notification: Notification) => void;
}) {
  const c = useColors();
  const isRead = Boolean(notification.readAt);

  return (
    <Pressable
      testID={`notification-${notification.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${MODERATION_ALERT_TITLE}${isRead ? "" : ", new"}`}
      accessibilityState={{ selected: isRead }}
      onPress={() => onPress(notification)}
      style={({ pressed }) => [
        styles.notificationCard,
        {
          backgroundColor: isRead ? c.card : c.secondary,
          borderColor: isRead ? c.border : c.primary,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View style={[styles.notificationIcon, { backgroundColor: isRead ? c.secondary : c.accent }]}>
        <Feather name="shield" size={18} color={isRead ? c.foreground : c.accentForeground} />
      </View>
      <View style={styles.notificationCopy}>
        <View style={styles.notificationTitleRow}>
          <Text style={[styles.notificationTitle, { color: c.foreground }]}>
            {MODERATION_ALERT_TITLE}
          </Text>
          {!isRead && (
            <Text style={[styles.newLabel, { color: c.primary }]}>NEW</Text>
          )}
        </View>
        <Text style={[styles.notificationBody, { color: c.mutedForeground }]}>
          {MODERATION_ALERT_BODY}
        </Text>
        <Text style={[styles.notificationDate, { color: c.mutedForeground }]}>
          {formatAlertDate(notification.createdAt)}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.mutedForeground} />
    </Pressable>
  );
}

export default function Inbox() {
  const c = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { ready, user } = useSession();
  const viewerId = user?.id ?? null;
  const notificationsQueryKey = [
    ...getListNotificationsQueryKey(),
    "viewer",
    viewerId,
  ] as const;
  const conversationsQueryKey = [
    ...getListConversationsQueryKey(),
    "viewer",
    viewerId,
  ] as const;
  const notifications = useListNotifications({
    query: {
      enabled: ready && Boolean(viewerId),
      queryKey: notificationsQueryKey,
    },
  });
  const conversations = useListConversations({
    query: {
      enabled: ready && Boolean(viewerId),
      queryKey: conversationsQueryKey,
    },
  });
  const [notificationActionError, setNotificationActionError] = useState<string | null>(null);
  const markNotificationRead = useMarkNotificationRead({
    mutation: {
      onSuccess: (result, variables) => {
        queryClient.setQueryData<Notification[]>(
          notificationsQueryKey,
          (current) =>
            current?.map((notification) =>
              notification.id === variables.notificationId
                ? { ...notification, readAt: result.readAt }
                : notification,
            ),
        );
      },
      onError: () => {
        setNotificationActionError(
          "We couldn't update this alert, but you can still review the moderation queue.",
        );
      },
    },
  });

  useFocusEffect(
    useCallback(() => {
      if (!ready || !viewerId) return;
      void notifications.refetch();
      void conversations.refetch();
    }, [conversations.refetch, notifications.refetch, ready, viewerId]),
  );

  const openNotification = (notification: Notification) => {
    if (
      notification.type !== "park_post_report" ||
      notification.data.screen !== "moderation" ||
      !notification.data.parkId
    ) {
      setNotificationActionError("This alert is no longer available.");
      return;
    }
    setNotificationActionError(null);
    if (!notification.readAt) {
      markNotificationRead.mutate({
        notificationId: notification.id,
        data: { revision: notification.revision },
      });
    }
    router.push(`/park/${notification.data.parkId}?screen=moderation`);
  };

  const notificationSection = (
    <View style={styles.alertSection}>
      <View style={styles.alertHeading}>
        <View style={styles.alertHeadingCopy}>
          <View style={styles.alertTitleRow}>
            <Feather name="bell" size={18} color={c.primary} />
            <Text style={[styles.alertTitle, { color: c.foreground }]}>Moderation alerts</Text>
          </View>
          <Text style={[styles.alertSubtitle, { color: c.mutedForeground }]}>
            Private alerts for park packs you help moderate.
          </Text>
        </View>
        {notifications.isFetching && !notifications.isLoading && (
          <Text style={[styles.loadingLabel, { color: c.mutedForeground }]}>Refreshing…</Text>
        )}
      </View>
      {!!notificationActionError && (
        <Text accessibilityRole="alert" style={[styles.alertError, { color: c.destructive }]}>
          {notificationActionError}
        </Text>
      )}
      {!ready || !viewerId || notifications.isLoading ? (
        <Text style={[styles.alertStatus, { color: c.mutedForeground }]}>Checking alerts…</Text>
      ) : notifications.isError ? (
        <View style={styles.alertStatusGroup}>
          <Text style={[styles.alertStatus, { color: c.destructive }]}>
            We couldn’t load moderation alerts right now.
          </Text>
          <Pressable
            testID="retry-notifications"
            onPress={() => void notifications.refetch()}
            disabled={notifications.isFetching}
            style={({ pressed }) => ({ opacity: pressed || notifications.isFetching ? 0.55 : 1 })}
          >
            <Text style={[styles.retryText, { color: c.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : notifications.data?.length ? (
        <View style={styles.alertList}>
          {notifications.data.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onPress={openNotification}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.alertStatus, { color: c.mutedForeground }]}>
          No moderation alerts right now.
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.foreground }]}>Inbox</Text>
      <FlatList
        data={conversations.data ?? []}
        keyExtractor={(conversation) => conversation.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={notificationSection}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: c.foreground }]}>No conversations yet</Text>
            <Text style={{ color: c.mutedForeground }}>
              Match with a dog to start planning a walk.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/conversation/${item.id}`)}
            style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
          >
            <DogAvatar name={item.otherDogName ?? "Neighbor"} uri={item.otherDogPhotoUrl} />
            <View style={styles.conversationCopy}>
              <Text style={[styles.name, { color: c.foreground }]}>
                {item.otherDogName ?? "Neighborhood dog"}
              </Text>
              <Text style={{ color: c.mutedForeground }}>
                with {item.otherOwnerName ?? "a neighbor"}
              </Text>
              <Text numberOfLines={1} style={{ color: c.mutedForeground }}>
                {item.lastMessage ?? "Say hello and plan a playdate."}
              </Text>
            </View>
            {item.unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: c.primary }]}>
                <Text style={{ color: c.primaryForeground }}>{item.unreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: Platform.OS === "web" ? 67 : 62 },
  title: {
    fontFamily: "Georgia",
    fontWeight: "700",
    fontSize: 31,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 110 },
  alertSection: { gap: 10, marginBottom: 8 },
  alertHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  alertHeadingCopy: { flex: 1, gap: 3 },
  alertTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  alertTitle: { fontSize: 18, fontWeight: "800" },
  alertSubtitle: { fontSize: 13, lineHeight: 18 },
  loadingLabel: { fontSize: 12, fontWeight: "700" },
  alertError: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  alertStatusGroup: { gap: 5 },
  alertStatus: { fontSize: 13, lineHeight: 18 },
  retryText: { fontSize: 13, fontWeight: "800" },
  alertList: { gap: 8 },
  notificationCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  notificationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: { flex: 1, gap: 3 },
  notificationTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  notificationTitle: { flex: 1, fontSize: 14, fontWeight: "800" },
  newLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  notificationBody: { fontSize: 13, lineHeight: 18 },
  notificationDate: { fontSize: 11, marginTop: 2 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  conversationCopy: { flex: 1, gap: 3 },
  name: { fontWeight: "800", fontSize: 16 },
  badge: {
    borderRadius: 12,
    minWidth: 23,
    height: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { padding: 45, alignItems: "center", gap: 8 },
  emptyTitle: { fontFamily: "Georgia", fontWeight: "700", fontSize: 22 },
});