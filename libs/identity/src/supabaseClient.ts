import type { Profile } from '@griever/shared';
import type { SupabaseConfig } from './supabaseJwt.js';

export interface ProfileFields {
  senderName?: string | null;
  contactSource?: 'import' | 'manual' | null;
}

export interface ProfilesClient {
  get(userId: string): Promise<Profile | null>;
  upsert(userId: string, fields: ProfileFields): Promise<Profile>;
}

interface ProfileRow {
  id: string;
  sender_name: string | null;
  contact_source: 'import' | 'manual' | null;
  created_at: string;
  updated_at: string;
}

function toDto(row: ProfileRow): Profile {
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

  function firstRow(rows: ProfileRow[]): Profile {
    if (!rows[0]) throw new Error('profiles write returned no row');
    return toDto(rows[0]);
  }

  /** Updates the caller's row; null when there is no row yet. */
  async function patch(userId: string, columns: Record<string, unknown>): Promise<Profile | null> {
    const res = await send(`${endpoint}?id=eq.${encodeURIComponent(userId)}`, 'PATCH', columns);
    const rows = await readRows(res);
    return rows[0] ? toDto(rows[0]) : null;
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

      // Insert, and if another first save won the race (409), read back with `again`.
      async function insertOrAgain(again: () => Promise<Profile | null>): Promise<Profile> {
        const res = await send(endpoint, 'POST', { id: userId, ...columns });
        if (res.status === 409) {
          const row = await again();
          if (row) return row;
          throw new Error('profiles row missing after conflict');
        }
        return firstRow(await readRows(res));
      }

      // Nothing to change: return the current row, or create an empty one.
      if (Object.keys(columns).length === 0) {
        const existing = await this.get(userId);
        return existing ?? insertOrAgain(() => this.get(userId));
      }

      const updated = await patch(userId, columns);
      return updated ?? insertOrAgain(() => patch(userId, columns));
    },
  };
}
