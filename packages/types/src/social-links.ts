/** Platform ids — keep in sync with `packages/web/src/lib/social-platforms.ts`. */
export const SOCIAL_PLATFORM_IDS = [
  "kick",
  "youtube",
  "twitch",
  "instagram",
  "facebook",
  "linkedin",
  "discord",
  "kofi",
  "patreon",
  "bluesky",
  "twitter",
  "reddit",
] as const;

export type SocialPlatformId = (typeof SOCIAL_PLATFORM_IDS)[number];

const PLATFORM_LABELS: Record<SocialPlatformId, string> = {
  kick: "Kick",
  youtube: "YouTube",
  twitch: "Twitch",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  discord: "Discord",
  kofi: "Ko-fi",
  patreon: "Patreon",
  bluesky: "Bluesky",
  twitter: "X / Twitter",
  reddit: "Reddit",
};

const KICK_RESERVED = new Set([
  "about",
  "browse",
  "categories",
  "category",
  "dashboard",
  "directory",
  "search",
  "settings",
  "video",
  "videos",
]);

function stripWww(host: string): string {
  return host.replace(/^www\./i, "");
}

function parseHttpUrl(value: string): URL | null {
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProto);
  } catch {
    return null;
  }
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function wrongHost(platform: SocialPlatformId): string {
  return `URL must be from ${PLATFORM_LABELS[platform]}.`;
}

function validateKick(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid Kick profile URL (e.g. https://kick.com/username).";
  if (stripWww(url.hostname) !== "kick.com") return wrongHost("kick");

  const segments = pathSegments(url.pathname);
  if (segments.length !== 1) {
    return "Enter a Kick channel URL (kick.com/username), not another page.";
  }

  const slug = segments[0]!;
  if (KICK_RESERVED.has(slug.toLowerCase())) {
    return "Enter a Kick channel URL, not a site page.";
  }
  if (!/^[a-zA-Z0-9_]{1,25}$/.test(slug)) {
    return "Invalid Kick username.";
  }
  return null;
}

function validateYoutube(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid YouTube channel URL.";
  const host = stripWww(url.hostname);
  if (host === "youtu.be") return "Use a channel URL, not a video link.";
  if (!["youtube.com", "m.youtube.com"].includes(host)) return wrongHost("youtube");

  const path = url.pathname;
  if (
    /^\/@[^/]+\/?$/.test(path) ||
    /^\/c\/[^/]+\/?$/.test(path) ||
    /^\/channel\/[^/]+\/?$/.test(path) ||
    /^\/user\/[^/]+\/?$/.test(path)
  ) {
    return null;
  }
  return "Enter a YouTube channel URL (e.g. youtube.com/@channel).";
}

function validateTwitch(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid Twitch profile URL.";
  if (stripWww(url.hostname) !== "twitch.tv") return wrongHost("twitch");

  const segments = pathSegments(url.pathname);
  if (segments.length !== 1 || !/^[a-zA-Z0-9_]{1,25}$/.test(segments[0]!)) {
    return "Enter a Twitch channel URL (twitch.tv/username).";
  }
  return null;
}

function validateInstagram(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid Instagram profile URL.";
  if (!["instagram.com", "m.instagram.com"].includes(stripWww(url.hostname))) {
    return wrongHost("instagram");
  }

  const segments = pathSegments(url.pathname);
  const blocked = new Set(["p", "reel", "reels", "stories", "explore", "tv", "accounts"]);
  if (segments.length !== 1 || blocked.has(segments[0]!.toLowerCase())) {
    return "Enter an Instagram profile URL (instagram.com/username).";
  }
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(segments[0]!)) {
    return "Invalid Instagram username.";
  }
  return null;
}

function validateFacebook(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid Facebook profile URL.";
  const host = stripWww(url.hostname);
  if (!["facebook.com", "fb.com", "m.facebook.com"].includes(host)) {
    return wrongHost("facebook");
  }

  const segments = pathSegments(url.pathname);
  const blocked = new Set([
    "groups",
    "watch",
    "events",
    "marketplace",
    "gaming",
    "photo.php",
    "story.php",
    "share",
  ]);
  if (segments.length === 1 && !blocked.has(segments[0]!.toLowerCase())) {
    if (/^[a-zA-Z0-9.]{1,50}$/.test(segments[0]!)) return null;
  }
  if (segments[0] === "profile.php" && url.searchParams.has("id")) return null;

  return "Enter a Facebook profile or page URL (facebook.com/username).";
}

function validateLinkedin(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid LinkedIn profile URL.";
  if (stripWww(url.hostname) !== "linkedin.com") return wrongHost("linkedin");

  const segments = pathSegments(url.pathname);
  if (segments[0] === "in" && segments.length === 2 && /^[a-zA-Z0-9\-_%]+$/.test(segments[1]!)) {
    return null;
  }
  return "Enter a LinkedIn profile URL (linkedin.com/in/username).";
}

function validateDiscord(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    if (/^[\w.\-]{2,32}$/.test(trimmed)) return null;
    return "Enter a Discord invite URL or username.";
  }

  const url = parseHttpUrl(trimmed);
  if (!url) return "Enter a valid Discord invite URL or username.";

  const host = stripWww(url.hostname);
  if (host === "discord.gg") {
    const code = pathSegments(url.pathname)[0];
    if (code && /^[\w-]{2,32}$/.test(code)) return null;
  }
  if (host === "discord.com") {
    const segments = pathSegments(url.pathname);
    if (segments[0] === "invite" && segments[1] && /^[\w-]{2,32}$/.test(segments[1])) {
      return null;
    }
    if (segments[0] === "users" && segments[1] && /^\d+$/.test(segments[1])) {
      return null;
    }
  }
  return "Enter a Discord invite (discord.gg/…) or username.";
}

function validateKofi(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid Ko-fi profile URL.";
  if (stripWww(url.hostname) !== "ko-fi.com") return wrongHost("kofi");

  const segments = pathSegments(url.pathname);
  if (segments.length === 1 && /^[a-zA-Z0-9_]{1,50}$/.test(segments[0]!)) return null;
  return "Enter a Ko-fi page URL (ko-fi.com/username).";
}

function validatePatreon(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid Patreon profile URL.";
  if (stripWww(url.hostname) !== "patreon.com") return wrongHost("patreon");

  const segments = pathSegments(url.pathname);
  if (segments.length === 1 && !["posts", "membership", "checkout"].includes(segments[0]!)) {
    if (/^[a-zA-Z0-9_]{1,50}$/.test(segments[0]!)) return null;
  }
  return "Enter a Patreon creator URL (patreon.com/username).";
}

function validateBluesky(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid Bluesky profile URL.";
  if (stripWww(url.hostname) !== "bsky.app") return wrongHost("bluesky");

  const segments = pathSegments(url.pathname);
  if (segments[0] === "profile" && segments.length === 2 && segments[1]!.length >= 3) {
    return null;
  }
  return "Enter a Bluesky profile URL (bsky.app/profile/handle).";
}

function validateTwitter(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid X profile URL.";
  const host = stripWww(url.hostname);
  if (!["x.com", "twitter.com"].includes(host)) return wrongHost("twitter");

  const segments = pathSegments(url.pathname);
  const blocked = new Set(["home", "search", "explore", "i", "intent", "share", "status"]);
  if (segments.length === 1 && !blocked.has(segments[0]!.toLowerCase())) {
    if (/^[a-zA-Z0-9_]{1,15}$/.test(segments[0]!)) return null;
  }
  return "Enter an X profile URL (x.com/username).";
}

function validateReddit(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return "Enter a valid Reddit profile URL.";
  const host = stripWww(url.hostname);
  if (!["reddit.com", "old.reddit.com"].includes(host)) return wrongHost("reddit");

  const segments = pathSegments(url.pathname);
  if (
    (segments[0] === "u" || segments[0] === "user") &&
    segments.length === 2 &&
    /^[a-zA-Z0-9_-]{1,20}$/.test(segments[1]!)
  ) {
    return null;
  }
  return "Enter a Reddit profile URL (reddit.com/u/username).";
}

const VALIDATORS: Record<SocialPlatformId, (value: string) => string | null> = {
  kick: validateKick,
  youtube: validateYoutube,
  twitch: validateTwitch,
  instagram: validateInstagram,
  facebook: validateFacebook,
  linkedin: validateLinkedin,
  discord: validateDiscord,
  kofi: validateKofi,
  patreon: validatePatreon,
  bluesky: validateBluesky,
  twitter: validateTwitter,
  reddit: validateReddit,
};

/** Returns an error message, or null if the value is valid (empty is valid). */
export function validateSocialLink(platformId: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!(SOCIAL_PLATFORM_IDS as readonly string[]).includes(platformId)) {
    return "Unknown platform.";
  }

  return VALIDATORS[platformId as SocialPlatformId](trimmed);
}

/** Returns the first validation error across all links, or null if all are valid. */
export function validateSocialLinks(links: Record<string, string>): string | null {
  for (const [platformId, value] of Object.entries(links)) {
    const err = validateSocialLink(platformId, value);
    if (err) {
      const label =
        PLATFORM_LABELS[platformId as SocialPlatformId] ?? platformId;
      return `${label}: ${err}`;
    }
  }
  return null;
}
