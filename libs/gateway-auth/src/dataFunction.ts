import { AwsClient } from 'aws4fetch';
import { DATA_USER_TOKEN_HEADER, isDataErrorCode } from '@griever/shared';
import type { DataAction, DataResult } from '@griever/shared';

export interface DataFunctionConfig {
  /** Base URL of the data function (Lambda function URL), without `/v1`. */
  url: string;
  region: string;
  /** The gateway's key pair. Optional only for a loopback `url`. */
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Anything other than a domain answer: the AWS layer said no, the function
 * crashed, the network failed, or the body was not JSON. The message never
 * carries the user token or the response body.
 */
export class DataFunctionError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'DataFunctionError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Calls one data action as the user. The user's token travels only in
 * `x-gg-user-token`; the SigV4 signature proves the call came from the gateway.
 * Loopback URLs (local runs) are called unsigned.
 */
export async function callData<T = unknown>(
  config: DataFunctionConfig,
  userToken: string,
  action: DataAction,
  args: Record<string, unknown> = {},
): Promise<DataResult<T>> {
  let base: URL;
  try {
    base = new URL(config.url);
  } catch {
    throw new DataFunctionError(null, 'data function url is invalid');
  }
  const loopback = isLoopback(base);
  if (!loopback && (!config.accessKeyId || !config.secretAccessKey)) {
    throw new DataFunctionError(null, 'data function needs an AWS key pair for a non-loopback url');
  }

  const url = `${config.url.replace(/\/+$/, '')}/v1`;
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', [DATA_USER_TOKEN_HEADER]: userToken },
    body: JSON.stringify({ action, args }),
  };

  let res: Response;
  try {
    if (loopback) {
      res = await fetch(url, init);
    } else {
      const aws = new AwsClient({
        accessKeyId: config.accessKeyId as string,
        secretAccessKey: config.secretAccessKey as string,
        service: 'lambda',
        region: config.region,
      });
      res = await fetch(await aws.sign(url, init));
    }
  } catch {
    throw new DataFunctionError(null, 'data function request failed');
  }

  if (res.status === 401) {
    return { ok: false, code: 'unauthorized' };
  }
  if (res.status !== 200) {
    throw new DataFunctionError(res.status, `data function answered ${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new DataFunctionError(res.status, 'data function returned a non-JSON body');
  }
  return parseResult<T>(body, res.status);
}

function parseResult<T>(body: unknown, status: number): DataResult<T> {
  const value = body as { ok?: unknown; data?: unknown; code?: unknown; message?: unknown } | null;
  if (value && value.ok === true) {
    return { ok: true, data: value.data as T };
  }
  if (value && value.ok === false && isDataErrorCode(value.code)) {
    return typeof value.message === 'string'
      ? { ok: false, code: value.code, message: value.message }
      : { ok: false, code: value.code };
  }
  throw new DataFunctionError(status, 'data function returned an unexpected body');
}
