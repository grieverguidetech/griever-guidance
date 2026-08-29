import { useEffect, useState } from 'react';
import { getSendHistory } from '@griever/api-client';
import { templates, historyTagLabel } from '@griever/shared';
import type { SendEvent, TemplateCategory } from '@griever/shared';
import { BackButton } from '../lib/ui';
import { LOCAL_USER_ID } from '../lib/format';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function categoryFor(templateId: string): TemplateCategory {
  return templates.find((t) => t.id === templateId)?.category ?? 'service';
}

interface Props {
  onBack: () => void;
}

export function HistoryScreen({ onBack }: Props) {
  const [events, setEvents] = useState<SendEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSendHistory(LOCAL_USER_ID)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Sent messages</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          A record of notifications sent from this device.
        </p>
      </div>

      {loading && (
        <p className="text-[13px] m-0" style={{ color: 'var(--text-hint)' }}>
          Loading…
        </p>
      )}

      {!loading && events.length === 0 && (
        <p className="text-[13px] m-0" style={{ color: 'var(--text-hint)' }}>
          No messages sent yet.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {events.map((event) => {
          const category = categoryFor(event.templateId);
          const isAnnouncement = category === 'announcement';
          return (
            <div key={event.id} className="gg-card">
              <span
                className={`gg-tag ${isAnnouncement ? 'gg-tag-accent-2' : 'gg-tag-accent'}`}
              >
                {historyTagLabel(category)}
              </span>
              <span className="gg-card-title text-[15px]">
                {event.deceasedName || 'Unnamed'}
              </span>
              <span className="gg-card-meta">
                {event.recipientCount}{' '}
                {event.recipientCount === 1 ? 'person' : 'people'} notified ·{' '}
                {formatDate(event.createdAt)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
