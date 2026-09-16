import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import Parks from "../app/(tabs)/parks";
import { getParkListViewerQueryKey } from "../lib/park-pack";

// Render the actual screen and generated API hooks. Only native device/UI
// adapters and the signed-in session are replaced; fetch is the API boundary.
vi.mock("react-native", () => ({
  View: "View", Text: "Text", TextInput: "TextInput",
  Pressable: "Pressable", RefreshControl: "RefreshControl",
  Platform: { OS: "ios" },
  StyleSheet: { create: (styles) => styles },
  FlatList: ({ data, ListHeaderComponent, renderItem }) => (
    <>{ListHeaderComponent}{data.map((item) => <React.Fragment key={item.id}>{renderItem({ item })}</React.Fragment>)}</>
  ),
}));
vi.mock("@expo/vector-icons", () => ({ Feather: () => null }));
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(), notificationAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-native-keyboard-controller", () => ({ KeyboardAwareScrollView: "ScrollView" }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
vi.mock("@/context/SessionContext", () => ({
  useSession: () => ({ ready: true, user: { id: "creator-test-user" } }),
}));
vi.mock("@/hooks/useColors", () => ({ useColors: () => ({}) }));
vi.mock("@/components/Brand", () => ({
  BrandMark: () => null,
  ActionButton: ({ label, ...props }) => <button {...props}>{label}</button>,
}));

let screen;
let client;
let requests;
let storedParks;
let duplicate;
const text = () => JSON.stringify(screen.toJSON());
const byId = (id) => screen.root.findByProps({ testID: id });
const submit = () => screen.root.findAllByType("button").find((node) => node.props.children === "Start this park pack");
const press = async (node) => { await act(async () => node.props.onPress()); };
const fill = async (id, value) => { await act(async () => byId(id).props.onChangeText(value)); };
async function settle(assertion) {
  // Query notifications are batched onto timers; keep their renders inside act.
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    assertion();
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  requests = [];
  storedParks = [];
  duplicate = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  setAuthTokenGetter(() => "test-only-session");
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const method = init?.method ?? "GET";
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-only-session");
    expect(String(url)).toBe("/api/parks");
    requests.push({ method, body: init?.body ? JSON.parse(init.body) : undefined });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (method === "GET") return json(storedParks);
    if (method === "POST") {
      if (duplicate) return json({ error: "A local park pack already exists for that park or address." }, 409);
      const park = {
        id: "created-park", ...JSON.parse(init.body), city: "Austin", state: "TX",
        offLeash: false, communityCreated: true, memberCount: 1, isMember: true, isCreator: true,
      };
      storedParks = [park];
      return json(park, 201);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }));
});

afterEach(async () => {
  if (screen) await act(async () => screen.unmount());
  screen = undefined;
  client.clear();
  setAuthTokenGetter(null);
  vi.unstubAllGlobals();
});

async function openForm() {
  await act(async () => { screen = create(<QueryClientProvider client={client}><Parks /></QueryClientProvider>); });
  await settle(() => expect(screen.root.findAllByProps({ testID: "start-park-pack" })).toHaveLength(1));
  await press(byId("start-park-pack"));
  expect(byId("park-pack-name").props.value).toBe("");
}

describe("signed-in mobile park-pack creation", () => {
  it("submits trimmed details, refetches the viewer's list, and renders the joined creator", async () => {
    await openForm();
    await fill("park-pack-name", "  Neighborhood Test Park  ");
    await fill("park-pack-address", "  123 Test St, Austin, TX  ");
    await fill("park-pack-description", "  Meet at sunset.  ");
    await press(submit());
    await settle(() => expect(text()).toContain("Pack creator"));
    expect(requests).toEqual([
      { method: "GET", body: undefined },
      { method: "POST", body: { name: "Neighborhood Test Park", address: "123 Test St, Austin, TX", description: "Meet at sunset." } },
      { method: "GET", body: undefined },
    ]);
    expect(byId("open-park-created-park")).toBeTruthy();
    expect(text()).toContain("Neighborhood Test Park");
    expect(text()).toContain("neighbor");
    expect(client.getQueryData(getParkListViewerQueryKey("creator-test-user"))).toEqual([
      expect.objectContaining({ isMember: true, isCreator: true, memberCount: 1 }),
    ]);
    const creatorButton = screen.root.findAllByType("button").find((node) => node.props.children === "Pack creator");
    expect(creatorButton.props.disabled).toBe(true);
    expect(screen.root.findAllByProps({ testID: "park-pack-name" })).toHaveLength(0);
    await press(byId("start-park-pack"));
    for (const id of ["park-pack-name", "park-pack-address", "park-pack-description"]) expect(byId(id).props.value).toBe("");
  });

  it.each([
    ["  ab  ", "123 Test St", "Enter a park name with at least 3 characters."],
    ["Test Park", " 1234 ", "Enter the park’s Austin street address."],
  ])("shows local guidance for short fields (%s / %s) without POSTing", async (name, address, guidance) => {
    await openForm();
    await fill("park-pack-name", name);
    await fill("park-pack-address", address);
    await press(submit());
    expect(screen.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe(guidance);
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("shows the specific 409 explanation, retains input, and permits a corrected retry", async () => {
    duplicate = true;
    await openForm();
    await fill("park-pack-name", "Existing Test Park");
    await fill("park-pack-address", "123 Test St");
    await press(submit());
    await settle(() => expect(text()).toContain("A park pack already exists for that park or address."));
    expect(byId("park-pack-name").props.value).toBe("Existing Test Park");
    expect(byId("park-pack-address").props.value).toBe("123 Test St");
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
    expect(requests[1].body).not.toHaveProperty("description");
    expect(submit().props.disabled).toBe(false);
    duplicate = false;
    await fill("park-pack-name", "Different Test Park");
    await fill("park-pack-address", "456 Test St");
    await press(submit());
    await settle(() => expect(text()).toContain("Pack creator"));
    expect(text()).not.toContain("already exists");
  });
});