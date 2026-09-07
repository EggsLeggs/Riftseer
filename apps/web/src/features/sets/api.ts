import { createApiClient } from "@/lib/api/client";

export interface SetInfo {
  setCode: string;
  setName: string;
  cardCount: number;
  isPromo: boolean;
  publishedOn: string | null;
}

const setsClient = createApiClient();

export const setsApi = {
  async getSets(): Promise<{ count: number; sets: SetInfo[] }> {
    const { data, error, status } = await setsClient.api.v1.sets.get();
    if (error != null) {
      throw new Error(`Riftseer API ${status}`);
    }
    return data as { count: number; sets: SetInfo[] };
  },
};

export const setsQueryKeys = {
  all: ["sets"] as const,
  list: () => ["sets", "list"] as const,
  setCards: (code: string) => ["sets", code, "cards"] as const,
};
