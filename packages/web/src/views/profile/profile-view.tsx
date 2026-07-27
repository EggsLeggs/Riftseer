"use client";

import { useState } from "react";
import { Star, Users, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SocialIcon } from "@/components/ui/social-icon";
import { FollowButton } from "@/features/profile/follow-button";
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms";
import type { ProfileData } from "@/features/profile/api";

interface ProfileViewProps {
  profile: ProfileData;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
}

export function ProfileView({ profile, isOwnProfile, isLoggedIn }: ProfileViewProps) {
  const [followerCount, setFollowerCount] = useState(profile.follower_count);

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

      <p className="text-sm text-muted-foreground text-center py-8">
        No content yet.
      </p>
    </div>
  );
}
