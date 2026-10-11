import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";

// Render the actual safety sheet and Settings screen with the generated API
// hooks. Native presentation components, alerts and the session are replaced;
// fetch is the API boundary.
const alerts = [];
const session = { deleteAccount: vi.fn(), signOut: vi.fn() };
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock("react-native", () => ({
  View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable",
  Modal: ({ visible, children }) => (visible ? <>{children}</> : null),
  ScrollView: "ScrollView", Switch: "Switch",
  Platform: { OS: "ios" },
  StyleSheet: { create: (styles) => styles },
  Alert: { alert: (title, message, buttons) => alerts.push({ title, message, buttons }) },
}));
vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn() }));
vi.mock("expo-router", () => ({
  useRouter: () => router,
  useFocusEffect: () => undefined,
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ ready: true, user: { id: "me", email: "me@example.test", displayName: "Me" }, ...session }),
}));
vi.mock("@/lib/nearby", () => ({
  getNearbyPreferences: vi.fn(async () => ({ enabled: false })),
  enableNearbyDiscovery: vi.fn(), disableNearbyDiscovery: vi.fn(),
}));
vi.mock("@/hooks/useColors", () => ({ useColors: () => ({}) }));
vi.mock("@/components/Brand", () => ({
  BrandMark: () => null,
  ActionButton: ({ label, ...props }) => <button {...props}>{label}</button>,
}));

const { MemberSafetySheet } = await import("../components/MemberSafety");
const { default: Settings } = await import("../app/(tabs)/settings");
const { openBrowserAsync } = await import("expo-web-browser");

const OTHER = "10000000-0000-4000-8000-000000000002";
let screen;
let requests;
const button = (label) => screen.root.findAllByType("button").find((node) => node.props.children === label);
const press = async (node) => { await act(async () => node.props.onPress()); };
const pressAlert = async (label) => {
  const alert = alerts.at(-1);
  const choice = alert.buttons.find((b) => b.text === label);
  await act(async () => choice.onPress());
};
async function settle(assertion) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    assertion();
  });
}
function render(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  act(() => { screen = create(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  alerts.splice(0);
  requests = [];
  session.deleteAccount = vi.fn(async () => undefined);
  setAuthTokenGetter(() => "test-only-session");
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    requests.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
    if (String(url).endsWith("/reports")) {
      return new Response(JSON.stringify({ reportId: "r1", status: "open" }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    return new Response(null, { status: 204 });
  }));
});

afterEach(() => {
  act(() => screen?.unmount());
  vi.unstubAllGlobals();
});

describe("member safety sheet", () => {
  it("files a private report with the chosen reason and trimmed details", async () => {
    render(<MemberSafetySheet visible onClose={() => undefined} userId={OTHER} name="Sam" context="conversation" />);

    await press(button("Report Sam"));
    expect(button("Send report").props.disabled).toBe(true);
    await press(screen.root.findByProps({ testID: "reason-harassment" }));
    await act(async () => screen.root.findByType("TextInput").props.onChangeText("  Rude messages  "));
    await press(button("Send report"));

    await settle(() => expect(alerts.at(-1)?.title).toBe("Report sent"));
    expect(requests).toEqual([{
      url: `/api/users/${OTHER}/reports`,
      method: "POST",
      body: { context: "conversation", reason: "harassment", details: "Rude messages" },
    }]);
  });

  it("blocks only after the member confirms", async () => {
    const onBlocked = vi.fn();
    render(<MemberSafetySheet visible onClose={() => undefined} userId={OTHER} name="Sam" context="dog_profile" onBlocked={onBlocked} />);

    await press(button("Block Sam"));
    expect(alerts.at(-1).title).toBe("Block Sam?");
    expect(requests).toEqual([]);

    await pressAlert("Block");
    await settle(() => expect(onBlocked).toHaveBeenCalled());
    expect(requests).toEqual([{ url: `/api/users/${OTHER}/block`, method: "PUT", body: undefined }]);
  });
});

describe("settings", () => {
  it("deletes the account only after confirmation and returns to sign in", async () => {
    render(<Settings />);

    await press(screen.root.findByProps({ testID: "delete-account" }));
    expect(alerts.at(-1).title).toBe("Delete your account?");
    expect(session.deleteAccount).not.toHaveBeenCalled();

    await pressAlert("Delete account");
    await settle(() => expect(router.replace).toHaveBeenCalledWith("/auth"));
    expect(session.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it("keeps the member signed in and explains when deletion fails", async () => {
    session.deleteAccount = vi.fn(async () => { throw Object.assign(new Error("fail"), { data: { error: "We could not delete your account right now. Nothing was removed." } }); });
    router.replace.mockClear();
    render(<Settings />);

    await press(screen.root.findByProps({ testID: "delete-account" }));
    await pressAlert("Delete account");
    await settle(() => expect(alerts.at(-1).title).toBe("Couldn't delete account"));
    expect(alerts.at(-1).message).toMatch(/Nothing was removed/);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("links to the privacy policy, terms and blocked members", async () => {
    render(<Settings />);

    await press(button("Privacy Policy"));
    await press(button("Terms of Use"));
    await press(button("Blocked members"));

    expect(openBrowserAsync).toHaveBeenCalledWith("https://snifftown.com/privacy");
    expect(openBrowserAsync).toHaveBeenCalledWith("https://snifftown.com/terms");
    expect(router.push).toHaveBeenCalledWith("/blocked");
  });
});
