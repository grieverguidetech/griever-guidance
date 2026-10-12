import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgrestError } from '@griever/gateway-auth';
import { acceptInvite, createInvite, listMembers, removeMember, revokeInvite } from './membersClient.js';

const config = { url: 'https://proj.supabase.test', anonKey: 'anon' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stub(res: Response) {
  const f = vi.fn(async () => res);
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe('membersClient requests', () => {
  it.each([
    ['create_invite', () => createInvite(config, 'jwt', 'a@b.co', 'h'), { p_email: 'a@b.co', p_token_hash: 'h' }, 'id-1'],
    ['accept_invite', () => acceptInvite(config, 'jwt', 'h'), { p_token_hash: 'h' }, 'owner-1'],
    ['revoke_invite', () => revokeInvite(config, 'jwt', 'i1'), { p_invite_id: 'i1' }, null],
    ['remove_member', () => removeMember(config, 'jwt', 'm1'), { p_member_id: 'm1' }, null],
    ['list_members', () => listMembers(config, 'jwt'), {}, { role: 'owner', members: [], invites: [] }],
  ])('%s posts to its rpc path as the caller', async (name, run, args, answer) => {
    const f = stub(answer === null ? new Response(null, { status: 204 }) : json(answer));
    const result = await run();
    expect(result).toEqual({ ok: true, value: answer });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${config.url}/rest/v1/rpc/${name}`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt');
    expect(JSON.parse(init.body as string)).toEqual(args);
  });
});

describe('membersClient error mapping', () => {
  it.each([
    ['PT400', 400, 'invalid'],
    ['PT403', 403, 'forbidden'],
    ['PT404', 404, 'not_found'],
    ['PT409', 409, 'conflict'],
    ['PT429', 429, 'rate_limited'],
  ])('maps %s', async (code, status, reason) => {
    stub(json({ code, message: 'x' }, status));
    expect(await createInvite(config, 'jwt', 'a@b.co', 'h')).toEqual({ ok: false, reason });
  });

  it('throws on anything else', async () => {
    stub(json({ code: '42883', message: 'x' }, 404));
    await expect(listMembers(config, 'jwt')).rejects.toBeInstanceOf(PostgrestError);
    stub(new Response('oops', { status: 502 }));
    await expect(listMembers(config, 'jwt')).rejects.toBeInstanceOf(PostgrestError);
  });
});
