"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Star, Users, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SocialIcon } from "@/components/ui/social-icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FollowButton } from "@/features/profile/follow-button";
import { UserDecksList } from "@/features/decks/components/user-decks-list";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";
import type { ProfileData } from "@/features/profile/api";

interface ProfileViewProps {
  profile: ProfileData;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
}

const PROFILE_TABS = ["overview", "decks"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

function parseTab(raw: string | null): ProfileTab {
  return (PROFILE_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as ProfileTab)
    : "overview";
}

export function ProfileView({ profile, isOwnProfile, isLoggedIn }: ProfileViewProps) {
  const [followerCount, setFollowerCount] = useState(profile.follower_count);
  const router = useRouter();
  const searchParams = useSearchParams();
  // `userDecksHref()` links straight to `?tab=decks`, so the URL is the tab
  // state — otherwise every deck link from elsewhere would land on Overview.
  const tab = parseTab(searchParams.get("tab"));

  const selectTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(
        qs
          ? `/u/${encodeURIComponent(profile.handle)}?${qs}`
          : `/u/${encodeURIComponent(profile.handle)}`,
        { scroll: false },
      );
    },
    [profile.handle, router, searchParams],
  );

  const initials = profile.username.slice(0, 2).toUpperCase();

  const activeSocials = SOCIAL_PLATFORMS.filter(
    (p) => profile.social_links[p.id]?.trim(),
  );

  return (
    <div className="container py-8">
      <div className="flex items-start gap-6">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold select-none">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="truncate text-xl font-semibold leading-tight">{profile.username}</h1>
                {profile.is_supporter && (
                  <span className="flex items-center gap-1 text-xs font-medium text-violet-500 shrink-0">
                    <Star className="size-3 fill-current" />
                    Supporter
                  </span>
                )}
                {!profile.is_supporter && profile.is_member && (
                  <span className="flex items-center gap-1 text-xs font-medium text-blue-500 shrink-0">
                    <Users className="size-3" />
                    Member
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                <p className="text-sm text-muted-foreground">@{profile.handle}</p>
                {profile.pronouns.length > 0 && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <p className="text-sm text-muted-foreground">
                      {profile.pronouns.join(", ")}
                    </p>
                  </>
                )}
              </div>
            </div>

            {!isOwnProfile && (
              <div className="shrink-0">
                <FollowButton
                  handle={profile.handle}
                  initialIsFollowing={profile.is_following ?? false}
                  isLoggedIn={isLoggedIn}
                  onCountChange={(delta) => setFollowerCount((c) => c + delta)}
                />
              </div>
            )}
          </div>

          {profile.bio && (
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
              {profile.bio}
            </p>
          )}

          <div className="mt-3 flex gap-4 text-sm">
            <span>
              <span className="font-semibold">{followerCount}</span>{" "}
              <span className="text-muted-foreground">followers</span>
            </span>
            <span>
              <span className="font-semibold">{profile.following_count}</span>{" "}
              <span className="text-muted-foreground">following</span>
            </span>
          </div>

          {activeSocials.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeSocials.map((platform) => {
                const value = profile.social_links[platform.id]!;
                const chipClass =
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors";
                const content = (
                  <>
                    <SocialIcon svgPath={platform.svgPath} className="size-3.5" />
                    <span>{platform.label}</span>
                  </>
                );

                // Some platforms (Discord) accept a bare username, which is not linkable.
                if (!value.startsWith("http")) {
                  return (
                    <span key={platform.id} title={`${platform.label}: ${value}`} className={chipClass}>
                      {content}
                    </span>
                  );
                }

                return (
                  <a
                    key={platform.id}
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={platform.label}
                    className={chipClass}
                  >
                    {content}
                    <ExternalLink className="size-2.5 opacity-50" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Separator className="my-8" />

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="decks">Decks</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <p className="text-sm text-muted-foreground text-center py-8">
            No content yet.
          </p>
        </TabsContent>
        <TabsContent value="decks">
          <UserDecksList handle={profile.handle} isOwnProfile={isOwnProfile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
