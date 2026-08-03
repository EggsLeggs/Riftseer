import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { profileApi } from "@/features/profile/api";
import { getSession } from "@/lib/session";
import { ProfileView } from "@/views/profile/profile-view";
import { ProfileUnavailable } from "@/views/profile/profile-unavailable";

interface Props {
  params: Promise<{ handle: string }>;
}

// generateMetadata and the page run in the same request, so a cached lookup with
// identical arguments costs one API call instead of two.
const loadProfile = cache((handle: string, accessToken?: string) =>
  profileApi.getProfile(handle, accessToken),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const session = await getSession();
  const result = await loadProfile(handle, session?.accessToken);

  if (result.status !== "ok") {
    return { title: result.status === "not-found" ? "User not found — Riftseer" : "Profile — Riftseer" };
  }
  return {
    title: `${result.profile.username} (@${result.profile.handle}) — Riftseer`,
    description: `${result.profile.username}'s profile on Riftseer.`,
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { handle } = await params;
  const session = await getSession();

  const result = await loadProfile(handle, session?.accessToken);
  if (result.status === "not-found") notFound();
  if (result.status === "unavailable") return <ProfileUnavailable handle={handle} />;

  const profile = result.profile;
  const isOwnProfile = session?.user.id === profile.id;

  // The view reads `?tab` to keep its deck tab deep-linkable, which needs a
  // boundary around `useSearchParams`.
  return (
    <Suspense>
      <ProfileView
        profile={profile}
        isOwnProfile={isOwnProfile}
        isLoggedIn={session !== null}
      />
    </Suspense>
  );
}
