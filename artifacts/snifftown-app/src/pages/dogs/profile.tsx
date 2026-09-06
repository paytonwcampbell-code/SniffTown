import { Link, useLocation, useParams } from "wouter";
import {
  useGetCurrentUser,
  useListDogs,
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
  const dog = dogs?.find((candidate) => candidate.id === dogId);

  if (userLoading || dogsLoading) {
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

              <p className="mt-6 leading-relaxed text-foreground/85">
                {dog.description || `${dog.name} is looking for neighborhood dog friends.`}
              </p>

              {dog.temperament.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {dog.temperament.map((trait) => <Badge key={trait} variant="secondary">{trait}</Badge>)}
                </div>
              )}

              {dog.ownerId && dog.ownerId !== user.id && dog.isInPack && (
                <Button asChild className="mt-7 rounded-full">
                  <Link href={`/messages?to=${dog.ownerId}&dog=${dog.id}`}>
                    <MessageSquare className="mr-2 h-4 w-4" />Message about {dog.name}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}