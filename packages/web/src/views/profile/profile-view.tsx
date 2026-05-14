"use client";

import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { FollowButton } from "@/components/profile/follow-button";
import type { ProfileData } from "@/features/profile/api";

interface ProfileViewProps {
  profile: ProfileData;
  isOwnProfile: boolean;
}

export function ProfileView({ profile, isOwnProfile }: ProfileViewProps) {
  const [followerCount, setFollowerCount] = useState(profile.follower_count);

  const initials = profile.username.slice(0, 2).toUpperCase();

  return (
    <div className="container py-8">
      <div className="flex items-start gap-6">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold select-none">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold leading-tight">{profile.username}</h1>
              <p className="text-sm text-muted-foreground">@{profile.handle}</p>
            </div>
            {!isOwnProfile && (
              <div className="ml-auto shrink-0">
                <FollowButton
                  handle={profile.handle}
                  initialIsFollowing={profile.is_following ?? false}
                  onCountChange={(delta) => setFollowerCount((c) => c + delta)}
                />
              </div>
            )}
          </div>

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
        </div>
      </div>

      <Separator className="my-8" />

      <p className="text-sm text-muted-foreground text-center py-8">
        No content yet.
      </p>
    </div>
  );
}
