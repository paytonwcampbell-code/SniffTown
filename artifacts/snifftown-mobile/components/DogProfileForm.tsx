import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { type Dog, type DogInput, PROFILE_OPTIONS, hasDogCareIntent } from "@workspace/api-client-react";
import { ActionButton } from "@/components/Brand";
import { useColors } from "@/hooks/useColors";

type ProfileState = {
  name: string;
  description: string;
  photoUrl: string;
  dogSex: string;
  size: string;
  temperament: string[];
  lookingFor: string[];
  lookingForNote: string;
  energyLevel: string;
  playStyles: string[];
  compatibleWith: string[];
  notGoodFitWith: string[];
  availability: string[];
  meetupPreferences: string[];
  sittingInterests: string[];
};

type Props = {
  initialDog?: Dog | null;
  submitLabel: string;
  saving?: boolean;
  onSubmit: (data: DogInput) => void;
};

const fromDog = (dog?: Dog | null): ProfileState => ({
  name: dog?.name ?? "",
  description: dog?.description ?? "",
  photoUrl: dog?.photoUrl ?? "",
  dogSex: dog?.dogSex ?? "unknown",
  size: dog?.size ?? "",
  temperament: dog?.temperament ?? [],
  lookingFor: dog?.lookingFor ?? [],
  lookingForNote: dog?.lookingForNote ?? "",
  energyLevel: dog?.energyLevel ?? "",
  playStyles: dog?.playStyles ?? [],
  compatibleWith: dog?.compatibleWith ?? [],
  notGoodFitWith: dog?.notGoodFitWith ?? [],
  availability: dog?.availability ?? [],
  meetupPreferences: dog?.meetupPreferences ?? [],
  sittingInterests: dog?.sittingInterests ?? [],
});

function Chips({
  options,
  values,
  setValues,
  single = false,
  colors,
}: {
  options: readonly { value: string; label: string }[];
  values: string[];
  setValues: (values: string[]) => void;
  single?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <Text
            key={option.value}
            onPress={() =>
              setValues(
                single
                  ? selected
                    ? []
                    : [option.value]
                  : selected
                    ? values.filter((value) => value !== option.value)
                    : [...values, option.value],
              )
            }
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.secondary,
                color: selected ? colors.primaryForeground : colors.secondaryForeground,
              },
            ]}
          >
            {option.label}
          </Text>
        );
      })}
    </View>
  );
}

function Section({
  title,
  description,
  children,
  colors,
}: {
  title: string;
  description: string;
  children: ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>{description}</Text>
      {children}
    </View>
  );
}

export function DogProfileForm({ initialDog, submitLabel, saving = false, onSubmit }: Props) {
  const colors = useColors();
  const [state, setState] = useState<ProfileState>(() => fromDog(initialDog));
  useEffect(() => setState(fromDog(initialDog)), [initialDog]);
  const set = <K extends keyof ProfileState>(key: K, value: ProfileState[K]) =>
    setState((current) => ({ ...current, [key]: value }));
  const careSelected = hasDogCareIntent(state.lookingFor);

  const submit = () => {
    if (!state.name.trim()) return;
    onSubmit({
      name: state.name.trim(),
      description: state.description.trim() || null,
      photoUrl: state.photoUrl.trim() || null,
      dogSex: (state.dogSex || null) as DogInput["dogSex"],
      size: (state.size || null) as DogInput["size"],
      temperament: state.temperament,
      lookingFor: state.lookingFor as DogInput["lookingFor"],
      lookingForNote: state.lookingForNote.trim() || null,
      energyLevel: (state.energyLevel || null) as DogInput["energyLevel"],
      playStyles: state.playStyles as DogInput["playStyles"],
      compatibleWith: state.compatibleWith as DogInput["compatibleWith"],
      notGoodFitWith: state.notGoodFitWith as DogInput["notGoodFitWith"],
      availability: state.availability as DogInput["availability"],
      meetupPreferences: state.meetupPreferences as DogInput["meetupPreferences"],
      sittingInterests: (careSelected ? state.sittingInterests : []) as DogInput["sittingInterests"],
    });
  };

  const inputStyle = [styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }];
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="The basics" description="Keep this quick and recognizable." colors={colors}>
          <TextInput value={state.name} onChangeText={(value) => set("name", value)} placeholder="Dog's name" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
          <TextInput value={state.photoUrl} onChangeText={(value) => set("photoUrl", value)} placeholder="Photo URL (optional)" placeholderTextColor={colors.mutedForeground} style={inputStyle} autoCapitalize="none" />
          <TextInput value={state.description} onChangeText={(value) => set("description", value)} placeholder="A short intro (optional)" placeholderTextColor={colors.mutedForeground} style={[inputStyle, styles.textarea]} multiline maxLength={500} />
        </Section>

        <Section title="What are you looking for?" description="Choose one or more, then refine later." colors={colors}>
          <Chips options={PROFILE_OPTIONS.lookingFor} values={state.lookingFor} setValues={(values) => set("lookingFor", values)} colors={colors} />
          <TextInput value={state.lookingForNote} onChangeText={(value) => set("lookingForNote", value)} placeholder="Anything else you're looking for? (optional)" placeholderTextColor={colors.mutedForeground} style={[inputStyle, styles.textarea]} multiline maxLength={240} />
        </Section>

        <Section title="About your dog" description="Simple traits help neighbors choose a comfortable first hello." colors={colors}>
          <Text style={[styles.label, { color: colors.foreground }]}>Temperament</Text>
          <Chips options={PROFILE_OPTIONS.temperament} values={state.temperament} setValues={(values) => set("temperament", values)} colors={colors} />
          <Text style={[styles.label, { color: colors.foreground }]}>Energy level</Text>
          <Chips options={PROFILE_OPTIONS.energy} values={state.energyLevel ? [state.energyLevel] : []} setValues={(values) => set("energyLevel", values[0] ?? "")} single colors={colors} />
          <Text style={[styles.label, { color: colors.foreground }]}>Play style</Text>
          <Chips options={PROFILE_OPTIONS.playStyle} values={state.playStyles} setValues={(values) => set("playStyles", values)} colors={colors} />
          <Text style={[styles.label, { color: colors.foreground }]}>Dog size</Text>
          <Chips options={PROFILE_OPTIONS.size} values={state.size ? [state.size] : []} setValues={(values) => set("size", values[0] ?? "")} single colors={colors} />
          <Text style={[styles.label, { color: colors.foreground }]}>Dog sex</Text>
          <Chips options={PROFILE_OPTIONS.sex} values={state.dogSex ? [state.dogSex] : []} setValues={(values) => set("dogSex", values[0] ?? "unknown")} single colors={colors} />
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>Unknown never makes a compatibility guess.</Text>
        </Section>

        <Section title="Dog compatibility" description="Optional preferences for better suggestions." colors={colors}>
          <Text style={[styles.label, { color: colors.foreground }]}>Usually does well with…</Text>
          <Chips options={PROFILE_OPTIONS.compatibleWith} values={state.compatibleWith} setValues={(values) => set("compatibleWith", values)} colors={colors} />
          <Text style={[styles.label, { color: colors.foreground }]}>May not be a good fit with…</Text>
          <Chips options={PROFILE_OPTIONS.notGoodFitWith} values={state.notGoodFitWith} setValues={(values) => set("notGoodFitWith", values)} colors={colors} />
        </Section>

        <Section title="Walk and meetup preferences" description="Distance stays coarse and private." colors={colors}>
          <Text style={[styles.label, { color: colors.foreground }]}>Typical availability</Text>
          <Chips options={PROFILE_OPTIONS.availability} values={state.availability} setValues={(values) => set("availability", values)} colors={colors} />
          <Text style={[styles.label, { color: colors.foreground }]}>Preferred meetup type</Text>
          <Chips options={PROFILE_OPTIONS.meetup} values={state.meetupPreferences} setValues={(values) => set("meetupPreferences", values)} colors={colors} />
        </Section>

        {careSelected && (
          <Section title="Pet-sitting / trade-off interest" description="Optional and kept secondary to meetups." colors={colors}>
            <Chips options={PROFILE_OPTIONS.sitting} values={state.sittingInterests} setValues={(values) => set("sittingInterests", values)} colors={colors} />
          </Section>
        )}

        <ActionButton label={submitLabel} onPress={submit} disabled={saving || !state.name.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 22, gap: 24, paddingBottom: 52 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: "Georgia", fontSize: 22, fontWeight: "700" },
  sectionDescription: { fontSize: 14, lineHeight: 19 },
  label: { fontSize: 14, fontWeight: "800", marginTop: 5 },
  helper: { fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, fontSize: 16 },
  textarea: { minHeight: 84, paddingTop: 13, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, overflow: "hidden", fontSize: 13, fontWeight: "700" },
});