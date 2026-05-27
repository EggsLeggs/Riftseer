"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { followAction, unfollowAction } from "@/features/profile/actions";

interface FollowButtonProps {
  handle: string;
  initialIsFollowing: boolean;
  isLoggedIn: boolean;
  onCountChange?: (delta: number) => void;
}

export function FollowButton({
  handle,
  initialIsFollowing,
  isLoggedIn,
  onCountChange,
}: FollowButtonProps) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!isLoggedIn) {
      const next = encodeURIComponent(`/u/${handle}`);
      router.push(`/auth/login?next=${next}`);
      return;
    }

    startTransition(async () => {
      if (isFollowing) {
        const result = await unfollowAction(handle);
        if (!result.error) {
          setIsFollowing(false);
          onCountChange?.(-1);
        }
      } else {
        const result = await followAction(handle);
        if (!result.error) {
          setIsFollowing(true);
          onCountChange?.(1);
        }
      }
    });
  }

  return (
    <Button
      variant={isFollowing ? "outline" : "default"}
      size="sm"
      onClick={toggle}
      disabled={pending}
    >
      {isFollowing ? "Unfollow" : "Follow"}
    </Button>
  );
}
