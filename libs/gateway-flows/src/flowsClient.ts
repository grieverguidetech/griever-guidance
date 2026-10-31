// Calls the data function for people (flows) as the signed-in caller. The router checks input
// first; this file only shapes the data function's args and turns a transport failure into null.
import { callData, type DataFunctionConfig } from '@griever/gateway-auth';
import type { DataResult, FlowRecord } from '@griever/shared';

type CallData = typeof callData;

export interface FlowsClientConfig {
  /** Read per request; null when the data function URL is unset. */
  getDataConfig: () => DataFunctionConfig | null;
  /** Overridable in tests. */
  callData?: CallData;
}

/** Each call resolves to the data function's answer, or null when it could not be reached. */
export interface FlowsClient {
  list(userToken: string): Promise<DataResult<FlowRecord[]> | null>;
  /** `fields` is the six facts plus any detail keys, already validated. */
  create(userToken: string, id: string, fields: Record<string, unknown>): Promise<DataResult<FlowRecord> | null>;
  /** `patch` is the changed facts and detail keys, already validated. */
  update(userToken: string, id: string, patch: Record<string, unknown>): Promise<DataResult<FlowRecord> | null>;
}

export function createFlowsClient(config: FlowsClientConfig): FlowsClient {
  const call = config.callData ?? callData;

  async function run<T>(
    userToken: string,
    action: 'listFlows' | 'createFlow' | 'updateFlow',
    args: Record<string, unknown>,
  ): Promise<DataResult<T> | null> {
    const data = config.getDataConfig();
    if (!data) {
      return null;
    }
    try {
      return await call<T>(data, userToken, action, args);
    } catch {
      return null;
    }
  }

  return {
    list: (userToken) => run<FlowRecord[]>(userToken, 'listFlows', {}),
    create: (userToken, id, fields) => run<FlowRecord>(userToken, 'createFlow', { id, facts: fields }),
    update: (userToken, id, patch) => run<FlowRecord>(userToken, 'updateFlow', { id, patch }),
  };
}
