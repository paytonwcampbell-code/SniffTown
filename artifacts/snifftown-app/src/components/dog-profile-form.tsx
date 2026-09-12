import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  type Dog,
  type DogInput,
  PROFILE_OPTIONS,
  hasDogCareIntent,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

export type DogProfileFormProps = {
  initialDog?: Dog | null;
  submitLabel: string;
  isSaving?: boolean;
  onSubmit: (data: DogInput) => void;
};

const stateFromDog = (dog?: Dog | null): ProfileState => ({
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

function ChipGroup({
  options,
  values,
  onChange,
  single = false,
}: {
  options: readonly { value: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
  single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange(
                single
                  ? selected
                    ? []
                    : [option.value]
                  : selected
                    ? values.filter((value) => value !== option.value)
                    : [...values, option.value],
              )
            }
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border/50 pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function DogProfileForm({
  initialDog,
  submitLabel,
  isSaving = false,
  onSubmit,
}: DogProfileFormProps) {
  const [state, setState] = useState<ProfileState>(() => stateFromDog(initialDog));

  useEffect(() => {
    setState(stateFromDog(initialDog));
  }, [initialDog]);

  const set = <K extends keyof ProfileState>(key: K, value: ProfileState[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state.name.trim()) return;
    const careSelected = hasDogCareIntent(state.lookingFor);
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

  const careSelected = hasDogCareIntent(state.lookingFor);
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="pt-6">
        <form onSubmit={submit} className="space-y-7">
          <Section
            title="The basics"
            description="A few recognizable details help neighbors know who they are meeting."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Dog&apos;s name
                <Input
                  value={state.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="e.g. Bodhi"
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Photo URL <span className="font-normal text-muted-foreground">(optional)</span>
                <Input
                  value={state.photoUrl}
                  onChange={(event) => set("photoUrl", event.target.value)}
                  placeholder="https://…"
                  type="url"
                />
              </label>
            </div>
            <label className="block space-y-2 text-sm font-medium">
              Short intro <span className="font-normal text-muted-foreground">(optional)</span>
              <Textarea
                value={state.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="A favorite routine, quirk, or anything else a neighbor should know."
                className="min-h-[84px] resize-none"
                maxLength={500}
              />
            </label>
          </Section>

          <Section
            title="What are you looking for?"
            description="Choose any that sound useful. You can refine this later."
          >
            <ChipGroup
              options={PROFILE_OPTIONS.lookingFor}
              values={state.lookingFor}
              onChange={(values) => set("lookingFor", values)}
            />
            <label className="block space-y-2 text-sm font-medium">
              Anything else you&apos;re looking for? <span className="font-normal text-muted-foreground">(optional)</span>
              <Textarea
                value={state.lookingForNote}
                onChange={(event) => set("lookingForNote", event.target.value)}
                placeholder="Evening walks and an occasional weekend playdate nearby."
                className="min-h-[72px] resize-none"
                maxLength={240}
              />
            </label>
          </Section>

          <Section title="About your dog" description="Simple traits are enough—no long questionnaire.">
            <div className="space-y-2">
              <p className="text-sm font-medium">Temperament</p>
              <ChipGroup
                options={PROFILE_OPTIONS.temperament}
                values={state.temperament}
                onChange={(values) => set("temperament", values)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Energy level</p>
              <ChipGroup
                options={PROFILE_OPTIONS.energy}
                values={state.energyLevel ? [state.energyLevel] : []}
                onChange={(values) => set("energyLevel", values[0] ?? "")}
                single
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Play style</p>
              <ChipGroup
                options={PROFILE_OPTIONS.playStyle}
                values={state.playStyles}
                onChange={(values) => set("playStyles", values)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Dog size</p>
              <ChipGroup
                options={PROFILE_OPTIONS.size}
                values={state.size ? [state.size] : []}
                onChange={(values) => set("size", values[0] ?? "")}
                single
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Dog sex</p>
              <ChipGroup
                options={PROFILE_OPTIONS.sex}
                values={state.dogSex ? [state.dogSex] : []}
                onChange={(values) => set("dogSex", values[0] ?? "unknown")}
                single
              />
              <p className="text-xs text-muted-foreground">
                Used only when you choose male or female compatibility preferences; unknown never makes a guess.
              </p>
            </div>
          </Section>

          <Section title="Dog compatibility" description="These are optional and help us suggest better first meetups.">
            <div className="space-y-2">
              <p className="text-sm font-medium">My dog usually does well with…</p>
              <ChipGroup
                options={PROFILE_OPTIONS.compatibleWith}
                values={state.compatibleWith}
                onChange={(values) => set("compatibleWith", values)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">My dog may NOT be a good fit with…</p>
              <ChipGroup
                options={PROFILE_OPTIONS.notGoodFitWith}
                values={state.notGoodFitWith}
                onChange={(values) => set("notGoodFitWith", values)}
              />
            </div>
          </Section>

          <Section title="Walk and meetup preferences" description="Optional details for planning the first hello.">
            <div className="space-y-2">
              <p className="text-sm font-medium">Typical availability</p>
              <ChipGroup
                options={PROFILE_OPTIONS.availability}
                values={state.availability}
                onChange={(values) => set("availability", values)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Preferred meetup type</p>
              <ChipGroup
                options={PROFILE_OPTIONS.meetup}
                values={state.meetupPreferences}
                onChange={(values) => set("meetupPreferences", values)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Distance is handled through nearby discovery. We never show exact addresses or coordinates.
            </p>
          </Section>

          {careSelected && (
            <Section
              title="Pet-sitting / trade-off interest"
              description="Optional and kept secondary to your meetup preferences."
            >
              <ChipGroup
                options={PROFILE_OPTIONS.sitting}
                values={state.sittingInterests}
                onChange={(values) => set("sittingInterests", values)}
              />
            </Section>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-6">
            <Button type="submit" size="lg" disabled={isSaving || !state.name.trim()}>
              {isSaving ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}