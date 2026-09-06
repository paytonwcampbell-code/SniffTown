import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background py-12 md:py-16">
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2">
              <img
                src={`${import.meta.env.BASE_URL}brand/snifftown-logo.png`}
                alt=""
                className="h-8 w-8 rounded-lg object-cover shadow-sm"
              />
              <span className="font-display text-lg font-bold tracking-tight">SniffTown</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Austin's neighborhood dog community. Find playdates, build trusted packs, and trade pet-sitting help.
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
            <p className="text-sm text-muted-foreground">Made with care in Austin, Texas.</p>
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
