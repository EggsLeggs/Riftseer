"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Camera, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SocialIcon } from "@/components/ui/social-icon";
import { validateSocialLink } from "@riftseer/types/social-links";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";
import { updateProfileAction } from "@/features/profile/actions";
import type { ProfileData } from "@/features/profile/api";
import type { Session } from "@/features/auth/types";

const PRONOUN_PRESETS = [
  "he/him",
  "she/her",
  "they/them",
  "he/they",
  "she/they",
  "xe/xem",
  "any/all",
];

const MAX_PRONOUNS = 3;
const MAX_BIO = 300;

interface Props {
  session: Session;
  profile: ProfileData | null;
}

export function ProfileSettingsView({ session, profile }: Props) {
  const [displayName, setDisplayName] = useState(profile?.username ?? session.user.username ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [pronouns, setPronouns] = useState<string[]>(profile?.pronouns ?? []);
  const [customPronoun, setCustomPronoun] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(
    profile?.social_links ?? {},
  );
  const [socialErrors, setSocialErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handle = profile?.handle ?? session.user.handle ?? "";
  const initials = displayName.slice(0, 2).toUpperCase() || "??";

  function togglePreset(preset: string) {
    setPronouns((prev) => {
      if (prev.includes(preset)) return prev.filter((p) => p !== preset);
      if (prev.length >= MAX_PRONOUNS) return prev;
      return [...prev, preset];
    });
  }

  function removePronouns(p: string) {
    setPronouns((prev) => prev.filter((x) => x !== p));
  }

  function addCustomPronoun() {
    const trimmed = customPronoun.trim();
    if (!trimmed || pronouns.includes(trimmed) || pronouns.length >= MAX_PRONOUNS) return;
    setPronouns((prev) => [...prev, trimmed]);
    setCustomPronoun("");
  }

  function handleSocialChange(id: string, value: string) {
    setSocialLinks((prev) => {
      const next = { ...prev };
      if (value.trim()) {
        next[id] = value;
      } else {
        delete next[id];
      }
      return next;
    });

    const err = value.trim() ? validateSocialLink(id, value) : null;
    setSocialErrors((prev) => {
      const next = { ...prev };
      if (err) next[id] = err;
      else delete next[id];
      return next;
    });
  }

  function handleSubmit() {
    const errors: Record<string, string> = {};
    for (const platform of SOCIAL_PLATFORMS) {
      const val = socialLinks[platform.id]?.trim();
      if (val) {
        const err = validateSocialLink(platform.id, val);
        if (err) errors[platform.id] = err;
      }
    }
    if (Object.keys(errors).length > 0) {
      setSocialErrors(errors);
      setFeedback({ type: "error", message: "Fix the social link errors before saving." });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const result = await updateProfileAction({
        username: displayName,
        bio,
        pronouns,
        social_links: socialLinks,
      });
      if ("error" in result) {
        setFeedback({ type: "error", message: result.error ?? "Failed to save profile." });
      } else {
        setFeedback({ type: "success", message: "Profile saved." });
      }
    });
  }

  return (
    <div className="container py-8">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link href="/settings" className="hover:text-foreground transition-colors">
          Settings
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">User Profile</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">User Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your public profile — display name, bio, pronouns, and social links.
        </p>
      </div>

      <div className="space-y-8">
        {/* Avatar */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Avatar
          </h2>
          <div className="flex items-center gap-5">
            <div className="relative size-20 shrink-0">
              <div className="flex size-20 items-center justify-center rounded-full bg-muted text-lg font-semibold select-none">
                {initials}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity cursor-not-allowed">
                <Camera className="size-5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Profile picture</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Avatar customization is coming soon.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Basic Info */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Basic Info
          </h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="Your display name"
              />
              <p className="text-xs text-muted-foreground">
                This is how your name appears across the site.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Username</Label>
              <div className="flex items-center gap-2">
                <div className="flex h-9 flex-1 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground select-none">
                  @{handle}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings/security">Change username</Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Username changes are managed in Login &amp; Security. Note: changing your @handle
                will break existing links to your profile.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* About */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            About
          </h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="bio">Bio</Label>
                <span className="text-xs text-muted-foreground">
                  {bio.length}/{MAX_BIO}
                </span>
              </div>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
                placeholder="Tell people a little about yourself…"
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Pronouns{" "}
                <span className="font-normal text-muted-foreground">
                  (up to {MAX_PRONOUNS})
                </span>
              </Label>

              {/* Preset chips */}
              <div className="flex flex-wrap gap-1.5">
                {PRONOUN_PRESETS.map((preset) => {
                  const selected = pronouns.includes(preset);
                  const disabled = !selected && pronouns.length >= MAX_PRONOUNS;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => togglePreset(preset)}
                      aria-pressed={selected}
                      disabled={disabled}
                      className={[
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-foreground hover:bg-muted",
                        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                      ].join(" ")}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              {/* Selected pronouns */}
              {pronouns.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pronouns.map((p) => (
                    <span
                      key={p}
                      className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
                    >
                      {p}
                      <button
                        type="button"
                        onClick={() => removePronouns(p)}
                        className="ml-0.5 rounded-full hover:text-destructive transition-colors"
                        aria-label={`Remove ${p}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Custom pronoun input */}
              {pronouns.length < MAX_PRONOUNS && (
                <div className="flex gap-2">
                  <Input
                    value={customPronoun}
                    onChange={(e) => setCustomPronoun(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomPronoun();
                      }
                    }}
                    placeholder="Add custom (e.g. ey/em)"
                    className="h-8 text-sm"
                    maxLength={30}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addCustomPronoun}
                    disabled={!customPronoun.trim() || pronouns.includes(customPronoun.trim())}
                    className="h-8 px-2"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <Separator />

        {/* Social Links */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Social Links
          </h2>
          <div className="space-y-3">
            {SOCIAL_PLATFORMS.map((platform) => (
              <div key={platform.id} className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="flex w-28 shrink-0 items-center gap-2 text-sm text-muted-foreground">
                    <SocialIcon
                      svgPath={platform.svgPath}
                      className="size-4"
                      aria-label={platform.label}
                    />
                    <span className="truncate">{platform.label}</span>
                  </div>
                  <Input
                    value={socialLinks[platform.id] ?? ""}
                    onChange={(e) => handleSocialChange(platform.id, e.target.value)}
                    placeholder={platform.placeholder}
                    type="url"
                    aria-invalid={!!socialErrors[platform.id]}
                    className="text-sm"
                  />
                </div>
                {socialErrors[platform.id] && (
                  <p className="pl-31 text-xs text-destructive">
                    {socialErrors[platform.id]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Feedback + Save */}
        {feedback && (
          <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
