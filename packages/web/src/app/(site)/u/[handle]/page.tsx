import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProfile } from "@/features/profile/api";
import { getSession } from "@/lib/session";
import { ProfileView } from "@/views/profile/profile-view";

interface Props {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfile(handle);
  if (!profile) return { title: "User not found — Riftseer" };
  return {
    title: `${profile.username} (@${profile.handle}) — Riftseer`,
    description: `${profile.username}'s profile on Riftseer.`,
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { handle } = await params;
  const session = await getSession();

  const profile = await getProfile(handle, session?.accessToken);
  if (!profile) notFound();

  const isOwnProfile = session?.user.id === profile.id;

  return (
    <ProfileView
      profile={profile}
      isOwnProfile={isOwnProfile}
      isLoggedIn={session !== null}
    />
  );
}
