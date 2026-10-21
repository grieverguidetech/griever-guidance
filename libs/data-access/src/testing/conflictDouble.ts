import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import type { TransactClient } from '../transact.js';

/**
 * DynamoDB Local never reports TransactionConflict, so this wrapper throws it for the first `times`
 * sends and then passes calls to the real client. `attempts` counts every send.
 */
export function conflictDouble(real: TransactClient, times: number): TransactClient & { attempts: number } {
  const double = {
    attempts: 0,
    async send(command: Parameters<TransactClient['send']>[0]): Promise<unknown> {
      double.attempts += 1;
      if (double.attempts <= times) {
        throw new TransactionCanceledException({
          message: 'Transaction cancelled, please refer cancellation reasons for specific reasons [TransactionConflict]',
          $metadata: {},
          CancellationReasons: [{ Code: 'TransactionConflict' }],
        });
      }
      return real.send(command);
    },
  };
  return double;
}
