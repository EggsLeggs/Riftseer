import type { ReactNode } from "react";

export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-4 text-2xl font-bold tracking-tight text-foreground">{children}</h3>
  );
}

export function Text({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-base leading-relaxed text-foreground">{children}</p>;
}

export function UnorderedList({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-4 list-disc space-y-3 pl-6 text-base leading-relaxed text-foreground">{children}</ul>
  );
}

export function ListItem({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

export function InlineLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}
