import { nextStep, startWorkflow } from '@griever/agent-workflow';
import { screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES, DISPOSITIONS } from '@griever/shared';
import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/server';
import worker from './worker.js';

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  'MCP-Protocol-Version': '2025-06-18',
};

interface ListedTool {
  name: string;
  title: string;
  description: string;
}

let nextId = 1;
const rpc = (method: string, params: unknown = {}) =>
  worker.fetch(
    new Request('https://agent.test/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    }),
    {},
  );

/** The legacy stateless path answers as one server-sent event; read its data line as JSON. */
const readRpc = async (res: Response): Promise<any> => {
  const text = await res.text();
  const data = text.split('\n').find((line) => line.startsWith('data:'));
  return JSON.parse(data ? data.slice(5) : text);
};

const callTool = async (name: string, args: unknown) => {
  const res = await rpc('tools/call', { name, arguments: args });
  const body = await readRpc(res);
  return { res, body };
};

const situation = { disposition: 'undecided' };
const allIds = CHECKLIST_PHASES.flatMap((p) => [...p.itemIds]);
const copy = screenCopy('agentWorkflow');

describe('agent MCP tools', () => {
  it('answers initialize without a session id', async () => {
    const res = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBeNull();
    const body = await readRpc(res);
    expect(body.result.serverInfo.name).toBe('griever-guidance-agent');
  });

  it('lists exactly the two tools, with copy titles, strict inputs and annotations', async () => {
    const res = await rpc('tools/list');
    const { result } = await readRpc(res);
    expect(result.tools.map((t: ListedTool) => t.name)).toEqual([
      'start_workflow',
      'next_step',
    ]);
    expect(result.tools.map((t: ListedTool) => t.title)).toEqual([
      copy.startWorkflowTitle,
      copy.nextStepTitle,
    ]);
    expect(result.tools.map((t: ListedTool) => t.description)).toEqual([
      copy.startWorkflowDescription,
      copy.nextStepDescription,
    ]);
    for (const tool of result.tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.inputSchema.properties.situation.additionalProperties).toBe(
        false,
      );
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.outputSchema).toBeDefined();
    }
    expect(result.tools[0].inputSchema.properties.done).toBeUndefined();
    expect(result.tools[1].inputSchema.properties.done.maxItems).toBe(
      allIds.length,
    );
  });

  it('start_workflow returns what the lib returns, as structured and text content', async () => {
    const { res, body } = await callTool('start_workflow', { situation });
    expect(res.headers.get('mcp-session-id')).toBeNull();
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent).toEqual(
      startWorkflow(situation as never),
    );
    expect(JSON.parse(body.result.content[0].text)).toEqual(
      body.result.structuredContent,
    );
  });

  it('a full walk through next_step matches the lib, step by step', async () => {
    const done: string[] = [];
    const seen: string[] = [];
    for (let guard = 0; guard < allIds.length + 1; guard += 1) {
      const { body } = await callTool('next_step', { situation, done });
      expect(body.result.structuredContent).toEqual(
        nextStep(situation as never, done),
      );
      const next = body.result.structuredContent.next;
      if (!next) {
        expect(body.result.structuredContent.message).toBe(copy.allDone);
        break;
      }
      seen.push(next.id);
      done.push(next.id);
    }
    expect(seen.length).toBeGreaterThan(5);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('refuses bad input with an error that does not repeat the bad value', async () => {
    const canary = 'CANARY-Mary-Smith-555-0100';
    const bad: Array<[string, unknown]> = [
      ['next_step', { situation, done: [], name: canary }],
      [
        'next_step',
        { situation: { disposition: 'undecided', name: canary }, done: [] },
      ],
      ['next_step', { situation, done: [canary] }],
      ['next_step', { situation: { disposition: canary }, done: [] }],
      ['next_step', { situation, done: canary }],
      [
        'next_step',
        {
          situation,
          done: Array.from({ length: allIds.length + 1 }, () => allIds[0]),
        },
      ],
      ['next_step', { situation, done: [], [canary]: 1 }],
      [
        'next_step',
        { situation: { disposition: 'undecided', [canary]: 1 }, done: [] },
      ],
      ['start_workflow', { situation, [canary]: 1 }],
      [
        'start_workflow',
        { situation: { disposition: 'undecided', [canary]: 1 } },
      ],
      ['start_workflow', { situation, name: canary }],
      ['start_workflow', { situation: { disposition: 42, note: canary } }],
    ];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    for (const [tool, args] of bad) {
      const { res, body } = await callTool(tool, args);
      const text = JSON.stringify(body);
      expect(body.result?.isError === true || body.error !== undefined).toBe(
        true,
      );
      expect(text).not.toContain(canary);
      expect(res.status).toBeLessThan(500);
    }
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('refuses an unknown tool name', async () => {
    const { body } = await callTool('send_message', { to: 'x' });
    expect(body.result?.isError === true || body.error !== undefined).toBe(
      true,
    );
  });

  it('puts no link or message scheme and no exclamation mark in any output (C1, C7)', async () => {
    // The JSON Schema dialect id in tools/list is protocol metadata, not text shown to the person.
    const listed = JSON.stringify(
      await readRpc(await rpc('tools/list')),
    ).replaceAll(
      '"$schema":"https://json-schema.org/draft/2020-12/schema"',
      '',
    );
    const outputs: string[] = [listed];
    for (const disposition of DISPOSITIONS) {
      const sit = { disposition };
      const start = await callTool('start_workflow', { situation: sit });
      outputs.push(JSON.stringify(start.body));
      for (const id of allIds) {
        const { body } = await callTool('next_step', {
          situation: sit,
          done: allIds.slice(0, allIds.indexOf(id)),
        });
        outputs.push(JSON.stringify(body));
      }
    }
    for (const text of outputs) {
      expect(text).not.toMatch(/https?:|sms:|mailto:|tel:|!/i);
    }
  });

  it('refuses subscriptions/listen', async () => {
    const res = await rpc('subscriptions/listen', { filter: {} });
    const text = await res.text();
    expect(text).not.toContain('"tools"');
    expect(res.status === 200 ? text : 'refused').toMatch(
      /error|refused|limit/i,
    );
  });

  it('serves a modern-envelope tools/call as JSON with no session id', async () => {
    const res = await worker.fetch(
      new Request('https://agent.test/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
          'Mcp-Method': 'tools/call',
          'Mcp-Name': 'next_step',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'next_step',
            arguments: { situation, done: [] },
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        }),
      }),
      {},
    );
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('mcp-session-id')).toBeNull();
    const body = (await res.json()) as {
      result: { structuredContent: unknown };
    };
    expect(body.result.structuredContent).toEqual(
      nextStep(situation as never, []),
    );
  });
});
