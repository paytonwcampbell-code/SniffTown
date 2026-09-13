import assert from "node:assert/strict";
import test from "node:test";
import { buildDogCompatibility } from "./compatibility.ts";

test("a known restriction overrides a generic most-dogs preference", () => {
  const viewer = {
    id: "viewer",
    size: "Small",
    compatibleWith: ["most_dogs"],
  };
  const candidate = {
    id: "candidate",
    compatibleWith: ["most_dogs"],
    notGoodFitWith: ["small_dogs"],
  };

  const summary = buildDogCompatibility(viewer, candidate);

  assert.ok(summary);
  assert.deepEqual(summary.restrictionCautions, [
    { direction: "candidate", value: "small_dogs" },
  ]);
  assert.deepEqual(summary.genericPreferences, []);
  assert.equal(summary.hasKnownSignals, true);
});

test("does not infer a match from unknown dog attributes", () => {
  const summary = buildDogCompatibility(
    { id: "viewer", compatibleWith: ["male_dogs"] },
    { id: "candidate", dogSex: "unknown" },
  );

  assert.ok(summary);
  assert.deepEqual(summary.preferenceMatches, []);
  assert.deepEqual(summary.restrictionCautions, []);
  assert.equal(summary.hasKnownSignals, false);
});

test("normalizes puppy, adult, and senior ages for preference matching", () => {
  for (const age of ["Puppy", "adult dog", "Senior dog"]) {
    const preference =
      age === "Puppy"
        ? "puppies"
        : age === "Senior dog"
          ? "senior_dogs"
          : "adult_dogs";
    const summary = buildDogCompatibility(
      { id: "viewer", compatibleWith: [preference] },
      { id: "candidate", age },
    );

    assert.ok(summary);
    assert.deepEqual(summary.preferenceMatches, [
      { direction: "viewer", value: preference },
    ]);
  }
});

test("does not treat depends-on-the-dog as a positive generic preference", () => {
  const summary = buildDogCompatibility(
    { id: "viewer", compatibleWith: ["depends_on_the_dog"] },
    { id: "candidate", size: "Small" },
  );

  assert.ok(summary);
  assert.deepEqual(summary.preferenceMatches, []);
  assert.deepEqual(summary.genericPreferences, []);
  assert.equal(summary.hasKnownSignals, false);
});

test("does not infer calm from low energy, and labels shared energy and play styles", () => {
  const lowEnergy = buildDogCompatibility(
    { id: "viewer", compatibleWith: ["calm_dogs"] },
    { id: "candidate", energyLevel: "low" },
  );
  assert.ok(lowEnergy);
  assert.deepEqual(lowEnergy.preferenceMatches, []);

  const shared = buildDogCompatibility(
    {
      id: "viewer",
      energyLevel: "high",
      playStyles: ["likes_wrestling"],
    },
    {
      id: "candidate",
      energyLevel: "high",
      playStyles: ["likes_wrestling"],
    },
  );
  assert.ok(shared);
  assert.deepEqual(shared.sharedEnergyLevels, ["high"]);
  assert.deepEqual(shared.sharedPlayStyles, ["likes_wrestling"]);
});

test("surfaces a one-sided known preference", () => {
  const summary = buildDogCompatibility(
    { id: "viewer", compatibleWith: ["small_dogs"] },
    { id: "candidate", size: "Small" },
  );

  assert.ok(summary);
  assert.deepEqual(summary.preferenceMatches, [
    { direction: "viewer", value: "small_dogs" },
  ]);
});

test("evaluates known preferences and restrictions in both directions", () => {
  const summary = buildDogCompatibility(
    {
      id: "viewer",
      size: "Small",
      notGoodFitWith: ["rough_play"],
    },
    {
      id: "candidate",
      playStyles: ["likes_wrestling"],
      compatibleWith: ["small_dogs"],
    },
  );

  assert.ok(summary);
  assert.deepEqual(summary.preferenceMatches, [
    { direction: "candidate", value: "small_dogs" },
  ]);
  assert.deepEqual(summary.restrictionCautions, [
    { direction: "viewer", value: "rough_play" },
  ]);
});

test("does not make personalized claims without a viewer or for the viewer's own dog", () => {
  const dog = { id: "same", size: "Small", compatibleWith: ["most_dogs"] };

  assert.equal(buildDogCompatibility(null, dog), null);
  assert.equal(buildDogCompatibility(undefined, dog), null);
  assert.equal(buildDogCompatibility(dog, dog), null);
  assert.equal(buildDogCompatibility(dog, { id: "same", size: "Large" }), null);
});