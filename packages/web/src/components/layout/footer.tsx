import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container flex items-center justify-between py-4 text-sm text-muted-foreground">
        <span>&copy; {new Date().getFullYear()} Riftseer</span>
        <div className="flex gap-4">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </div>
      </div>
    </footer>
  );
}
