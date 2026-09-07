import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  useListDogs, 
  useListParks,
  useGetCurrentUser,
  useGetMyDog,
  useListIncomingPackRequests,
  useRespondToPackRequest,
  useUpdateParkPackMembership,
  getListDogsQueryKey,
  getListIncomingPackRequestsQueryKey,
  getListParksQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, Shield, MapPin, Bone, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

export default function PackPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const { data: allDogs, isLoading: isDogsLoading } = useListDogs();
  const { data: parkPacks, isLoading: isParksLoading } = useListParks();
  const { data: myDog } = useGetMyDog();
  const { data: incomingRequests = [] } = useListIncomingPackRequests({
    query: {
      queryKey: getListIncomingPackRequestsQueryKey(),
      refetchInterval: 5000,
    },
  });
  const respondToRequest = useRespondToPackRequest({
    mutation: {
      onSuccess: (result) => {
        toast({
          title: result.status === "accepted" ? "It’s a match!" : "Interest dismissed",
        });
        queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListIncomingPackRequestsQueryKey() });
      },
      onError: (error) => {
        toast({
          title: "Couldn’t update the request",
          description: error.message,
          variant: "destructive",
        });
      },
    },
  });
  const updateParkMembership = useUpdateParkPackMembership({
    mutation: {
      onSuccess: (result) => {
        toast({
          title: result.isMember ? "Local park pack joined" : "Local park pack left",
        });
        queryClient.invalidateQueries({ queryKey: getListParksQueryKey() });
      },
      onError: (error) => {
        toast({
          title: "Couldn’t update your park pack",
          description: error.message,
          variant: "destructive",
        });
      },
    },
  });

  // Filter out dogs that are in the user's pack
  const myPackDogs = useMemo(() => {
    return allDogs?.filter(dog => dog.isInPack) || [];
  }, [allDogs]);

  // Protect route
  if (isUserLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse">Loading...</div></div>;
  
  if (!user?.id) {
    setLocation("/auth");
    return null;
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      
      {/* Header Profile Section */}
      <div className="flex flex-col md:flex-row gap-8 items-start md:items-center justify-between mb-12 pb-8 border-b border-border/40">
        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20 border-4 border-primary/20">
            <AvatarImage src={myDog?.photoUrl || ""} alt={myDog?.name || "Your dog"} />
            <AvatarFallback className="bg-primary text-primary-foreground font-display text-2xl">
              {getInitials(myDog?.name || user.displayName || user.email || "U")}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{myDog?.name || "Your Dog"}</h1>
            <p className="mt-1 text-lg text-muted-foreground">with {user.displayName || "you"}</p>
            <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
              <Shield className="h-4 w-4 text-primary" />
              SniffTown Community Member
            </p>
          </div>
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
          <Button asChild className="flex-1 md:flex-none shadow-sm">
            <Link href="/dogs/new">
              <Plus className="h-4 w-4 mr-2" /> Add a Dog
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 md:flex-none">
            <Link href="/">Find Dogs</Link>
          </Button>
        </div>
      </div>

      {incomingRequests.length > 0 && (
        <Card className="mb-8 border-primary/25 bg-primary/[0.03]">
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">Dogs interested in {myDog?.name || "yours"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Interest stays private unless you’re interested too.
            </p>
            <div className="mt-5 space-y-4">
              {incomingRequests.map((request) => (
                <div key={request.id} className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">
                      {request.fromDogName} is interested in meeting {request.toDogName}
                    </p>
                    {request.message && <p className="mt-1 text-sm text-muted-foreground">“{request.message}”</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={respondToRequest.isPending}
                      onClick={() => respondToRequest.mutate({
                        requestId: request.id,
                        data: { status: "accepted" },
                      })}
                    >
                      Interested too
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={respondToRequest.isPending}
                      onClick={() => respondToRequest.mutate({
                        requestId: request.id,
                        data: { status: "declined" },
                      })}
                    >
                      Not now
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="mypack" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-8 bg-secondary/50">
          <TabsTrigger value="mypack" className="data-[state=active]:bg-background">My Matches</TabsTrigger>
          <TabsTrigger value="localpacks" className="data-[state=active]:bg-background">Local Park Packs</TabsTrigger>
        </TabsList>

        <TabsContent value="mypack" className="space-y-8 animate-in fade-in-50 duration-500">
          
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="font-display text-2xl font-bold">Your Matches</h2>
              <p className="text-muted-foreground mt-1">Mutual dog connections from around the neighborhood.</p>
            </div>
            <Badge variant="secondary" className="text-sm font-normal hidden sm:inline-flex">
              {myPackDogs.length} Member{myPackDogs.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {isDogsLoading ? (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <Card key={i} className="h-64 animate-pulse bg-muted/20" />)}
            </div>
          ) : myPackDogs.length === 0 ? (
            <Card className="border-dashed border-2 bg-transparent text-center p-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground mb-4">
                <Users className="h-8 w-8 opacity-50" />
              </div>
              <h3 className="font-display text-xl font-bold mb-2">No matches yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                Express interest in nearby dogs. When their person is interested too, they’ll appear here.
              </p>
              <Button asChild>
                <Link href="/">Explore Nearby Dogs</Link>
              </Button>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
              {myPackDogs.map(dog => (
                <Card key={dog.id} className="overflow-hidden group hover:border-primary/50 transition-colors bg-card shadow-sm border-border/50">
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    {dog.photoUrl ? (
                      <img src={dog.photoUrl} alt={dog.name} className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary">
                        <span className="font-display text-4xl text-muted-foreground/30">{getInitials(dog.name)}</span>
                      </div>
                    )}
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-primary/90 text-primary-foreground backdrop-blur-sm border-none shadow-sm">
                        Match
                      </Badge>
                    </div>
                  </div>
                  
                  <CardContent className="p-5">
                    <Link href={`/dogs/${dog.id}`} className="hover:text-primary transition-colors">
                      <h3 className="font-display font-bold text-xl mb-1">{dog.name}</h3>
                    </Link>
                    {dog.ownerName && <p className="text-sm text-muted-foreground mb-3">with {dog.ownerName}</p>}
                    
                    {dog.temperament && dog.temperament.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3 mb-4">
                        {dog.temperament.slice(0, 3).map((t: string) => (
                          <span key={t} className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-medium">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="pt-4 mt-auto border-t border-border/40 flex justify-between items-center">
                      {dog.ownerId ? (
                        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary -ml-2">
                          <Link href={`/messages?to=${dog.ownerId}&dog=${dog.id}`}>
                            <MessageSquare className="h-4 w-4 mr-2" /> Message
                          </Link>
                        </Button>
                      ) : (
                        <div />
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dogs/${dog.id}`}>View profile</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="localpacks" className="space-y-8 animate-in fade-in-50 duration-500">
          <div className="mb-6">
            <h2 className="font-display text-2xl font-bold">Austin Local Park Packs</h2>
            <p className="text-muted-foreground mt-1">
              Join the community around parks you visit for local walks, playdates, and meetups.
            </p>
          </div>

          {isParksLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse bg-muted/20" />)}
            </div>
          ) : !parkPacks || parkPacks.length === 0 ? (
            <div className="text-center py-16 px-4 border border-dashed rounded-2xl bg-background">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No local park packs yet</h3>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">Suggest an Austin park and we’ll add its local community.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {parkPacks.map(park => (
                <Card key={park.id} className="border-border/60 hover-elevate transition-all">
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-display font-bold text-xl">{park.name} Pack</h3>
                        {park.isMember && (
                          <Badge className="border-none">Joined</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center mt-2">
                        <MapPin className="h-4 w-4 mr-1.5 opacity-70" />
                        Meets around {park.name} in {park.city}
                      </p>
                    </div>
                    <Button
                      variant={park.isMember ? "outline" : "secondary"}
                      className="shrink-0 w-full sm:w-auto"
                      disabled={updateParkMembership.isPending}
                      onClick={() =>
                        updateParkMembership.mutate({
                          parkId: park.id,
                          data: { action: park.isMember ? "leave" : "join" },
                        })
                      }
                    >
                      {updateParkMembership.isPending
                        ? "Updating..."
                        : park.isMember
                          ? "Leave pack"
                          : "Join local pack"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
