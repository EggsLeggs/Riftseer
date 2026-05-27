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

// LinkedIn SVG path inlined — LinkedIn removed their icon from Simple Icons (disallows reproduction).
// Path sourced from the official LinkedIn brand guidelines (viewBox 0 0 24 24).
const LINKEDIN_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

export interface SocialPlatform {
  id: string;
  label: string;
  /** SVG path data — viewBox "0 0 24 24", fill currentColor */
  svgPath: string;
  placeholder: string;
}

/**
 * Ordered list of supported social platforms.
 * To add a new platform: import its icon from simple-icons and append an entry here.
 */
export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: "kick",
    label: "Kick",
    svgPath: siKick.path,
    placeholder: "https://kick.com/username",
  },
  {
    id: "youtube",
    label: "YouTube",
    svgPath: siYoutube.path,
    placeholder: "https://youtube.com/@channel",
  },
  {
    id: "twitch",
    label: "Twitch",
    svgPath: siTwitch.path,
    placeholder: "https://twitch.tv/username",
  },
  {
    id: "instagram",
    label: "Instagram",
    svgPath: siInstagram.path,
    placeholder: "https://instagram.com/username",
  },
  {
    id: "facebook",
    label: "Facebook",
    svgPath: siFacebook.path,
    placeholder: "https://facebook.com/username",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    svgPath: LINKEDIN_PATH,
    placeholder: "https://linkedin.com/in/username",
  },
  {
    id: "discord",
    label: "Discord",
    svgPath: siDiscord.path,
    placeholder: "https://discord.gg/invite or username",
  },
  {
    id: "kofi",
    label: "Ko-fi",
    svgPath: siKofi.path,
    placeholder: "https://ko-fi.com/username",
  },
  {
    id: "patreon",
    label: "Patreon",
    svgPath: siPatreon.path,
    placeholder: "https://patreon.com/username",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    svgPath: siBluesky.path,
    placeholder: "https://bsky.app/profile/handle",
  },
  {
    id: "twitter",
    label: "X / Twitter",
    svgPath: siX.path,
    placeholder: "https://x.com/username",
  },
  {
    id: "reddit",
    label: "Reddit",
    svgPath: siReddit.path,
    placeholder: "https://reddit.com/u/username",
  },
];
