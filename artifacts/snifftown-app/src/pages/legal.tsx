import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  useDeleteAccount,
  useGetCurrentUser,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const CONTACT_EMAIL = "hello@snifftown.com";
const EFFECTIVE_DATE = "October 11, 2026";

function LegalPage({ title, children, dated = true }: { title: string; children: ReactNode; dated?: boolean }) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">{title}</h1>
      {dated && <p className="mt-2 text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>}
      <div className="mt-8 space-y-6 text-base leading-relaxed text-foreground [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:pt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_a]:text-primary [&_a]:underline">
        {children}
      </div>
    </div>
  );
}

const contact = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        SniffTown is a neighborhood dog community for Austin. This policy explains what we collect when you use the
        SniffTown website and mobile app, why, and the choices you have. We don't sell your information and we don't
        use advertising or third-party tracking.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your email address, password (stored only as a secure hash by our authentication provider) and the name you choose to show.</li>
        <li><strong>Dog profiles:</strong> what you enter about your dog, such as name, photo, breed, size, age, temperament, play style, availability and what kind of company your dog enjoys.</li>
        <li><strong>Approximate location (optional):</strong> if you turn on Nearby dog discovery, the app reads your device location while you are using it so it can show dogs within your chosen distance. Other members see an approximate distance, never your exact location or a map pin. Turning the setting off clears your saved location.</li>
        <li><strong>What you share in the community:</strong> park packs you create or join, posts on pack boards, private messages, pack and pet-sitting requests.</li>
        <li><strong>Safety records:</strong> reports you file and members you block.</li>
        <li><strong>Contact messages:</strong> your name, email and message if you use our contact form.</li>
        <li><strong>Basic technical data:</strong> standard server logs (such as IP address, device type and error details) kept briefly to run and secure the service.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run SniffTown: your account, showing your dog to nearby members, packs, messaging and pet-sitting exchanges.</li>
        <li>To keep the community safe: reviewing reports, enforcing our Terms and preventing abuse.</li>
        <li>To send account email, such as verifying your address, and to reply when you contact us.</li>
      </ul>

      <h2>Who can see what</h2>
      <p>
        Your dog profile and display name are visible to other SniffTown members. Pack boards are visible to members of
        that pack. Private messages are visible only to you and the person you're messaging. Reports are private; the
        person you report is never told who reported them.
      </p>

      <h2>Service providers</h2>
      <p>We share information only with providers that help us run SniffTown, and only for that purpose:</p>
      <ul>
        <li><strong>Supabase</strong> stores our database and handles sign-in.</li>
        <li><strong>Resend</strong> sends our email.</li>
        <li><strong>Replit</strong> hosts our website and servers.</li>
      </ul>
      <p>We may also disclose information if required by law or to protect someone's safety.</p>

      <h2>Cookies</h2>
      <p>
        The website uses only the cookies needed to keep you signed in. The mobile app stores your sign-in securely on
        your device. We don't use advertising or analytics cookies.
      </p>

      <h2>Keeping and deleting your information</h2>
      <p>
        We keep your information while your account is open. You can delete your account at any time from{" "}
        <strong>Settings → Delete account</strong> in the app, or on our <Link href="/delete-account">account deletion page</Link>.
        Deleting your account permanently removes your login, dog profiles, messages, posts and pack memberships right
        away. Park packs you started are handed to another member so the community can continue. Server logs and
        backups are cleared on their normal schedule, typically within 30 days.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You can update your profile in the app, turn location off at any time, and ask us for a copy of your
        information or to correct or delete it by emailing {contact}. Depending on where you live, you may have
        additional rights under local privacy laws, and we'll honor them.
      </p>

      <h2>Children</h2>
      <p>SniffTown is for adults 18 and older. We don't knowingly collect information from children.</p>

      <h2>Changes</h2>
      <p>If we make meaningful changes we'll update this page and the effective date, and let you know in the app.</p>

      <h2>Contact</h2>
      <p>Questions about privacy? Email {contact}.</p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        These terms apply when you use the SniffTown website or mobile app. By creating an account you agree to them.
      </p>

      <h2>Who can use SniffTown</h2>
      <p>You must be at least 18 years old and able to agree to these terms. One account per person, please.</p>

      <h2>Be a good neighbor</h2>
      <p>SniffTown has no tolerance for objectionable content or abusive members. You agree not to:</p>
      <ul>
        <li>Harass, threaten, bully or discriminate against anyone.</li>
        <li>Post content that is hateful, sexual, violent, illegal or that you don't have the right to share.</li>
        <li>Spam, scam or advertise, or pretend to be someone else.</li>
        <li>Misrepresent your dog's temperament, health or behavior in a way that could put people or animals at risk.</li>
        <li>Try to access other members' accounts or interfere with the service.</li>
      </ul>
      <p>
        You can report a member or block them from any conversation or dog profile using the <strong>…</strong> menu.
        We review reports within 24 hours and may remove content or suspend accounts that break these rules.
      </p>

      <h2>Meeting up, walks and pet sitting</h2>
      <p>
        SniffTown helps neighbors find each other; we don't screen members or their dogs and we aren't part of any
        arrangement you make. Meet in public places, introduce dogs carefully, and use your own judgment. You are
        responsible for your dog, including vaccinations, leash laws and any injury or damage it causes. Pet-sitting
        exchanges are informal agreements between members.
      </p>

      <h2>Your content</h2>
      <p>
        You own what you post. You give SniffTown permission to store and display it to other members so the service
        works. You can delete your content or your whole account at any time.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account from <strong>Settings → Delete account</strong>. We may suspend or close accounts that
        break these terms or put others at risk.
      </p>

      <h2>No warranties; limits on liability</h2>
      <p>
        SniffTown is provided "as is". To the fullest extent allowed by law, we aren't liable for indirect or
        consequential damages, or for the actions of members or their dogs, and our total liability is limited to $100.
      </p>

      <h2>Changes and governing law</h2>
      <p>
        We may update these terms and will let you know in the app when we do. These terms are governed by the laws of
        the State of Texas.
      </p>

      <h2>Contact</h2>
      <p>Questions? Email {contact}.</p>
    </LegalPage>
  );
}

export function DeleteAccount() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetCurrentUser();
  const deletion = useDeleteAccount({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), { id: null, email: null, displayName: null });
        queryClient.clear();
        setLocation("/");
      },
    },
  });
  const deletionError = (deletion.error as { data?: { error?: unknown } } | null)?.data?.error;

  return (
    <LegalPage title="Delete your SniffTown account" dated={false}>
      <p>
        Deleting your account permanently removes your login, dog profiles, messages, pack posts and pack memberships.
        Park packs you started are handed to another member so the community can continue. This can't be undone.
      </p>

      <h2>In the app</h2>
      <p>Open SniffTown, go to <strong>Settings</strong>, and tap <strong>Delete account</strong>.</p>

      <h2>On the web</h2>
      {isLoading ? (
        <p className="text-muted-foreground">Checking your sign-in…</p>
      ) : user?.id ? (
        <div className="space-y-4">
          <p>You're signed in as <strong>{user.email}</strong>.</p>
          {deletion.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Your account was not deleted</AlertTitle>
              <AlertDescription>
                {typeof deletionError === "string" ? deletionError : "Please try again."}
              </AlertDescription>
            </Alert>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deletion.isPending}>
                {deletion.isPending ? "Deleting…" : "Delete my account"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your account, dog profiles, messages and pack posts. It can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deletion.mutate()}>Delete account</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <p>
          <Link href="/auth">Sign in</Link>, then come back to this page to delete your account.
        </p>
      )}

      <h2>Can't sign in?</h2>
      <p>
        Email {contact} from the address on your account and we'll delete it for you within 7 days.
      </p>
    </LegalPage>
  );
}
