import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListBlockedMembersQueryKey,
  getListConversationsQueryKey,
  useBlockMember,
  useReportMember,
  type MemberReportInputContext,
  type MemberReportInputReason,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ActionButton } from "@/components/Brand";
import { useColors } from "@/hooks/useColors";

const REASONS: { value: MemberReportInputReason; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "unsafe", label: "Unsafe or threatening behavior" },
  { value: "inappropriate", label: "Inappropriate photos or content" },
  { value: "spam", label: "Spam or scam" },
  { value: "other", label: "Something else" },
];

function errorMessage(error: unknown, fallback: string) {
  const data = (error as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string" ? data.error : fallback;
}

/** A small header button that opens report/block options for another member. */
export function MemberSafetyButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return <Pressable testID="member-safety" accessibilityRole="button" accessibilityLabel="Report or block" hitSlop={10} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? .6 : 1, padding: 4 })}><Feather name="more-horizontal" size={22} color={c.foreground} /></Pressable>;
}

export function MemberSafetySheet({ visible, onClose, userId, name, context, onBlocked }: { visible: boolean; onClose: () => void; userId: string; name: string; context: MemberReportInputContext; onBlocked?: () => void }) {
  const c = useColors(), qc = useQueryClient();
  const [mode, setMode] = useState<"menu" | "report">("menu"), [reason, setReason] = useState<MemberReportInputReason | null>(null), [details, setDetails] = useState("");
  const close = () => { setMode("menu"); setReason(null); setDetails(""); onClose(); };
  const block = useBlockMember({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListConversationsQueryKey() }); qc.invalidateQueries({ queryKey: getListBlockedMembersQueryKey() }); close(); Alert.alert("Blocked", `You and ${name} can no longer message each other. You can unblock them anytime in Settings.`); onBlocked?.(); }, onError: error => Alert.alert("Couldn't block", errorMessage(error, "Please try again.")) } });
  const report = useReportMember({ mutation: { onSuccess: () => { close(); Alert.alert("Report sent", `Thanks for keeping SniffTown safe. Our team reviews every report within 24 hours. Do you also want to block ${name}?`, [{ text: "Not now", style: "cancel" }, { text: "Block", style: "destructive", onPress: () => block.mutate({ userId }) }]); }, onError: error => Alert.alert("Couldn't send report", errorMessage(error, "Please try again.")) } });
  const confirmBlock = () => Alert.alert(`Block ${name}?`, "They won't be able to message you, and your conversation will be hidden. They won't be told.", [{ text: "Cancel", style: "cancel" }, { text: "Block", style: "destructive", onPress: () => block.mutate({ userId }) }]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Close" />
    <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
      {mode === "menu" ? <>
        <Text style={[s.title, { color: c.foreground }]}>{name}</Text>
        <ActionButton label={`Report ${name}`} icon="flag" secondary onPress={() => setMode("report")} />
        <ActionButton label={`Block ${name}`} icon="slash" secondary disabled={block.isPending} onPress={confirmBlock} />
        <ActionButton label="Cancel" secondary onPress={close} />
      </> : <>
        <Text style={[s.title, { color: c.foreground }]}>What's going on?</Text>
        <Text style={{ color: c.mutedForeground }}>Your report is private. {name} won't know who sent it.</Text>
        {REASONS.map(option => <Pressable key={option.value} testID={`reason-${option.value}`} accessibilityRole="radio" accessibilityState={{ selected: reason === option.value }} onPress={() => setReason(option.value)} style={[s.reason, { borderColor: reason === option.value ? c.primary : c.border, backgroundColor: reason === option.value ? c.accent : c.card }]}><Feather name={reason === option.value ? "check-circle" : "circle"} size={18} color={reason === option.value ? c.primary : c.mutedForeground} /><Text style={{ color: c.foreground, fontWeight: "600" }}>{option.label}</Text></Pressable>)}
        <TextInput value={details} onChangeText={setDetails} maxLength={500} multiline placeholder="Anything else we should know? (optional)" placeholderTextColor={c.mutedForeground} style={[s.input, { color: c.foreground, borderColor: c.input }]} />
        <ActionButton label="Send report" disabled={!reason || report.isPending} onPress={() => reason && report.mutate({ userId, data: { context, reason, ...(details.trim() ? { details: details.trim() } : {}) } })} />
        <ActionButton label="Back" secondary onPress={() => setMode("menu")} />
      </>}
    </View>
  </Modal>;
}

const s = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.35)" }, sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 36, gap: 10 }, title: { fontFamily: "Georgia", fontWeight: "700", fontSize: 22, marginBottom: 4 }, reason: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 }, input: { borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 70, textAlignVertical: "top", fontSize: 15 } });
