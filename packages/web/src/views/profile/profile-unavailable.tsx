import { Button } from "@/components/ui/button";

/** Shown when the API could not answer a profile lookup (e.g. 503). */
export function ProfileUnavailable({ handle }: { handle: string }) {
  return (
    <div className="container flex flex-col gap-4 py-16 max-w-lg">
      <h1 className="text-xl font-semibold">Profile unavailable</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The service is temporarily unavailable. Please try again in a moment.
      </p>
      <Button variant="outline" className="w-fit" asChild>
        {/* Plain anchor — a full reload is needed to re-run the failed fetch. */}
        <a href={`/u/${encodeURIComponent(handle)}`}>Try again</a>
      </Button>
    </div>
  );
}
