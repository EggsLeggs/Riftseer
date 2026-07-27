import { getSession } from "@/lib/session";
import { metafyApi } from "./api";

export interface MetafyBadges {
  isSupporter: boolean;
  isMember: boolean;
}

/** Resolves the supporter/member badge state for the signed-in user, if any. */
export async function getMetafyBadges(): Promise<MetafyBadges> {
  const session = await getSession();
  if (!session) return { isSupporter: false, isMember: false };

  const status = await metafyApi.getStatus(session.accessToken);
  return {
    isSupporter: status?.linked === true && status.is_supporter,
    isMember: status?.linked === true && status.is_member,
  };
}
