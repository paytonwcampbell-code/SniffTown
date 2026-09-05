import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background py-12 md:py-16">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 18c-3.3 0-6-1.8-6-4 0-1.7 1.8-3 4-3 1.1 0 2 .4 2 1s.9 1 2 1 2-.4 2-1 1.8-1 4-1 4 1.3 4 3c0 2.2-2.7 4-6 4z" />
                  <circle cx="7.5" cy="8.5" r="2.5" />
                  <circle cx="16.5" cy="8.5" r="2.5" />
                  <circle cx="12" cy="5" r="2.5" />
                </svg>
              </div>
              <span className="font-display text-lg font-bold tracking-tight">SniffTown</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              The neighborhood dog community. Find walking buddies, share local park updates, and build your pack.
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            <h3 className="font-display font-semibold text-foreground">Explore</h3>
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">Nearby Dogs</Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">Local Parks</Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">Public Packs</Link>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-display font-semibold text-foreground">Community</h3>
            <Link href="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">Sign In</Link>
            <Link href="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">Create Account</Link>
            <Link href="/dogs/new" className="text-sm text-muted-foreground hover:text-primary transition-colors">Add Your Dog</Link>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="font-display font-semibold text-foreground">Contact</h3>
            <a href="mailto:hello@snifftown.com" className="text-sm text-muted-foreground hover:text-primary transition-colors">hello@snifftown.com</a>
            <p className="text-sm text-muted-foreground">Made with care for local communities.</p>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-border/40 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} SniffTown. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Privacy</span>
            <span className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Terms</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
