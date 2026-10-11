import type { SupabaseConfig } from './supabaseJwt.js';

/**
 * Same shape as `Profile` in @griever/shared (that lib is not a dependency of
 * this one). This is the contract the web and mobile clients consume.
 */
export interface ProfileDto {
  id: string;
  senderName: string | null;
  contactSource: 'import' | 'manual' | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileFields {
  senderName?: string | null;
  contactSource?: 'import' | 'manual' | null;
}

export interface ProfilesClient {
  get(userId: string): Promise<ProfileDto | null>;
  upsert(userId: string, fields: ProfileFields): Promise<ProfileDto>;
}

interface ProfileRow {
  id: string;
  sender_name: string | null;
  contact_source: 'import' | 'manual' | null;
  created_at: string;
  updated_at: string;
}

function toDto(row: ProfileRow): ProfileDto {
  return {
    id: row.id,
    senderName: row.sender_name,
    contactSource: row.contact_source,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Talks to Supabase PostgREST as the caller: the anon key identifies the
 * project and the caller's own JWT decides what row-level security lets
 * through. There is deliberately no service-role key anywhere in the gateway.
 */
export function createProfilesClient(config: SupabaseConfig, accessToken: string): ProfilesClient {
  const endpoint = `${config.url}/rest/v1/profiles`;
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  async function readRows(res: Response): Promise<ProfileRow[]> {
    if (!res.ok) throw new Error(`profiles request failed (${res.status})`);
    return (await res.json()) as ProfileRow[];
  }

  return {
    async get(userId) {
      const res = await fetch(`${endpoint}?id=eq.${encodeURIComponent(userId)}&select=*`, { headers });
      const rows = await readRows(res);
      return rows[0] ? toDto(rows[0]) : null;
    },

    async upsert(userId, fields) {
      // Only the columns the caller sent are written, so a PUT with just
      // senderName leaves contact_source alone on an existing row.
      const body: Record<string, unknown> = { id: userId };
      if (fields.senderName !== undefined) body['sender_name'] = fields.senderName;
      if (fields.contactSource !== undefined) body['contact_source'] = fields.contactSource;

      const res = await fetch(`${endpoint}?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(body),
      });
      const rows = await readRows(res);
      if (!rows[0]) throw new Error('profiles upsert returned no row');
      return toDto(rows[0]);
    },
  };
}
