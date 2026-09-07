import { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSignIn, useSignUp } from "@workspace/api-client-react";
import { logo, ActionButton } from "@/components/Brand";
import { useColors } from "@/hooks/useColors";
import { useSession } from "@/context/SessionContext";
export default function Auth() {
  const c = useColors(); const router = useRouter(); const { saveSession } = useSession();
  const [signup, setSignup] = useState(false); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const complete = async (data: { accessToken?: string; refreshToken?: string; user: { id: string | null; email: string | null; displayName: string | null }; requiresEmailVerification: boolean; message: string }) => {
    if (!data.accessToken || !data.refreshToken || !data.user.id) { Alert.alert("Check your inbox", data.message); return; }
    await saveSession(data.accessToken, data.refreshToken, data.user); router.replace("/(tabs)");
  };
  const request = { headers: { "X-SniffTown-Client": "mobile" } };
  const signin = useSignIn({ request, mutation: { onSuccess: complete, onError: () => Alert.alert("Couldn’t sign in", "Check your email and password, then try again.") } });
  const create = useSignUp({ request, mutation: { onSuccess: complete, onError: () => Alert.alert("Couldn’t create account", "Please try a different email or stronger password.") } });
  const submit = () => { if (!email.trim() || password.length < 8) { Alert.alert("A few details needed", "Enter a valid email and an 8-character password."); return; } (signup ? create : signin).mutate({ data: { email: email.trim(), password } }); };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.root, { backgroundColor: c.background }]}><View style={s.card}><Image source={logo} style={s.logo} /><Text style={[s.title, { color: c.foreground }]}>{signup ? "Join the neighborhood" : "Welcome back"}</Text><Text style={[s.copy, { color: c.mutedForeground }]}>Austin is better with a trusted dog pack nearby.</Text><TextInput testID="email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email address" placeholderTextColor={c.mutedForeground} value={email} onChangeText={setEmail} style={[s.input, { color: c.foreground, borderColor: c.input, backgroundColor: c.card }]} /><TextInput testID="password" secureTextEntry autoComplete={signup ? "new-password" : "password"} placeholder="Password" placeholderTextColor={c.mutedForeground} value={password} onChangeText={setPassword} style={[s.input, { color: c.foreground, borderColor: c.input, backgroundColor: c.card }]} /><ActionButton label={signup ? "Create account" : "Sign in"} onPress={submit} disabled={signin.isPending || create.isPending} /><Text onPress={() => setSignup(!signup)} style={[s.switch, { color: c.accentForeground }]}>{signup ? "Already a member? Sign in" : "New to SniffTown? Create an account"}</Text></View></KeyboardAvoidingView>;
}
const s = StyleSheet.create({ root: { flex: 1, justifyContent: "center", padding: 24 }, card: { alignItems: "center", gap: 14 }, logo: { width: 106, height: 106, borderRadius: 53, marginBottom: 4 }, title: { fontFamily: "Georgia", fontWeight: "700", fontSize: 31 }, copy: { textAlign: "center", fontSize: 16, lineHeight: 23, marginBottom: 12 }, input: { alignSelf: "stretch", borderWidth: 1, borderRadius: 14, minHeight: 52, paddingHorizontal: 15, fontSize: 16 }, switch: { marginTop: 9, fontWeight: "700" } });