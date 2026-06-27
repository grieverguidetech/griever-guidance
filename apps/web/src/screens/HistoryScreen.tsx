import { useEffect, useState } from 'react';
import { getSendHistory } from '@griever/api-client';
import type { SendEvent } from '@griever/shared';

const TEMP_USER_ID = 'test-user';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  onBack: () => void;
}

export function HistoryScreen({ onBack }: Props) {
  const [events, setEvents] = useState<SendEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSendHistory(TEMP_USER_ID)
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-gray-400 mb-6 hover:text-gray-600"
      >
        ← Back
      </button>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Sent messages</h1>
      <p className="text-sm text-gray-400 mb-6">
        A record of notifications sent from this device.
      </p>

      {loading && (
        <p className="text-sm text-gray-400">Loading...</p>
      )}

      {!loading && events.length === 0 && (
        <p className="text-sm text-gray-400">No messages sent yet.</p>
      )}

      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <div
            key={event.id}
            className="border border-gray-200 rounded-lg px-5 py-4"
          >
            <div className="font-medium text-gray-900 text-sm">
              {event.deceasedName || 'Unnamed'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {event.recipientCount}{' '}
              {event.recipientCount === 1 ? 'person' : 'people'} notified
              · {formatDate(event.createdAt)}
            </div>
            <div className="text-xs text-gray-400 mt-1">{event.templateId}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
