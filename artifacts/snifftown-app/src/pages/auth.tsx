import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useSignIn,
  useSignUp,
  getGetCurrentUserQueryKey,
  getListDogsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dog, MailCheck, AlertCircle } from "lucide-react";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type AuthFormValues = z.infer<typeof authSchema>;

export default function Auth() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signIn = useSignIn({
    mutation: {
      onSuccess: (data) => {
        if (data.requiresEmailVerification) {
          setVerificationSentTo(data.user.email);
        } else {
          queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user);
          queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
          setLocation("/");
        }
      },
      onError: () => {
        form.setError("root", { message: "Invalid email or password. Please try again." });
      }
    }
  });

  const signUp = useSignUp({
    mutation: {
      onSuccess: (data) => {
        if (data.requiresEmailVerification) {
          setVerificationSentTo(data.user.email);
        } else {
          queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user);
          queryClient.invalidateQueries({ queryKey: getListDogsQueryKey() });
          setLocation("/");
        }
      },
      onError: (error) => {
        // Simple error handling
        form.setError("root", { message: "Failed to create account. Email may already be in use." });
      }
    }
  });

  const onSubmit = (data: AuthFormValues) => {
    form.clearErrors("root");
    if (activeTab === "signin") {
      signIn.mutate({ data });
    } else {
      signUp.mutate({ data });
    }
  };

  if (verificationSentTo) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 shadow-lg">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MailCheck className="h-8 w-8" />
            </div>
            <CardTitle className="font-display text-2xl">Check your email</CardTitle>
            <CardDescription className="text-base">
              We've sent a verification link to <span className="font-medium text-foreground">{verificationSentTo}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button variant="outline" className="w-full" onClick={() => setVerificationSentTo(null)}>
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPending = signIn.isPending || signUp.isPending;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground mb-4">
            <Dog className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Welcome to SniffTown</h1>
          <p className="text-muted-foreground">Join your local dog community today.</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "signin" | "signup")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Create Account</TabsTrigger>
          </TabsList>

          <Card className="border-border/50 shadow-lg">
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {form.formState.errors.root && (
                    <Alert variant="destructive" className="bg-destructive/10 text-destructive border-none">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                    </Alert>
                  )}
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="you@example.com" 
                            type="email"
                            autoComplete="email"
                            className="bg-background"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="••••••••" 
                            type="password"
                            autoComplete={activeTab === "signin" ? "current-password" : "new-password"}
                            className="bg-background"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full font-medium" 
                    size="lg"
                    disabled={isPending}
                  >
                    {isPending ? "Please wait..." : (activeTab === "signin" ? "Sign In" : "Create Account")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    </div>
  );
}
