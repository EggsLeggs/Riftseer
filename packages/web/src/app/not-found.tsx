import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center">
      <Image
        src="/lambsheep.png"
        alt="Kindred lamb looking lost"
        width={300}
        height={240}
        priority
      />

      <div className="flex flex-col items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          You got lost in the jungle
        </h1>
        <p className="text-muted-foreground max-w-sm">
          There&apos;s nothing to show here. We may have deleted this page or
          moved it to a new home. Sorry about that!
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-foreground/80"
      >
        Go back
      </Link>

      <p className="fixed bottom-6 font-mono text-xs font-bold tracking-widest text-muted-foreground/50 select-none">
        HTTP/1.1 404 Not Found
      </p>
    </div>
  );
}
