export interface SessionUser {
  id: string;
  email?: string;
  created_at: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SessionUser;
}
