import { Feather } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export const logo = require("../assets/images/snifftown-logo.png");
export function BrandMark({ compact = false }: { compact?: boolean }) {
  const c = useColors();
  return <View style={styles.brand}><Image source={logo} style={[styles.logo, compact && styles.compact]} /><Text style={[styles.word, { color: c.foreground }]}>SniffTown</Text></View>;
}
export function ActionButton({ label, onPress, secondary, disabled, icon }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: keyof typeof Feather.glyphMap }) {
  const c = useColors();
  return <Pressable testID={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? c.secondary : c.primary, opacity: disabled ? .45 : pressed ? .75 : 1 }]}>
    {icon && <Feather name={icon} size={17} color={secondary ? c.foreground : c.primaryForeground} />}
    <Text style={[styles.buttonText, { color: secondary ? c.foreground : c.primaryForeground }]}>{label}</Text>
  </Pressable>;
}
export function DogAvatar({ name, uri, size = 56 }: { name: string; uri?: string | null; size?: number }) {
  const c = useColors();
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.accentForeground, fontWeight: "700" }}>{name.slice(0, 2).toUpperCase()}</Text></View>;
}
const styles = StyleSheet.create({ brand: { flexDirection: "row", alignItems: "center", gap: 8 }, logo: { width: 38, height: 38, borderRadius: 19 }, compact: { width: 30, height: 30, borderRadius: 15 }, word: { fontSize: 22, fontWeight: "800", fontFamily: "Georgia" }, button: { minHeight: 46, paddingHorizontal: 17, borderRadius: 23, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, buttonText: { fontWeight: "800", fontSize: 15 }, });