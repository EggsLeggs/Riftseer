import {
  siBluesky,
  siDiscord,
  siFacebook,
  siInstagram,
  siKick,
  siKofi,
  siPatreon,
  siReddit,
  siTwitch,
  siX,
  siYoutube,
} from "simple-icons";
import { SOCIAL_PLATFORM_IDS, type SocialPlatformId } from "@riftseer/types/social-links";

// LinkedIn SVG path inlined — LinkedIn removed their icon from Simple Icons (disallows reproduction).
// Path sourced from the official LinkedIn brand guidelines (viewBox 0 0 24 24).
const LINKEDIN_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

export interface SocialPlatform {
  id: SocialPlatformId;
  label: string;
  /** SVG path data — viewBox "0 0 24 24", fill currentColor */
  svgPath: string;
  placeholder: string;
}

/**
 * Presentation for every platform the validator supports. Keyed by
 * `SocialPlatformId`, so adding or removing an id in @riftseer/types is a
 * compile error until this map is updated.
 */
const PLATFORM_PRESENTATION: Record<SocialPlatformId, Omit<SocialPlatform, "id">> = {
  kick: {
    label: "Kick",
    svgPath: siKick.path,
    placeholder: "https://kick.com/username",
  },
  youtube: {
    label: "YouTube",
    svgPath: siYoutube.path,
    placeholder: "https://youtube.com/@channel",
  },
  twitch: {
    label: "Twitch",
    svgPath: siTwitch.path,
    placeholder: "https://twitch.tv/username",
  },
  instagram: {
    label: "Instagram",
    svgPath: siInstagram.path,
    placeholder: "https://instagram.com/username",
  },
  facebook: {
    label: "Facebook",
    svgPath: siFacebook.path,
    placeholder: "https://facebook.com/username",
  },
  linkedin: {
    label: "LinkedIn",
    svgPath: LINKEDIN_PATH,
    placeholder: "https://linkedin.com/in/username",
  },
  discord: {
    label: "Discord",
    svgPath: siDiscord.path,
    placeholder: "https://discord.gg/invite or username",
  },
  kofi: {
    label: "Ko-fi",
    svgPath: siKofi.path,
    placeholder: "https://ko-fi.com/username",
  },
  patreon: {
    label: "Patreon",
    svgPath: siPatreon.path,
    placeholder: "https://patreon.com/username",
  },
  bluesky: {
    label: "Bluesky",
    svgPath: siBluesky.path,
    placeholder: "https://bsky.app/profile/handle",
  },
  twitter: {
    label: "X / Twitter",
    svgPath: siX.path,
    placeholder: "https://x.com/username",
  },
  reddit: {
    label: "Reddit",
    svgPath: siReddit.path,
    placeholder: "https://reddit.com/u/username",
  },
};

/**
 * Supported social platforms, in the display order defined by
 * `SOCIAL_PLATFORM_IDS`. To add a platform: add its id in @riftseer/types, then
 * import its icon from simple-icons and add an entry above.
 */
export const SOCIAL_PLATFORMS: SocialPlatform[] = SOCIAL_PLATFORM_IDS.map((id) => ({
  id,
  ...PLATFORM_PRESENTATION[id],
}));
