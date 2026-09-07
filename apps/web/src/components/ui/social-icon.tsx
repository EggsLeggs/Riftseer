import { cn } from "@/lib/utils";

interface SocialIconProps {
  svgPath: string;
  className?: string;
  "aria-label"?: string;
}

export function SocialIcon({ svgPath, className, "aria-label": ariaLabel }: SocialIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("shrink-0", className)}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <path d={svgPath} />
    </svg>
  );
}
