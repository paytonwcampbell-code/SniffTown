import { Link, useLocation } from "wouter";
import { useGetCurrentUser, useSignOut, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useGetCurrentUser();
  const queryClient = useQueryClient();
  
  const signOut = useSignOut({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), { id: null, email: null, displayName: null });
        setLocation("/");
      }
    }
  });

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {/* Paw print abstraction without emoji */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M12 18c-3.3 0-6-1.8-6-4 0-1.7 1.8-3 4-3 1.1 0 2 .4 2 1s.9 1 2 1 2-.4 2-1 1.8-1 4-1 4 1.3 4 3c0 2.2-2.7 4-6 4z" />
              <circle cx="7.5" cy="8.5" r="2.5" />
              <circle cx="16.5" cy="8.5" r="2.5" />
              <circle cx="12" cy="5" r="2.5" />
            </svg>
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-foreground">SniffTown</span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6">
          <Link href="/" className={`text-sm font-medium transition-colors hover:text-primary ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}>
            Explore
          </Link>
          
          {user?.id ? (
            <>
              <Link href="/pack" className={`text-sm font-medium transition-colors hover:text-primary ${location === '/pack' ? 'text-primary' : 'text-muted-foreground'}`}>
                My Pack
              </Link>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarFallback className="bg-secondary text-secondary-foreground font-display font-medium">
                        {user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.displayName}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/pack" className="flex w-full cursor-pointer items-center">
                      <Users className="mr-2 h-4 w-4" />
                      <span>My Pack</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dogs/new" className="flex w-full cursor-pointer items-center">
                      <User className="mr-2 h-4 w-4" />
                      <span>Add Dog</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive cursor-pointer"
                    onClick={() => signOut.mutate()}
                    disabled={signOut.isPending}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild className="hidden sm:inline-flex">
                <Link href="/auth">Sign In</Link>
              </Button>
              <Button asChild className="rounded-full shadow-sm hover:shadow-md transition-all">
                <Link href="/auth">Join Pack</Link>
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
