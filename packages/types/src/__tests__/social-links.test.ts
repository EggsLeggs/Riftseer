import { describe, expect, test } from "bun:test";
import { validateSocialLink, validateSocialLinks } from "../social-links.ts";

describe("validateSocialLink", () => {
  test("kick accepts channel URLs", () => {
    expect(validateSocialLink("kick", "https://kick.com/xqc")).toBeNull();
    expect(validateSocialLink("kick", "kick.com/EggsLeggs")).toBeNull();
  });

  test("kick rejects non-channel pages", () => {
    expect(validateSocialLink("kick", "https://kick.com/category/just-chatting")).not.toBeNull();
    expect(validateSocialLink("kick", "https://kick.com/xqc/videos")).not.toBeNull();
    expect(validateSocialLink("kick", "https://kick.com/categories")).not.toBeNull();
  });

  test("kick rejects other platforms", () => {
    expect(validateSocialLink("kick", "https://github.com/EggsLeggs")).not.toBeNull();
    expect(validateSocialLink("kick", "https://twitch.tv/xqc")).not.toBeNull();
  });

  test("youtube accepts channel URLs", () => {
    expect(validateSocialLink("youtube", "https://youtube.com/@channel")).toBeNull();
    expect(validateSocialLink("youtube", "https://youtube.com/c/MyChannel")).toBeNull();
  });

  test("youtube rejects video URLs", () => {
    expect(validateSocialLink("youtube", "https://youtu.be/dQw4w9WgXcQ")).not.toBeNull();
    expect(validateSocialLink("youtube", "https://youtube.com/watch?v=abc")).not.toBeNull();
  });

  test("twitter rejects status URLs", () => {
    expect(validateSocialLink("twitter", "https://x.com/someuser")).toBeNull();
    expect(validateSocialLink("twitter", "https://x.com/someuser/status/123")).not.toBeNull();
  });

  test("discord accepts invite and username", () => {
    expect(validateSocialLink("discord", "https://discord.gg/abc123")).toBeNull();
    expect(validateSocialLink("discord", "myusername")).toBeNull();
  });

  test("reddit accepts profile URLs", () => {
    expect(validateSocialLink("reddit", "https://reddit.com/u/spez")).toBeNull();
    expect(validateSocialLink("reddit", "https://reddit.com/r/all")).not.toBeNull();
  });

  test("twitch accepts channel URLs and rejects other pages", () => {
    expect(validateSocialLink("twitch", "https://twitch.tv/xqc")).toBeNull();
    expect(validateSocialLink("twitch", "twitch.tv/xqc")).toBeNull();
    expect(validateSocialLink("twitch", "https://twitch.tv/directory/game/chess")).not.toBeNull();
    expect(validateSocialLink("twitch", "https://kick.com/xqc")).not.toBeNull();
  });

  test("instagram accepts profiles and rejects posts", () => {
    expect(validateSocialLink("instagram", "https://instagram.com/nasa")).toBeNull();
    expect(validateSocialLink("instagram", "https://instagram.com/p/abc123")).not.toBeNull();
    expect(validateSocialLink("instagram", "https://instagram.com/stories/nasa")).not.toBeNull();
  });

  test("facebook accepts pages and numeric profile links", () => {
    expect(validateSocialLink("facebook", "https://facebook.com/zuck")).toBeNull();
    expect(validateSocialLink("facebook", "https://facebook.com/profile.php?id=1234")).toBeNull();
    expect(validateSocialLink("facebook", "https://facebook.com/groups/riftbound")).not.toBeNull();
  });

  test("linkedin accepts /in/ profiles only", () => {
    expect(validateSocialLink("linkedin", "https://linkedin.com/in/some-user")).toBeNull();
    expect(validateSocialLink("linkedin", "https://linkedin.com/company/riftseer")).not.toBeNull();
  });

  test("kofi accepts page URLs", () => {
    expect(validateSocialLink("kofi", "https://ko-fi.com/riftseer")).toBeNull();
    expect(validateSocialLink("kofi", "https://ko-fi.com/riftseer/shop")).not.toBeNull();
  });

  test("patreon accepts creator URLs and rejects site pages", () => {
    expect(validateSocialLink("patreon", "https://patreon.com/riftseer")).toBeNull();
    expect(validateSocialLink("patreon", "https://patreon.com/posts")).not.toBeNull();
  });

  test("bluesky accepts profile URLs", () => {
    expect(validateSocialLink("bluesky", "https://bsky.app/profile/riftseer.bsky.social")).toBeNull();
    expect(validateSocialLink("bluesky", "https://bsky.app/riftseer")).not.toBeNull();
  });

  test("empty values are valid", () => {
    expect(validateSocialLink("kick", "")).toBeNull();
    expect(validateSocialLink("kick", "   ")).toBeNull();
  });

  test("unknown platforms are rejected", () => {
    expect(validateSocialLink("myspace", "https://myspace.com/riftseer")).toBe("Unknown platform.");
  });
});

describe("validateSocialLinks", () => {
  test("returns null when every link is valid", () => {
    expect(
      validateSocialLinks({
        kick: "https://kick.com/xqc",
        twitch: "https://twitch.tv/xqc",
        discord: "myusername",
      }),
    ).toBeNull();
  });

  test("prefixes the failing platform label", () => {
    expect(validateSocialLinks({ twitch: "https://kick.com/xqc" })).toBe(
      "Twitch: URL must be from Twitch.",
    );
  });

  test("falls back to the raw id for unknown platforms", () => {
    expect(validateSocialLinks({ myspace: "https://myspace.com/riftseer" })).toBe(
      "myspace: Unknown platform.",
    );
  });
});
