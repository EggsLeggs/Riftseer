"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { followAction, unfollowAction } from "@/features/profile/actions";

interface FollowButtonProps {
  handle: string;
  initialIsFollowing: boolean;
  onCountChange?: (delta: number) => void;
}

export function FollowButton({ handle, initialIsFollowing, onCountChange }: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [pending, startTransition] = useTransition();

  function toggle() {
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
