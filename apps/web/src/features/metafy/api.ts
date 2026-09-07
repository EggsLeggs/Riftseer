import { env } from "@/lib/env";
import type { MetafyStatusResult } from "./types";

export const metafyApi = {
  async getStatus(accessToken: string): Promise<MetafyStatusResult | null> {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/metafy/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        next: { revalidate: 300 },
      });
      if (!res.ok) return null;
      return res.json() as Promise<MetafyStatusResult>;
    } catch {
      return null;
    }
  },
};
