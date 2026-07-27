export interface LinkedMetafyAccount {
  provider: string;
  provider_username: string | null;
  is_supporter: boolean;
  is_member: boolean;
  linked_at: string;
  status_checked_at: string | null;
}

export type MetafyStatusResult =
  | { linked: false }
  | ({ linked: true } & LinkedMetafyAccount);
