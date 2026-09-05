import { useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { useMockFlorists, composedFieldsWithFlorist } from '@griever/hooks';
import { composeMessage } from '@griever/shared';
import type { Contact } from '@griever/shared';
import { createSendEvent } from '@griever/api-client';
import { PencilSimple, CheckCircle, Circle } from '@phosphor-icons/react';
import { BackButton } from '../lib/ui';
import { LOCAL_USER_ID } from '../lib/format';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
  contacts: Contact[];
}

export function ConfirmScreen({ flow, contacts }: Props) {
  const florists = useMockFlorists(flow.place);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (!flow.selectedTemplate) return null;

  const isAnnouncement = flow.templateCategory === 'announcement';
  const isService = flow.templateCategory === 'service';
  const hasSendProgress = isAnnouncement || flow.templateCategory === 'obituary';
  const recipientCount = flow.selectedContactIds.length;

  const selectedFlorist = florists.find((f) => f.id === flow.floristId) ?? null;
  const floristName = selectedFlorist?.name ?? flow.customFlorist;

  const fields = composedFieldsWithFlorist(flow, floristName);
  const message = flow.messageOverride ?? composeMessage(flow.selectedTemplate, fields);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const phoneNumbers = contacts
        .filter((c) => flow.selectedContactIds.includes(c.id))
        .map((c) => c.phoneNumber);
      await createSendEvent({
        userId: LOCAL_USER_ID,
        templateId: flow.selectedTemplate!.id,
        contacts: phoneNumbers,
        fields,
      });
      if (hasSendProgress) {
        flow.startSendJob();
      } else {
        flow.nextStep();
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={flow.prevStep} />

      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">
          {isAnnouncement ? 'Read it once before it goes' : 'Review your message'}
        </h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          {isAnnouncement
            ? `This will go to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'} as a text message.`
            : `This will go to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}.`}
        </p>
      </div>

      <div className="gg-card">
        {isAnnouncement && <span className="gg-tag gg-tag-accent-2">Announcement</span>}
        {editing ? (
          <textarea
            className="gg-input"
            rows={6}
            autoFocus
            value={message}
            onChange={(e) => flow.setMessageOverride(e.target.value)}
          />
        ) : (
          <p
            className="gg-card-body m-0 whitespace-pre-wrap"
            style={{ opacity: 1, fontSize: 14, lineHeight: 1.7 }}
          >
            {message}
          </p>
        )}
      </div>

      {isService && (
        <FlowersSection flow={flow} florists={florists} />
      )}

      {isAnnouncement && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="gg-btn gg-btn-secondary flex-1"
          >
            <PencilSimple size={16} weight="regular" />
            {editing ? 'Done editing' : 'Edit wording'}
          </button>
          <button
            type="button"
            onClick={() => flow.setTone(flow.tone === 'softer' ? 'plain' : 'softer')}
            className="gg-btn gg-btn-ghost flex-1"
          >
            {flow.tone === 'softer' ? 'Plainer tone' : 'Softer tone'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-[13px] m-0" style={{ color: 'var(--color-accent-2-700)' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSend}
        disabled={sending || recipientCount === 0}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        {sending
          ? 'Sending…'
          : isAnnouncement
            ? `Send to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}`
            : 'Send messages'}
      </button>

      {isAnnouncement && (
        <p className="text-[12px] text-center m-0" style={{ color: 'var(--text-hint)' }}>
          You'll be able to see who received it.
        </p>
      )}
    </div>
  );
}

function FlowersSection({
  flow,
  florists,
}: {
  flow: Flow;
  florists: import('@griever/shared').Florist[];
}) {
  const venue = flow.place?.name ?? 'the venue';
  const selectedFlorist = florists.find((f) => f.id === flow.floristId) ?? null;
  const floristLabel =
    selectedFlorist?.name ?? (flow.customFlorist.trim() || 'the florist');
  const target = flow.flowerDeliveryTarget === 'home' ? "the family's home" : 'the service';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold">Include a way to send flowers</div>
          <p className="m-0 mt-[2px] text-[12px] leading-[1.5]" style={{ color: 'var(--text-hint)' }}>
            For people who can't be there in person.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={flow.includeFlowers}
          aria-label="Include a way to send flowers"
          onClick={() => flow.setIncludeFlowers(!flow.includeFlowers)}
          className={`gg-switch ${flow.includeFlowers ? 'gg-switch-on' : ''}`}
        >
          <span />
        </button>
      </div>

      {flow.includeFlowers && (
        <div className="flex flex-col gap-2">
          <p className="gg-eyebrow m-0">Florists near {venue}</p>
          {florists.map((florist) => {
            const selected = flow.floristId === florist.id;
            return (
              <button
                key={florist.id}
                type="button"
                onClick={() => flow.setFlorist(selected ? null : florist.id)}
                className={`gg-card gg-card-selectable flex-row items-center justify-between ${
                  selected ? 'gg-card-selected' : ''
                }`}
              >
                <span className="flex flex-col text-left">
                  <span className="gg-card-title text-[14px]">{florist.name}</span>
                  <span className="gg-card-meta">
                    {florist.distanceLabel} · {florist.deliveryHint}
                  </span>
                </span>
                {selected ? (
                  <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-accent)' }} />
                ) : (
                  <Circle size={20} weight="regular" style={{ color: 'var(--color-neutral-400)' }} />
                )}
              </button>
            );
          })}

          <div className="gg-field">
            <label htmlFor="custom-florist">
              Or a florist you'd prefer
              <span style={{ color: 'var(--text-eyebrow)' }}> (optional)</span>
            </label>
            <input
              id="custom-florist"
              className="gg-input"
              type="text"
              placeholder="Name, phone or website"
              value={flow.customFlorist}
              onChange={(e) => {
                flow.setCustomFlorist(e.target.value);
                if (e.target.value) flow.setFlorist(null);
              }}
            />
          </div>

          <div className="gg-field">
            <label>Deliver flowers to</label>
            <div className="gg-seg">
              <button
                type="button"
                onClick={() => flow.setFlowerDeliveryTarget('service')}
                className={`gg-seg-opt ${flow.flowerDeliveryTarget === 'service' ? 'gg-seg-opt-active' : ''}`}
              >
                The service
              </button>
              <button
                type="button"
                onClick={() => flow.setFlowerDeliveryTarget('home')}
                className={`gg-seg-opt ${flow.flowerDeliveryTarget === 'home' ? 'gg-seg-opt-active' : ''}`}
              >
                The family's home
              </button>
            </div>
          </div>

          <p className="gg-reassure m-0 text-[12px] leading-[1.5]">
            We'll add one line: “If you'd like to send flowers, {floristLabel} can deliver to {target}.”
          </p>
        </div>
      )}
    </div>
  );
}
