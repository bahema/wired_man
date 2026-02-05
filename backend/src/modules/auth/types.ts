export type SessionInfo = {
  ok: true;
  adminEmail: string | null;
};

export type SessionRow = {
  email?: string | null;
  expiresAt?: string | null;
};
