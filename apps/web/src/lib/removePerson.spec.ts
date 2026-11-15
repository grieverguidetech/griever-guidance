import { hasHiddenAccountPeople, removablePeople, removePerson } from './removePerson';

const owner = { id: 'a', personName: 'Anna', ownerId: null, role: 'owner' as const };
const synced = { id: 'b', personName: 'Ben', ownerId: 'user_1', role: 'owner' as const };
const held = { id: 'c', personName: 'Cy', ownerId: null, heldFor: 'user_1', role: 'owner' as const };
const member = { id: 'd', personName: 'Dee', ownerId: 'user_2', role: 'member' as const };

describe('removablePeople', () => {
  it('never lists a member session', () => {
    expect(removablePeople([owner, member], true).map((p) => p.id)).toEqual(['a']);
    expect(removablePeople([owner, member], false).map((p) => p.id)).toEqual(['a']);
  });

  it('lists account-tied people only when the server can be reached', () => {
    expect(removablePeople([owner, synced, held], true).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(removablePeople([owner, synced, held], false).map((p) => p.id)).toEqual(['a']);
  });

  it('reports hidden account-tied people', () => {
    expect(hasHiddenAccountPeople([owner, synced], false)).toBe(true);
    expect(hasHiddenAccountPeople([owner, synced], true)).toBe(false);
    expect(hasHiddenAccountPeople([owner, member], false)).toBe(false);
  });
});

function deps(over: Partial<Parameters<typeof removePerson>[0]> = {}) {
  const removeLocal = vi.fn().mockReturnValue(true);
  const deleteFlow = vi.fn().mockResolvedValue({ ok: true });
  const getToken = vi.fn().mockResolvedValue('tok');
  return { removeLocal, deleteFlow, getToken, run: () => removePerson({ syncOn: true, flowId: 'f1', getToken, deleteFlow, removeLocal, ...over }) };
}

describe('removePerson', () => {
  it('sync on: deletes on the server, then removes locally', async () => {
    const d = deps();
    expect(await d.run()).toBe('removed');
    expect(d.deleteFlow).toHaveBeenCalledWith('tok', 'f1', expect.any(AbortSignal));
    expect(d.removeLocal).toHaveBeenCalledOnce();
  });

  it('does not remove locally before the server has answered', async () => {
    let answer!: (v: { ok: true }) => void;
    const d = deps({ deleteFlow: vi.fn(() => new Promise<{ ok: true }>((r) => (answer = r))) });
    const pending = d.run();
    await Promise.resolve();
    await Promise.resolve();
    expect(d.removeLocal).not.toHaveBeenCalled();
    answer({ ok: true });
    await pending;
    expect(d.removeLocal).toHaveBeenCalledOnce();
  });

  it('not_found counts as removed', async () => {
    const d = deps({ deleteFlow: vi.fn().mockResolvedValue({ ok: false, reason: 'not_found' }) });
    expect(await d.run()).toBe('removed');
    expect(d.removeLocal).toHaveBeenCalledOnce();
  });

  it('offline leaves the person and says offline', async () => {
    const d = deps({ deleteFlow: vi.fn().mockResolvedValue({ ok: false, reason: 'offline' }) });
    expect(await d.run()).toBe('offline');
    expect(d.removeLocal).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'signed_out', 'rate_limited', 'forbidden', 'failed', 'invalid', 'conflict'] as const)(
    '%s leaves the person and says failed',
    async (reason) => {
      const d = deps({ deleteFlow: vi.fn().mockResolvedValue({ ok: false, reason }) });
      expect(await d.run()).toBe('failed');
      expect(d.removeLocal).not.toHaveBeenCalled();
    },
  );

  it('no token or a failing token read leaves the person with no request', async () => {
    const none = deps({ getToken: vi.fn().mockResolvedValue(null) });
    expect(await none.run()).toBe('failed');
    const boom = deps({ getToken: vi.fn().mockRejectedValue(new Error('x')) });
    expect(await boom.run()).toBe('failed');
    expect(none.deleteFlow).not.toHaveBeenCalled();
    expect(boom.deleteFlow).not.toHaveBeenCalled();
    expect(none.removeLocal).not.toHaveBeenCalled();
    expect(boom.removeLocal).not.toHaveBeenCalled();
  });

  it('passes a signal, and a timeout abort keeps the person and says offline', async () => {
    const controller = new AbortController();
    const slow = vi.fn(async () => {
      controller.abort();
      return { ok: false as const, reason: 'failed' as const };
    });
    const d = deps({ deleteFlow: slow, signal: controller.signal });
    expect(await d.run()).toBe('offline');
    expect(slow).toHaveBeenCalledWith('tok', 'f1', controller.signal);
    expect(d.removeLocal).not.toHaveBeenCalled();
  });

  it('uses a 15 second timeout signal by default', async () => {
    const d = deps();
    await d.run();
    const signal = d.deleteFlow.mock.calls[0][2] as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('sync off: removes locally with no request', async () => {
    const d = deps({ syncOn: false });
    expect(await d.run()).toBe('removed');
    expect(d.deleteFlow).not.toHaveBeenCalled();
    expect(d.getToken).not.toHaveBeenCalled();
    expect(d.removeLocal).toHaveBeenCalledOnce();
  });
});
