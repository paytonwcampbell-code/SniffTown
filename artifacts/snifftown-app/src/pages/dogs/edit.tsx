import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyDogQueryKey,
  getListDogsQueryKey,
  useGetMyDog,
  useGetCurrentUser,
  useUpdateMyDog,
} from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { DogProfileForm } from "@/components/dog-profile-form";

export default function EditDog() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const dog = useGetMyDog({ query: { queryKey: getGetMyDogQueryKey(), enabled: Boolean(user?.id) } });
  const updateDog = useUpdateMyDog({
    mutation: {
      onSuccess: () => {
        toast({ title: "Profile updated", description: "Your new preferences are ready for discovery." });
        queryClient.invalidateQueries({ queryKey: getGetMyDogQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
        setLocation(`/dogs/${dog.data?.id ?? ""}`);
      },
      onError: (error) => {
        toast({
          title: "Couldn’t update your profile",
          description: error.message,
          variant: "destructive",
        });
      },
    },
  });

  if (isUserLoading || dog.isLoading) return null;
  if (!user?.id) {
    setLocation("/auth");
    return null;
  }
  if (dog.isError || !dog.data) {
    return (
      <div className="container max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Add your dog first</h1>
        <p className="mt-2 text-muted-foreground">Create a profile before refining preferences.</p>
        <Button asChild className="mt-6">
          <Link href="/dogs/new">Add your dog</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="mb-5 -ml-3 text-muted-foreground">
        <Link href={`/dogs/${dog.data.id}`}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to profile
        </Link>
      </Button>
      <div className="mb-7">
        <h1 className="font-display text-3xl font-bold tracking-tight">Refine your dog&apos;s profile</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Keep it current as routines, play styles, and meetup interests change.
        </p>
      </div>
      <DogProfileForm
        initialDog={dog.data}
        submitLabel="Save profile"
        isSaving={updateDog.isPending}
        onSubmit={(data) => updateDog.mutate({ data })}
      />
    </div>
  );
}