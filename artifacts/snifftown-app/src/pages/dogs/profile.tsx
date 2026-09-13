import { Link, useLocation, useParams } from "wouter";
import {
  useGetCurrentUser,
  getGetMyDogQueryKey,
  useGetMyDog,
  useListDogs,
  labelFor,
  buildDogCompatibility,
  type DogCompatibilitySummary,
} from "@workspace/api-client-react";
import { ArrowLeft, MessageSquare, Shield } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

export default function DogProfile() {
  const { dogId } = useParams<{ dogId: string }>();
  const [, setLocation] = useLocation();
  const { data: user, isLoading: userLoading } = useGetCurrentUser();
  const { data: dogs, isLoading: dogsLoading } = useListDogs();
  const ownDog = useGetMyDog({ query: { queryKey: getGetMyDogQueryKey(), enabled: Boolean(user?.id) } });
  const dog = dogs?.find((candidate) => candidate.id === dogId) ??
    (ownDog.data?.id === dogId ? ownDog.data : undefined);

  if (userLoading || dogsLoading || ownDog.isLoading) {
    return <div className="min-h-[60vh] grid place-items-center text-muted-foreground">Loading dog profile…</div>;
  }

  if (!user?.id) {
    setLocation("/auth");
    return null;
  }

  if (!dog) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Dog profile unavailable</h1>
        <p className="mt-2 text-muted-foreground">This dog may no longer be available in your matches.</p>
        <Button asChild className="mt-6"><Link href="/">Back to Explore</Link></Button>
      </div>
    );
  }

  const isOwnDog = dog.ownerId === user.id;
  const lookingFor = dog.lookingFor.map((value) => labelFor("lookingFor", value));
  const compatibleWith = dog.compatibleWith.map((value) => labelFor("compatibleWith", value));
  const availability = dog.availability.map((value) => labelFor("availability", value));
  const sittingInterests = dog.sittingInterests.map((value) => labelFor("sitting", value));
  const compatibility =
    isOwnDog || ownDog.data?.ownerId !== user.id
      ? null
      : buildDogCompatibility(ownDog.data, dog);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Button variant="ghost" asChild className="mb-5 -ml-3">
        <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Explore dogs</Link>
      </Button>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-6 sm:p-9">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-6">
            <Avatar className="h-28 w-28 border-4 border-primary/15">
              <AvatarImage src={dog.photoUrl || ""} alt={dog.name} className="object-cover" />
              <AvatarFallback className="bg-secondary font-display text-3xl">
                {getInitials(dog.name)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <h1 className="font-display text-3xl font-bold">{dog.name}</h1>
              <p className="mt-1 text-lg text-muted-foreground">with {dog.ownerName || "a SniffTown neighbor"}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Shield className="h-4 w-4 text-primary" />Community Member
              </p>

              {dog.description && <p className="mt-6 leading-relaxed text-foreground/85">{dog.description}</p>}

              {dog.temperament.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {dog.temperament.map((trait) => <Badge key={trait} variant="secondary">{trait}</Badge>)}
                </div>
              )}

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                {lookingFor.length > 0 && (
                  <Summary title="Looking for" values={lookingFor} />
                )}
                {(dog.energyLevel || dog.playStyles.length > 0 || dog.size) && (
                  <Summary
                    title={dog.name}
                    values={[
                      ...dog.temperament.slice(0, 2),
                      dog.energyLevel ? `${dog.energyLevel} energy` : "",
                      dog.size ?? "",
                      ...dog.playStyles.slice(0, 1).map((value) => labelFor("playStyle", value)),
                    ].filter(Boolean)}
                  />
                )}
                {compatibleWith.length > 0 && (
                  <Summary title="Usually does well with" values={compatibleWith} />
                )}
                {availability.length > 0 && (
                  <Summary title="Usually walks" values={availability} />
                )}
                {sittingInterests.length > 0 && (
                  <Summary title="Comfortable with" values={sittingInterests} />
                )}
              </div>

              {compatibility && (
                <CompatibilityPanel summary={compatibility} candidateName={dog.name} />
              )}

              {dog.ownerId && dog.ownerId !== user.id && dog.isInPack && (
                <Button asChild className="mt-7 rounded-full">
                  <Link href={`/messages?to=${dog.ownerId}&dog=${dog.id}`}>
                    <MessageSquare className="mr-2 h-4 w-4" />Message about {dog.name}
                  </Link>
                </Button>
              )}
              {isOwnDog && (
                <Button asChild variant="outline" className="mt-7 rounded-full">
                  <Link href="/dogs/edit">Edit profile</Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CompatibilityPanel({
  summary,
  candidateName,
}: {
  summary: DogCompatibilitySummary;
  candidateName: string;
}) {
  return (
    <div className="mt-7 rounded-xl border border-primary/15 bg-primary/5 p-4">
      <p className="text-sm font-semibold text-primary">Personalized compatibility</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Based only on details both people have shared — this is a conversation starter, not a guarantee.
      </p>

      {!summary.hasKnownSignals ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Not enough shared profile information to personalize this comparison yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          {summary.sharedMeetupPreferences.length > 0 && (
            <p>
              <span className="font-semibold">Shared meetup interests:</span>{" "}
              {summary.sharedMeetupPreferences.map((value) => labelFor("meetup", value)).join(" · ")}
            </p>
          )}
          {summary.sharedLookingFor.length > 0 && (
            <p>
              <span className="font-semibold">Shared plans:</span>{" "}
              {summary.sharedLookingFor.map((value) => labelFor("lookingFor", value)).join(" · ")}
            </p>
          )}
          {summary.sharedSittingInterests.length > 0 && (
            <p>
              <span className="font-semibold">Shared care interests:</span>{" "}
              {summary.sharedSittingInterests.map((value) => labelFor("sitting", value)).join(" · ")}
            </p>
          )}
          {summary.sharedEnergyLevels.length > 0 && (
            <p>
              <span className="font-semibold">Shared energy:</span>{" "}
              {summary.sharedEnergyLevels.map((value) => labelFor("energy", value)).join(" · ")}
            </p>
          )}
          {summary.sharedPlayStyles.length > 0 && (
            <p>
              <span className="font-semibold">Shared play styles:</span>{" "}
              {summary.sharedPlayStyles.map((value) => labelFor("playStyle", value)).join(" · ")}
            </p>
          )}
          {summary.sharedTraits.length > 0 && (
            <p>
              <span className="font-semibold">Shared known traits:</span>{" "}
              {summary.sharedTraits.join(" · ")}
            </p>
          )}
          {summary.preferenceMatches.length > 0 && (
            <p>
              <span className="font-semibold">Known preferences that line up:</span>{" "}
              {summary.preferenceMatches
                .map(({ direction, value }) =>
                  direction === "viewer"
                    ? `Your dog mentions ${labelFor("compatibleWith", value).toLowerCase()}`
                    : `${candidateName} mentions ${labelFor("compatibleWith", value).toLowerCase()}`,
                )
                .join(" · ")}
            </p>
          )}
          {summary.genericPreferences.length > 0 && (
            <p>
              <span className="font-semibold">Broad preference:</span>{" "}
              {summary.genericPreferences
                .map((direction) =>
                  direction === "viewer"
                    ? "your dog’s profile is open to meeting most dogs"
                    : `${candidateName}'s profile is open to meeting most dogs`,
                )
                .join(" · ")}
            </p>
          )}
          {summary.restrictionCautions.length > 0 && (
            <p className="text-destructive">
              <span className="font-semibold">Caution:</span>{" "}
              {summary.restrictionCautions
                .map(({ direction, value }) =>
                  direction === "viewer"
                    ? `your dog may not be a fit with ${labelFor("notGoodFitWith", value).toLowerCase()}`
                    : `${candidateName}'s profile notes they may not be a fit with ${labelFor("notGoodFitWith", value).toLowerCase()}`,
                )
                .join(" · ")}
            </p>
          )}
          {summary.overlappingAvailability.length > 0 && (
            <p>
              <span className="font-semibold">Availability overlap:</span>{" "}
              {summary.overlappingAvailability
                .map((value) => labelFor("availability", value))
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Summary({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-xl bg-secondary/45 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm leading-relaxed">{values.join(" · ")}</p>
    </div>
  );
}