import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListParks, 
  useCreateDog, 
  getListDogsQueryKey,
  useGetCurrentUser
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Plus, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMMON_TEMPERAMENTS = [
  "Playful", "Shy", "Energetic", "Calm", "Vocal", 
  "Cuddly", "Protective", "Food Motivated", "Ball Obsessed", "Friendly"
];

const dogSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  photoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  parkId: z.string().optional(),
});

type DogFormValues = z.infer<typeof dogSchema>;

export default function NewDog() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const { data: parks } = useListParks();
  const [selectedTemperaments, setSelectedTemperaments] = useState<string[]>([]);
  const [customTemp, setCustomTemp] = useState("");

  const form = useForm<DogFormValues>({
    resolver: zodResolver(dogSchema),
    defaultValues: {
      name: "",
      description: "",
      photoUrl: "",
      parkId: undefined,
    },
  });

  const createDog = useCreateDog({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Dog added successfully!",
          description: "Your dog is now part of the SniffTown community.",
        });
        queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
        setLocation("/pack");
      },
      onError: () => {
        toast({
          title: "Error adding dog",
          description: "There was a problem adding your dog. Please try again.",
          variant: "destructive",
        });
      }
    }
  });

  const toggleTemperament = (temp: string) => {
    setSelectedTemperaments(prev => 
      prev.includes(temp) 
        ? prev.filter(t => t !== temp)
        : [...prev, temp]
    );
  };

  const addCustomTemperament = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') return;
    e.preventDefault(); // Prevent form submission
    
    if (customTemp.trim() && !selectedTemperaments.includes(customTemp.trim())) {
      setSelectedTemperaments(prev => [...prev, customTemp.trim()]);
      setCustomTemp("");
    }
  };

  const onSubmit = (data: DogFormValues) => {
    createDog.mutate({
      data: {
        name: data.name,
        description: data.description || undefined,
        photoUrl: data.photoUrl || undefined,
        parkId: data.parkId === "none" ? undefined : data.parkId,
        temperament: selectedTemperaments,
      }
    });
  };

  // Wait for user to be checked
  if (isUserLoading) return null;

  // Protect route - must be signed in
  if (!user?.id) {
    setLocation("/auth");
    return null;
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3 text-muted-foreground hover:text-foreground">
          <Link href="/pack"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Matches</Link>
        </Button>
        <h1 className="font-display text-3xl font-bold tracking-tight">Add Your Dog</h1>
        <p className="text-muted-foreground mt-2">Create a profile so neighbors can recognize your furry friend.</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="space-y-4">
                <h3 className="font-display text-lg font-semibold border-b border-border/40 pb-2">The Basics</h3>
                
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dog's Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Bodhi" className="max-w-md bg-background" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>About Them</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="A little bit about their personality, favorite games, or quirks..." 
                          className="resize-none min-h-[100px] bg-background" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Helps others know how to interact with your dog.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="font-display text-lg font-semibold border-b border-border/40 pb-2">Photo</h3>
                
                <FormField
                  control={form.control}
                  name="photoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Photo URL</FormLabel>
                      <FormControl>
                        <div className="flex gap-2 max-w-md">
                          <Input placeholder="https://example.com/photo.jpg" className="bg-background" {...field} />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Paste a link to a public photo of your dog.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="font-display text-lg font-semibold border-b border-border/40 pb-2">Personality & Hangouts</h3>

                <div className="space-y-3">
                  <FormLabel>Temperament Traits</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_TEMPERAMENTS.map(temp => (
                      <Badge 
                        key={temp}
                        variant={selectedTemperaments.includes(temp) ? "default" : "outline"}
                        className="cursor-pointer text-sm py-1 px-3"
                        onClick={() => toggleTemperament(temp)}
                      >
                        {temp}
                        {selectedTemperaments.includes(temp) && <Check className="ml-1 h-3 w-3" />}
                      </Badge>
                    ))}
                  </div>
                  
                  <div className="flex gap-2 max-w-sm mt-2">
                    <Input 
                      placeholder="Add custom trait..." 
                      value={customTemp}
                      onChange={(e) => setCustomTemp(e.target.value)}
                      onKeyDown={addCustomTemperament}
                      className="h-9 bg-background"
                    />
                    <Button type="button" size="sm" variant="secondary" onClick={addCustomTemperament}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {selectedTemperaments.filter(t => !COMMON_TEMPERAMENTS.includes(t)).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/30">
                      <span className="text-sm text-muted-foreground py-1">Custom:</span>
                      {selectedTemperaments.filter(t => !COMMON_TEMPERAMENTS.includes(t)).map(temp => (
                        <Badge 
                          key={temp}
                          variant="default"
                          className="cursor-pointer text-sm py-1 px-3 bg-primary/20 text-primary-foreground hover:bg-primary/30"
                          onClick={() => toggleTemperament(temp)}
                        >
                          {temp}
                          <X className="ml-1 h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="parkId"
                  render={({ field }) => (
                    <FormItem className="mt-6">
                      <FormLabel>Favorite Park (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="max-w-md bg-background">
                            <SelectValue placeholder="Select a local park" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No favorite park</SelectItem>
                          {parks?.map(park => (
                            <SelectItem key={park.id} value={park.id}>
                              {park.name} ({park.city})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Where do you usually walk?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="button" variant="ghost" className="mr-2" asChild>
                  <Link href="/pack">Cancel</Link>
                </Button>
                <Button type="submit" disabled={createDog.isPending} size="lg">
                  {createDog.isPending ? "Adding..." : "Add Dog to SniffTown"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
