import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyDogQueryKey,
  getListDogsQueryKey,
  useCreateDog,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { DogProfileForm } from "@/components/dog-profile-form";

export default function NewDog() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const createDog = useCreateDog({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Dog profile saved",
          description: "Neighbors can now see the details you chose to share.",
        });
        queryClient.invalidateQueries({ queryKey: getGetMyDogQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
        setLocation("/pack");
      },
      onError: (error) => {
        toast({
          title: "Couldn’t save your dog profile",
          description: error.message,
          variant: "destructive",
        });
      },
    },
  });

  if (isUserLoading) return null;
  if (!user?.id) {
    setLocation("/auth");
    return null;
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="mb-5 -ml-3 text-muted-foreground">
        <Link href="/pack">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to matches
        </Link>
      </Button>
      <div className="mb-7">
        <h1 className="font-display text-3xl font-bold tracking-tight">Tell neighbors about your dog</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          A quick profile helps people answer “Would we actually want to meet?” Choose only what feels useful.
        </p>
      </div>
      <DogProfileForm
        submitLabel="Add dog to SniffTown"
        isSaving={createDog.isPending}
        onSubmit={(data) => createDog.mutate({ data })}
      />
    </div>
  );
}