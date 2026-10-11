import type { SupabaseConfig } from './supabaseJwt.js';

/**
 * Local mirror of `Profile` in libs/shared/src/types.ts, the contract the web
 * and mobile clients consume. It is duplicated because @griever/shared is not
 * a dependency of this lib (package.json was off limits in #29).
 * Follow-up: add the dependency and import `Profile` instead.
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

  function send(url: string, method: 'PATCH' | 'POST', body: Record<string, unknown>) {
    return fetch(url, {
      method,
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
  }

  function firstRow(rows: ProfileRow[]): ProfileDto {
    if (!rows[0]) throw new Error('profiles write returned no row');
    return toDto(rows[0]);
  }

  /** Updates the caller's row; null when there is no row yet. */
  async function patch(userId: string, columns: Record<string, unknown>): Promise<ProfileDto | null> {
    const res = await send(`${endpoint}?id=eq.${encodeURIComponent(userId)}`, 'PATCH', columns);
    const rows = await readRows(res);
    return rows[0] ? toDto(rows[0]) : null;
  }

  async function insert(userId: string, columns: Record<string, unknown>): Promise<ProfileDto> {
    return firstRow(await readRows(await send(endpoint, 'POST', { id: userId, ...columns })));
  }

  return {
    async get(userId) {
      const res = await fetch(`${endpoint}?id=eq.${encodeURIComponent(userId)}&select=*`, { headers });
      const rows = await readRows(res);
      return rows[0] ? toDto(rows[0]) : null;
    },

    async upsert(userId, fields) {
      // Not a single ON CONFLICT upsert: that would SET id too, and the table
      // grants UPDATE only on (sender_name, contact_source). So: update the
      // caller's row, and insert it only if there was none (RLS pins both to
      // the caller's own id).
      const columns: Record<string, unknown> = {};
      if (fields.senderName !== undefined) columns['sender_name'] = fields.senderName;
      if (fields.contactSource !== undefined) columns['contact_source'] = fields.contactSource;

      // Nothing to change: return the current row, or create an empty one.
      if (Object.keys(columns).length === 0) {
        const existing = await this.get(userId);
        if (existing) return existing;
        return insert(userId, columns);
      }

      const updated = await patch(userId, columns);
      if (updated) return updated;

      const insertRes = await send(endpoint, 'POST', { id: userId, ...columns });
      if (insertRes.status === 409) {
        // Another first save won the race; the row exists now.
        const retried = await patch(userId, columns);
        if (retried) return retried;
        throw new Error('profiles row missing after conflict');
      }
      return firstRow(await readRows(insertRes));
    },
  };
}
