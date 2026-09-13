import assert from "node:assert/strict";
import test from "node:test";
import {
  dogsAreCompatible,
  getMatchExplanation,
  rankDogs,
  toDogWritePayload,
} from "./dog-profile.ts";

test("rejects a candidate blocked by an explicit restriction", () => {
  const owner = {
    size: "Small",
    compatibleWith: ["most_dogs"],
    notGoodFitWith: [],
  };
  const candidate = {
    size: "Large",
    compatibleWith: [],
    notGoodFitWith: ["small_dogs"],
  };

  assert.equal(dogsAreCompatible(owner, candidate), false);
});

test("recognizes a declared size preference without creating a score", () => {
  const owner = {
    size: "Small",
    compatibleWith: [],
    notGoodFitWith: [],
  };
  const candidate = {
    size: "Medium",
    compatibleWith: ["small_dogs"],
    notGoodFitWith: [],
  };

  assert.equal(dogsAreCompatible(owner, candidate), true);
});

test("ranks shared intent before unrelated candidates and explains why", () => {
  const owner = {
    lookingFor: ["playdate"],
    availability: ["evening"],
    size: "Medium",
    compatibleWith: ["most_dogs"],
    notGoodFitWith: [],
  };
  const nearby = {
    id: "nearby",
    lookingFor: ["playdate"],
    availability: ["evening"],
    distanceMiles: 3,
    size: "Large",
    compatibleWith: [],
    notGoodFitWith: [],
  };
  const unrelated = {
    id: "unrelated",
    lookingFor: ["friendship"],
    availability: ["morning"],
    distanceMiles: 3,
    size: "Large",
    compatibleWith: [],
    notGoodFitWith: [],
  };

  const ranked = rankDogs([unrelated, nearby], owner);
  assert.deepEqual(ranked.map((dog) => dog.id), ["nearby", "unrelated"]);
  assert.equal(
    ranked[0].matchExplanation,
    "Nearby + both available evenings",
  );
});

test("keeps opted-in nearby dogs ahead of farther matches", () => {
  const owner = { lookingFor: ["playdate"] };
  const nearby = { id: "nearby", lookingFor: ["friendship"], distanceMiles: 1 };
  const fartherMatch = { id: "farther", lookingFor: ["playdate"], distanceMiles: 8 };

  assert.deepEqual(rankDogs([fartherMatch, nearby], owner).map((dog) => dog.id), ["nearby", "farther"]);
});

test("uses a care-specific explanation when sitting is selected", () => {
  const own = { lookingFor: ["dog_sitting_swap"] };
  const candidate = { lookingFor: ["dog_sitting_swap"], distanceMiles: null };

  assert.equal(
    getMatchExplanation(own, candidate),
    "Both interested in dog-sitting swaps",
  );
});

test("sends explicit nulls when editable values are cleared", () => {
  const payload = toDogWritePayload(
    {
      name: "Bodhi",
      description: null,
      photoUrl: null,
      lookingForNote: null,
      size: null,
      energyLevel: null,
      dogSex: null,
    },
    "member-1",
    {
      id: "dog-1",
      description: "old description",
      photo_url: "https://old.example/dog.jpg",
      looking_for_note: "old note",
      size: "Large",
      energy_level: "high",
      dog_sex: "male",
    },
  );

  assert.equal(payload.description, null);
  assert.equal(payload.photo_url, null);
  assert.equal(payload.looking_for_note, null);
  assert.equal(payload.size, null);
  assert.equal(payload.energy_level, null);
  assert.equal(payload.dog_sex, null);
});

test("omitted optional values remain untouched on an edit", () => {
  const payload = toDogWritePayload(
    { name: "Bodhi" },
    "member-1",
    {
      id: "dog-1",
      description: "keep me",
      photo_url: "https://old.example/dog.jpg",
      looking_for_note: "keep this note",
      size: "Large",
      energy_level: "high",
    },
  );

  assert.deepEqual(payload, { name: "Bodhi" });
});

test("honors rough-play restrictions and only matches known sex", () => {
  assert.equal(
    dogsAreCompatible(
      { notGoodFitWith: ["rough_play"] },
      { playStyles: ["likes_wrestling"] },
    ),
    false,
  );
  assert.equal(
    dogsAreCompatible(
      { compatibleWith: ["male_dogs"] },
      { dogSex: "unknown" },
    ),
    false,
  );
  assert.equal(
    dogsAreCompatible(
      { compatibleWith: ["male_dogs"] },
      { dogSex: "male" },
    ),
    true,
  );
});

test("does not infer calm from low energy alone", () => {
  assert.equal(
    dogsAreCompatible(
      { compatibleWith: ["calm_dogs"] },
      { energyLevel: "low" },
    ),
    false,
  );
});