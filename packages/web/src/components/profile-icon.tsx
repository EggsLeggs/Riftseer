import { cn } from "@/lib/utils";

/**
 * Initials avatar for a user. Profile images are not stored yet — this is the
 * one place that fact is drawn, so a later photo slot lands here rather than
 * in every call site.
 */

const SIZES = {
  sm: "size-6 text-[10px]",
  md: "size-9 text-xs",
  lg: "size-16 text-lg",
} as const;

export function profileInitials(
  username?: string | null,
  handle?: string | null,
): string {
  const source = username?.trim() || handle?.trim() || "?";
  return source.slice(0, 2).toUpperCase();
}

export function ProfileIcon({
  username,
  handle,
  size = "md",
  className,
}: {
  username?: string | null;
  handle?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const label = username?.trim() || (handle ? `@${handle}` : "Unknown user");
  return (
    <span
      className={cn(
        "bg-muted flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        SIZES[size],
        className,
      )}
      aria-hidden="true"
      title={label}
    >
      {profileInitials(username, handle)}
    </span>
  );
}
