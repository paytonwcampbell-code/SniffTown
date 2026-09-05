import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListDogs, 
  useListPacks,
  useGetCurrentUser,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, Shield, MapPin, Bone, MessageSquare } from "lucide-react";

const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

export default function PackPage() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const { data: allDogs, isLoading: isDogsLoading } = useListDogs();
  const { data: allPacks, isLoading: isPacksLoading } = useListPacks();

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
            <AvatarFallback className="bg-primary text-primary-foreground font-display text-2xl">
              {getInitials(user.displayName || user.email || "U")}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">{user.displayName || "My Profile"}</h1>
            <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
              <Shield className="h-4 w-4 text-primary" />
              Community Member
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

      <Tabs defaultValue="mypack" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-8 bg-secondary/50">
          <TabsTrigger value="mypack" className="data-[state=active]:bg-background">My Pack</TabsTrigger>
          <TabsTrigger value="publicpacks" className="data-[state=active]:bg-background">Public Packs</TabsTrigger>
        </TabsList>

        <TabsContent value="mypack" className="space-y-8 animate-in fade-in-50 duration-500">
          
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="font-display text-2xl font-bold">Your Pack Members</h2>
              <p className="text-muted-foreground mt-1">Dogs you've connected with in the neighborhood.</p>
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
              <h3 className="font-display text-xl font-bold mb-2">Your pack is empty</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                You haven't added any dogs to your pack yet. Explore the neighborhood to find walking buddies!
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
                        In Pack
                      </Badge>
                    </div>
                  </div>
                  
                  <CardContent className="p-5">
                    <h3 className="font-display font-bold text-xl mb-1">{dog.name}</h3>
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
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
                        <MessageSquare className="h-4 w-4 mr-2" /> Message
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="publicpacks" className="space-y-8 animate-in fade-in-50 duration-500">
          <div className="mb-6">
            <h2 className="font-display text-2xl font-bold">Public Neighborhood Packs</h2>
            <p className="text-muted-foreground mt-1">Join a community group based on location or play style.</p>
          </div>

          {isPacksLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Card key={i} className="h-24 animate-pulse bg-muted/20" />)}
            </div>
          ) : !allPacks || allPacks.length === 0 ? (
            <div className="text-center py-16 px-4 border border-dashed rounded-2xl bg-background">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium">No public packs yet</h3>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">Public packs help organize large group walks.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {allPacks.filter(p => p.isPublic).map(pack => (
                <Card key={pack.id} className="border-border/60 hover-elevate transition-all">
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-display font-bold text-xl">{pack.name}</h3>
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                          {pack.memberCount} members
                        </Badge>
                      </div>
                      {pack.location && (
                        <p className="text-sm text-muted-foreground flex items-center mt-2">
                          <MapPin className="h-4 w-4 mr-1.5 opacity-70" /> 
                          Meets at {pack.location}
                        </p>
                      )}
                    </div>
                    <Button variant="secondary" className="shrink-0 w-full sm:w-auto">
                      Request to Join
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
