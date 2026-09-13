import {
  labelFor,
  type DogCompatibilitySummary as CompatibilitySummaryData,
} from "@workspace/api-client-react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export function CompatibilitySummary({
  summary,
  candidateName,
  compact = false,
}: {
  summary: CompatibilitySummaryData;
  candidateName: string;
  compact?: boolean;
}) {
  const c = useColors();
  if (!compact && !summary.hasKnownSignals) {
    return (
      <View style={[styles.panel, { backgroundColor: c.accent, borderColor: c.border }]}>
        <Text style={[styles.title, { color: c.foreground }]}>Personalized compatibility</Text>
        <Text style={[styles.muted, { color: c.mutedForeground }]}>
          Not enough shared profile information to personalize this comparison yet.
        </Text>
      </View>
    );
  }
  if (!summary.hasKnownSignals) return null;

  const lines: string[] = [];
  if (summary.restrictionCautions.length > 0) {
    lines.push(
      `Caution: ${summary.restrictionCautions
        .slice(0, compact ? 1 : undefined)
        .map(({ direction, value }) =>
          direction === "viewer"
            ? `your dog may not be a fit with ${labelFor("notGoodFitWith", value).toLowerCase()}`
            : `${candidateName}'s profile notes they may not be a fit with ${labelFor("notGoodFitWith", value).toLowerCase()}`,
        )
        .join(" · ")}`,
    );
  }
  if (summary.sharedMeetupPreferences.length > 0) {
    lines.push(
      `Shared meetup interests: ${summary.sharedMeetupPreferences
        .slice(0, compact ? 2 : undefined)
        .map((value) => labelFor("meetup", value))
        .join(" · ")}`,
    );
  }
  if (summary.sharedLookingFor.length > 0) {
    lines.push(
      `Shared plans: ${summary.sharedLookingFor
        .slice(0, compact ? 2 : undefined)
        .map((value) => labelFor("lookingFor", value))
        .join(" · ")}`,
    );
  }
  if (summary.sharedSittingInterests.length > 0) {
    lines.push(
      `Shared care interests: ${summary.sharedSittingInterests
        .slice(0, compact ? 2 : undefined)
        .map((value) => labelFor("sitting", value))
        .join(" · ")}`,
    );
  }
  if (summary.sharedEnergyLevels.length > 0 || summary.sharedPlayStyles.length > 0) {
    lines.push(
      `Shared energy/play: ${[
        ...summary.sharedEnergyLevels.map((value) => labelFor("energy", value)),
        ...summary.sharedPlayStyles.map((value) => labelFor("playStyle", value)),
      ].join(" · ")}`,
    );
  }
  if (summary.sharedTraits.length > 0) {
    lines.push(`Shared known traits: ${summary.sharedTraits.slice(0, compact ? 2 : undefined).join(" · ")}`);
  }
  if (summary.preferenceMatches.length > 0) {
    lines.push(
      `Known preferences: ${summary.preferenceMatches
        .slice(0, compact ? 1 : undefined)
        .map(({ direction, value }) =>
          direction === "viewer"
            ? `your dog mentions ${labelFor("compatibleWith", value).toLowerCase()}`
            : `${candidateName} mentions ${labelFor("compatibleWith", value).toLowerCase()}`,
        )
        .join(" · ")}`,
    );
  }
  if (summary.genericPreferences.length > 0) {
    lines.push(
      `Broad preference: ${summary.genericPreferences
        .map((direction) =>
          direction === "viewer"
            ? "your dog is open to meeting most dogs"
            : `${candidateName} is open to meeting most dogs`,
        )
        .join(" · ")}`,
    );
  }
  if (summary.overlappingAvailability.length > 0) {
    lines.push(
      `Availability overlap: ${summary.overlappingAvailability
        .slice(0, compact ? 2 : undefined)
        .map((value) => labelFor("availability", value).toLowerCase())
        .join(" · ")}`,
    );
  }

  return (
    <View style={[styles.panel, { backgroundColor: c.accent, borderColor: c.border }]}>
      {!compact && (
        <>
          <Text style={[styles.title, { color: c.foreground }]}>Personalized compatibility</Text>
          <Text style={[styles.muted, { color: c.mutedForeground }]}>
            Based only on details both people have shared — a conversation starter, not a guarantee.
          </Text>
        </>
      )}
      <View style={styles.lines}>
        {lines.slice(0, compact ? 3 : undefined).map((line) => (
          <Text key={line} style={[styles.line, { color: c.foreground }]}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    gap: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  muted: {
    fontSize: 12,
    lineHeight: 17,
  },
  lines: {
    gap: 5,
    marginTop: 4,
  },
  line: {
    fontSize: 13,
    lineHeight: 19,
  },
});