import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { 
  useListSittingRequests, 
  useCreateSittingRequest,
  useCreateSittingOffer,
  useAcceptSittingOffer,
  getListSittingRequestsQueryKey
} from "@workspace/api-client-react";
import type { Dog, SittingRequest, CurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Heart, Check, User, Mail, Bone, Sparkles } from "lucide-react";

const dateString = (value: string | Date) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);

const formatDisplayDate = (start: string | Date, end: string | Date) => {
  try {
    const startValue = dateString(start);
    const endValue = dateString(end);
    const startDate = format(parseISO(startValue), "MMM d, yyyy");
    const endDate = format(parseISO(endValue), "MMM d, yyyy");
    return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
  } catch {
    return `${start} to ${end}`;
  }
};

export function CareExchange({ user, myDogs }: { user: CurrentUser, myDogs: Dog[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: requests, isLoading } = useListSittingRequests();
  
  const createRequest = useCreateSittingRequest();
  const createOffer = useCreateSittingOffer();
  const acceptOffer = useAcceptSittingOffer();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [reqDogId, setReqDogId] = useState("");
  const [reqStart, setReqStart] = useState("");
  const [reqEnd, setReqEnd] = useState("");
  const [reqNotes, setReqNotes] = useState("");

  const [offerRequestId, setOfferRequestId] = useState<string | null>(null);
  const [offerMsg, setOfferMsg] = useState("");

  const todayStr = new Date().toISOString().split('T')[0];
  
  const { packRequests, myRequests, upcomingExchanges, pastExchanges } = useMemo(() => {
    if (!requests) return { packRequests: [], myRequests: [], upcomingExchanges: [], pastExchanges: [] };
    
    const pack = requests.filter(r => r.ownerId !== user.id && r.status === 'open');
    const mine = requests.filter(r => r.ownerId === user.id && r.status === 'open');
    
    const upcoming = requests.filter(r => 
      r.status === 'matched' && 
      (r.ownerId === user.id || r.offers.some(o => o.helperId === user.id && o.status === 'accepted')) &&
      dateString(r.endDate) >= todayStr
    );
    
    const past = requests.filter(r => 
      r.status === 'matched' && 
      (r.ownerId === user.id || r.offers.some(o => o.helperId === user.id && o.status === 'accepted')) &&
      dateString(r.endDate) < todayStr
    );
    
    return { packRequests: pack, myRequests: mine, upcomingExchanges: upcoming, pastExchanges: past };
  }, [requests, user.id, todayStr]);

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqDogId || !reqStart || !reqEnd || !reqNotes) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    
    createRequest.mutate({
      data: {
        dogId: reqDogId,
        startDate: reqStart,
        endDate: reqEnd,
        careNotes: reqNotes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSittingRequestsQueryKey() });
        setIsCreateOpen(false);
        setReqDogId("");
        setReqStart("");
        setReqEnd("");
        setReqNotes("");
        toast({ title: "Care request posted to your pack!" });
      }
    });
  };

  const handleCreateOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerRequestId || !offerMsg) return;
    
    createOffer.mutate({
      requestId: offerRequestId,
      data: { message: offerMsg }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSittingRequestsQueryKey() });
        setOfferRequestId(null);
        setOfferMsg("");
        toast({ title: "Offer sent successfully!" });
      }
    });
  };

  const handleAcceptOffer = (requestId: string, offerId: string) => {
    acceptOffer.mutate({
      requestId,
      offerId
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSittingRequestsQueryKey() });
        toast({ title: "Match confirmed!" });
      }
    });
  };

  if (isLoading) {
    return <div className="space-y-4 py-8"><div className="h-32 bg-muted/20 animate-pulse rounded-xl" /></div>;
  }

  const selectableDogs = myDogs;

  return (
    <div className="space-y-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-primary/5 p-6 rounded-2xl border border-primary/10">
        <div>
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Pack Care Exchange
          </h2>
          <p className="text-muted-foreground mt-1 max-w-lg">
            Trade pet-sitting with trusted neighbors in your pack. A familiar face makes all the difference.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="shrink-0 shadow-sm rounded-full h-11 px-6">
          Request Care
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-10">
        <div className="space-y-10">
          <section>
            <h3 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" /> Needs a Sitter
            </h3>
            {packRequests.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed rounded-2xl bg-background/50">
                <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <h3 className="text-lg font-medium">All dogs are cared for</h3>
                <p className="text-muted-foreground mt-1">No open sitting requests from your pack.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {packRequests.map(req => (
                  <PackRequestCard 
                    key={req.id} 
                    request={req} 
                    user={user} 
                    onOffer={() => setOfferRequestId(req.id)} 
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="font-display text-xl font-bold mb-4">My Open Requests</h3>
            {myRequests.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed rounded-2xl bg-background/50">
                <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-muted-foreground mt-1">You don't have any open care requests.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {myRequests.map(req => (
                  <MyRequestCard 
                    key={req.id} 
                    request={req} 
                    onAccept={(offerId) => handleAcceptOffer(req.id, offerId)}
                    isAccepting={acceptOffer.isPending}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-10">
          <section>
            <h3 className="font-display text-xl font-bold mb-4">Upcoming Exchanges</h3>
            {upcomingExchanges.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed rounded-2xl bg-background/50">
                <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-muted-foreground mt-1">No upcoming exchanges scheduled.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingExchanges.map(req => (
                  <ExchangeCard key={req.id} request={req} user={user} isPast={false} />
                ))}
              </div>
            )}
          </section>

          {pastExchanges.length > 0 && (
            <section>
              <h3 className="font-display text-xl font-bold mb-4 opacity-80">Past Exchanges</h3>
              <div className="space-y-4">
                {pastExchanges.map(req => (
                  <ExchangeCard key={req.id} request={req} user={user} isPast={true} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreateRequest}>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Request Care</DialogTitle>
              <DialogDescription>
                Ask your trusted pack members to watch your dog.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-6">
              <div className="space-y-2">
                <Label htmlFor="dogId">Which dog?</Label>
                <Select value={reqDogId} onValueChange={setReqDogId}>
                  <SelectTrigger id="dogId">
                    <SelectValue placeholder="Select a dog" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableDogs.map(dog => (
                      <SelectItem key={dog.id} value={dog.id}>{dog.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectableDogs.length === 0 && (
                  <p className="text-xs text-destructive mt-1">You need to add dogs to your pack first.</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input 
                    id="startDate" 
                    type="date" 
                    value={reqStart} 
                    onChange={e => setReqStart(e.target.value)} 
                    min={todayStr}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input 
                    id="endDate" 
                    type="date" 
                    value={reqEnd} 
                    onChange={e => setReqEnd(e.target.value)} 
                    min={reqStart || todayStr}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Care Notes</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Feeding schedule, walk routine, quirks..."
                  className="resize-none h-24"
                  value={reqNotes}
                  onChange={e => setReqNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createRequest.isPending || !reqDogId}>
                {createRequest.isPending ? "Posting..." : "Post Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!offerRequestId} onOpenChange={(open) => !open && setOfferRequestId(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreateOffer}>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Offer to Help</DialogTitle>
              <DialogDescription>
                Send a message to the owner. They will be able to contact you if they accept.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <Label htmlFor="message" className="sr-only">Message</Label>
              <Textarea 
                id="message" 
                placeholder="Hi! I'd love to watch them. I work from home so I can do midday walks..."
                className="resize-none h-32"
                value={offerMsg}
                onChange={e => setOfferMsg(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOfferRequestId(null)}>Cancel</Button>
              <Button type="submit" disabled={createOffer.isPending || !offerMsg.trim()}>
                {createOffer.isPending ? "Sending..." : "Send Offer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackRequestCard({ request, user, onOffer }: { request: SittingRequest, user: CurrentUser, onOffer: () => void }) {
  const hasOffered = request.offers.some(o => o.helperId === user.id);
  const displayDate = formatDisplayDate(request.startDate, request.endDate);

  return (
    <Card className="overflow-hidden border-border/60 hover:border-primary/40 transition-colors bg-card shadow-sm">
      <div className="p-5">
        <div className="flex justify-between items-start mb-3 gap-2">
          <div>
            <h4 className="font-display font-bold text-lg leading-tight">{request.dogName}</h4>
            <p className="text-sm text-muted-foreground mt-0.5">Owned by {request.ownerName}</p>
          </div>
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 shrink-0">
            Needs Sitter
          </Badge>
        </div>
        
        <div className="flex items-center gap-2 text-sm mb-4 bg-secondary/30 px-3 py-2 rounded-lg border border-border/40">
          <Calendar className="h-4 w-4 text-primary/70 shrink-0" />
          <span className="font-medium">{displayDate}</span>
        </div>
        
        <div className="text-sm text-foreground/80 mb-5 relative">
          <p className="line-clamp-3 italic">"{request.careNotes}"</p>
        </div>
        
        <div className="pt-4 border-t border-border/40 flex justify-end">
          {hasOffered ? (
            <Badge variant="secondary" className="px-3 py-1.5 text-sm font-normal bg-secondary">
              <Check className="h-3 w-3 mr-1.5" /> Offer Pending
            </Badge>
          ) : (
            <Button onClick={onOffer} className="w-full sm:w-auto shadow-sm rounded-full">
              <Heart className="h-4 w-4 mr-2" /> Offer to Help
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function MyRequestCard({ request, onAccept, isAccepting }: { request: SittingRequest, onAccept: (id: string) => void, isAccepting: boolean }) {
  const displayDate = formatDisplayDate(request.startDate, request.endDate);

  return (
    <Card className="overflow-hidden border-primary/20 bg-primary/5 shadow-sm">
      <div className="p-5">
        <div className="flex justify-between items-start mb-4 gap-2">
          <div>
            <h4 className="font-display font-bold text-lg leading-tight">Sitter for {request.dogName}</h4>
            <p className="text-sm text-muted-foreground mt-0.5">{displayDate}</p>
          </div>
          <Badge className="bg-accent text-accent-foreground border-transparent hover:bg-accent shrink-0 shadow-none">
            {request.offers.length} Offer{request.offers.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        
        {request.offers.length > 0 ? (
          <div className="mt-4 space-y-3">
            {request.offers.map(offer => (
              <div key={offer.id} className="p-4 rounded-xl border border-border/60 bg-card shadow-sm">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <div className="font-medium text-sm flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold uppercase">
                      {offer.helperName.substring(0, 2)}
                    </div>
                    {offer.helperName}
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => onAccept(offer.id)} 
                    disabled={isAccepting}
                    className="h-8 text-xs shrink-0 rounded-full"
                  >
                    Accept
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2 bg-secondary/20 p-3 rounded-lg">"{offer.message}"</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 p-6 rounded-xl border border-dashed border-primary/20 bg-background/50 text-center">
            <Bone className="h-6 w-6 text-primary/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No offers yet. Pack members will see this request.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function ExchangeCard({ request, user, isPast }: { request: SittingRequest, user: CurrentUser, isPast: boolean }) {
  const amOwner = request.ownerId === user.id;
  const acceptedOffer = request.offers.find(o => o.status === 'accepted');
  const helperName = acceptedOffer?.helperName || 'Someone';
  const displayDate = formatDisplayDate(request.startDate, request.endDate);
  
  const roleText = amOwner 
    ? <><span className="font-semibold text-foreground">{helperName}</span> is sitting for <span className="font-semibold text-foreground">{request.dogName}</span></>
    : <>You are sitting for <span className="font-semibold text-foreground">{request.dogName}</span> (<span className="text-foreground">{request.ownerName}</span>)</>;

  return (
    <Card className={`overflow-hidden border-border/60 shadow-sm transition-opacity ${isPast ? 'opacity-70 bg-secondary/20' : 'bg-card'}`}>
      <div className="p-5">
        <div className="flex justify-between items-start mb-4 gap-4">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${amOwner ? 'bg-accent/40 text-accent-foreground' : 'bg-primary/20 text-primary'}`}>
              {amOwner ? <User className="h-5 w-5" /> : <Heart className="h-5 w-5" />}
            </div>
            <div>
              <h4 className="text-base text-muted-foreground leading-snug">{roleText}</h4>
              <p className="text-sm font-medium mt-1.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 opacity-70" /> {displayDate}
              </p>
            </div>
          </div>
          <Badge variant={isPast ? "outline" : "default"} className={`shrink-0 shadow-none ${isPast ? "text-muted-foreground" : "bg-primary/15 text-primary hover:bg-primary/25 border-transparent"}`}>
            {isPast ? "Completed" : "Upcoming"}
          </Badge>
        </div>
        
        {(!isPast && (amOwner ? acceptedOffer?.contactEmail : request.contactEmail)) && (
          <div className="mt-4 p-3.5 bg-background rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-border/60">
            <div className="flex items-center gap-2.5 text-sm">
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Contact:</span>
               <a href={`mailto:${amOwner ? acceptedOffer?.contactEmail : request.contactEmail}`} className="font-medium text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline">
                 {amOwner ? acceptedOffer?.contactEmail : request.contactEmail}
               </a>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
