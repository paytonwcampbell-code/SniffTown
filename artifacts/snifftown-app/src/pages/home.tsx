import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListDogs, 
  useListParks, 
  useListPacks,
  useAddDogToPack,
  useGetCurrentUser,
  useSendContactMessage,
  getListDogsQueryKey
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Users, Dog, ChevronRight, Heart, Shield, Coffee } from "lucide-react";

// Helper for initials
const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

function DogCard({ dog, parkName, isUserLoggedIn }: { dog: any, parkName?: string, isUserLoggedIn: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const addDog = useAddDogToPack({
    mutation: {
      onSuccess: () => {
        toast({ title: "Added to your pack!" });
        queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
      }
    }
  });

  return (
    <Card className="overflow-hidden hover-elevate transition-all duration-300 border-border/60">
      <CardContent className="p-0">
        <div className="p-5 flex gap-4 items-start">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarImage src={dog.photoUrl || ""} alt={dog.name} className="object-cover" />
            <AvatarFallback className="bg-secondary text-secondary-foreground font-display text-lg">
              {getInitials(dog.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display font-bold text-lg leading-tight truncate">{dog.name}</h3>
                {dog.ownerName && (
                  <p className="text-sm text-muted-foreground truncate">with {dog.ownerName}</p>
                )}
              </div>
              {parkName && (
                <Badge variant="outline" className="bg-background text-xs font-normal shrink-0">
                  <MapPin className="h-3 w-3 mr-1 inline" /> {parkName}
                </Badge>
              )}
            </div>
            
            <p className="mt-2 text-sm line-clamp-2 text-foreground/80 leading-relaxed">
              {dog.description || "A good dog looking for friends."}
            </p>
            
            {dog.temperament && dog.temperament.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {dog.temperament.slice(0, 3).map((t: string) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-accent/50 text-accent-foreground/80 font-medium">
                    {t}
                  </span>
                ))}
                {dog.temperament.length > 3 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                    +{dog.temperament.length - 3}
                  </span>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              {isUserLoggedIn ? (
                <Button 
                  variant={dog.isInPack ? "secondary" : "outline"} 
                  size="sm" 
                  className="h-8 text-xs rounded-full"
                  disabled={dog.isInPack || addDog.isPending}
                  onClick={() => addDog.mutate({ dogId: dog.id })}
                >
                  {dog.isInPack ? "In Your Pack" : "+ Add to Pack"}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" asChild className="h-8 text-xs text-primary hover:text-primary/80 hover:bg-primary/10 -ml-2">
                  <Link href="/auth">Sign in to interact <ChevronRight className="h-3 w-3 ml-1" /></Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { data: user } = useGetCurrentUser();
  const { data: dogs, isLoading: dogsLoading } = useListDogs();
  const { data: parks } = useListParks();
  const { data: packs } = useListPacks();
  const { toast } = useToast();

  const isUserLoggedIn = !!user?.id;

  // Contact form state
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email || "");
  const [contactMsg, setContactMsg] = useState("");
  
  const sendMessage = useSendContactMessage({
    mutation: {
      onSuccess: () => {
        toast({ title: "Message sent! We'll get back to you soon." });
        setContactMsg("");
      },
      onError: () => {
        toast({ title: "Failed to send message.", variant: "destructive" });
      }
    }
  });

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMsg) return;
    sendMessage.mutate({
      data: { name: contactName, email: contactEmail, message: contactMsg }
    });
  };

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-background py-16 md:py-24 border-b border-border/40">
        {/* Abstract decorative elements */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3 w-[400px] h-[400px] bg-accent/30 rounded-full blur-3xl pointer-events-none" />
        
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <Badge variant="outline" className="bg-white border-primary/20 text-primary mb-6 px-3 py-1 font-medium tracking-wide">
            Austin's Neighborhood Dog Community
          </Badge>
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.1]">
            Find the right <span className="text-primary italic">friends</span> for your best friend.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            SniffTown connects dogs and their people across Austin, Texas. Find compatible playdates and walking buddies, build a trusted pack, and trade pet-sitting help with neighbors who already know your dog.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {!isUserLoggedIn ? (
              <>
                <Button size="lg" asChild className="h-12 px-8 text-base rounded-full w-full sm:w-auto shadow-md hover:shadow-lg transition-all">
                  <Link href="/auth">Join the Community</Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base rounded-full w-full sm:w-auto bg-background/50 backdrop-blur-sm">
                  <a href="#discover">Explore Dogs</a>
                </Button>
              </>
            ) : (
              <Button size="lg" asChild className="h-12 px-8 text-base rounded-full w-full sm:w-auto shadow-md hover:shadow-lg transition-all">
                <Link href="/pack">View Your Pack</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Discovery Section */}
      <section id="discover" className="py-16 md:py-24 bg-card/30">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-10">
            <div className="max-w-xl">
              <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">See who's sniffin' around</h2>
              <p className="mt-3 text-muted-foreground text-lg">Meet Austin dogs looking for playdates and walking buddies.</p>
            </div>
            {isUserLoggedIn && (
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/dogs/new">Add Your Dog</Link>
              </Button>
            )}
          </div>

          {dogsLoading ? (
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map(i => (
                <Card key={i} className="animate-pulse bg-muted/20 border-border/30 h-40" />
              ))}
            </div>
          ) : dogs?.length === 0 ? (
            <div className="text-center py-16 px-4 border border-dashed rounded-2xl bg-background">
              <Dog className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium">
                {isUserLoggedIn ? "No matching dogs yet" : "Your Austin dog community is private"}
              </h3>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                {isUserLoggedIn
                  ? "Add your dog and complete their preferences to start finding compatible playdates."
                  : "Existing members and their dogs stay protected until you sign in with your SniffTown account."}
              </p>
              {!isUserLoggedIn && (
                <Button asChild className="mt-5 rounded-full">
                  <Link href="/auth">Sign In to SniffTown</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {dogs?.slice(0, 8).map(dog => {
                const park = parks?.find(p => p.id === dog.parkId);
                return (
                  <DogCard 
                    key={dog.id} 
                    dog={dog} 
                    parkName={park?.name}
                    isUserLoggedIn={isUserLoggedIn}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Value Props Section */}
      <section className="py-20 md:py-32 bg-primary text-primary-foreground">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-10 md:gap-8 text-center">
            <div className="flex flex-col items-center">
              <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
                <Heart className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-display text-2xl font-bold mb-3 text-white">Match Temperaments</h3>
              <p className="text-primary-foreground/80 leading-relaxed max-w-xs">
                Find playdates that fit your pup's energy level. Shy dogs meet calm buddies, while energetic dogs find playful partners.
              </p>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
                <Users className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-display text-2xl font-bold mb-3 text-white">Share the Care</h3>
              <p className="text-primary-foreground/80 leading-relaxed max-w-xs">
                Build a trusted circle of familiar dogs and neighbors who can trade walks, check-ins, and pet-sitting duties.
              </p>
            </div>
            <div className="flex flex-col items-center">
              <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-display text-2xl font-bold mb-3 text-white">Local & Trustworthy</h3>
              <p className="text-primary-foreground/80 leading-relaxed max-w-xs">
                Grow trust through real neighborhood connections, repeat playdates, and people who understand your dog's routine.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Local Parks & Public Packs */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16">
            
            {/* Parks */}
            <div>
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-border/40">
                <div className="p-2 bg-secondary rounded-lg"><MapPin className="h-5 w-5 text-secondary-foreground" /></div>
                <h2 className="font-display text-2xl font-bold">Local Parks</h2>
              </div>
              
              <div className="space-y-4">
                {parks?.map(park => (
                  <div key={park.id} className="group flex items-center justify-between p-4 rounded-xl hover:bg-secondary/50 transition-colors border border-transparent hover:border-border/60">
                    <div>
                      <h4 className="font-medium text-lg">{park.name}</h4>
                      <p className="text-sm text-muted-foreground">{park.city}, {park.state}</p>
                    </div>
                    <Badge variant="secondary" className="bg-background group-hover:bg-white transition-colors">
                      {park.packCount} Packs active
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Public Packs */}
            <div>
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-border/40">
                <div className="p-2 bg-accent/50 rounded-lg"><Users className="h-5 w-5 text-accent-foreground" /></div>
                <h2 className="font-display text-2xl font-bold">Public Packs</h2>
              </div>
              
              <div className="space-y-4">
                {packs?.filter(p => p.isPublic).slice(0, 5).map(pack => (
                  <div key={pack.id} className="group flex flex-col p-5 rounded-xl border border-border/40 hover:border-primary/30 hover:shadow-sm bg-card transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium font-display text-lg">{pack.name}</h4>
                      <Badge variant="outline" className="font-normal text-xs">{pack.memberCount} members</Badge>
                    </div>
                    {pack.location && (
                      <p className="text-sm text-muted-foreground flex items-center mt-1">
                        <MapPin className="h-3 w-3 mr-1 inline opacity-70" /> {pack.location}
                      </p>
                    )}
                  </div>
                ))}
                {packs?.filter(p => p.isPublic).length === 0 && (
                  <div className="text-center py-8 px-4 border border-dashed rounded-xl text-muted-foreground">
                    No public packs yet. Be the first to start one!
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-secondary/30 border-t border-border/40">
        <div className="container mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl font-bold mb-3">Say Hello</h2>
            <p className="text-muted-foreground">Have a question, feedback, or want to suggest a new park? We'd love to hear from you.</p>
          </div>

          <Card className="border-border/50 shadow-sm bg-background">
            <CardContent className="pt-6">
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none" htmlFor="name">Name</label>
                    <Input 
                      id="name" 
                      placeholder="Your name" 
                      value={contactName} 
                      onChange={e => setContactName(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none" htmlFor="email">Email</label>
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="you@example.com" 
                      value={contactEmail} 
                      onChange={e => setContactEmail(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none" htmlFor="message">Message</label>
                  <Textarea 
                    id="message" 
                    placeholder="How can we help?" 
                    className="min-h-[120px] resize-none" 
                    value={contactMsg} 
                    onChange={e => setContactMsg(e.target.value)} 
                    required 
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full mt-2" 
                  disabled={sendMessage.isPending}
                >
                  {sendMessage.isPending ? "Sending..." : "Send Message"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
