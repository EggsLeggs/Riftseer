import { describe, expect, test } from "bun:test";
import { validateSocialLink } from "../social-links.ts";

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
});
