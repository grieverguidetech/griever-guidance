import { useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { composedFieldsWithFlorist } from '@griever/hooks';
import { fill, recipientsPhrase, screenCopy, sendLabel } from '@griever/copy';
import { composeMessage, SHARE_SERVICE_SAMPLE } from '@griever/shared';
import { Review } from '@griever/ui';

type Flow = ReturnType<typeof useSendFlow>;

const copy = screenCopy('review');

interface Props {
  flow: Flow;
}

/** The screen is the shared Review in libs/ui; this holds what is web only: the sample and the flowers choice. */
export function ConfirmScreen({ flow }: Props) {
  const [sampleOpen, setSampleOpen] = useState(false);

  if (!flow.selectedTemplate) return null;

  const isAnnouncement = flow.templateCategory === 'announcement';
  const isService = flow.templateCategory === 'service';
  const recipientCount = flow.selectedContactIds.length;
  const recipients = recipientsPhrase(recipientCount, copy);

  const fields = composedFieldsWithFlorist(flow, flow.customFlorist);
  const message = flow.messageOverride ?? composeMessage(flow.selectedTemplate, fields);

  function handleSend() {
    // Pin the exact text reviewed here, so SendingScreen's sms: links carry precisely what the
    // griever just read and not a recomputation that could drift.
    if (flow.messageOverride === null) {
      flow.setMessageOverride(message);
    }
    // Texting each person from their own number happens one at a time on the
    // next screen — nothing to send from here (no backend call at all).
    flow.startSendJob();
  }

  return (
    <Review
      copy={copy}
      kind={isAnnouncement ? 'announcement' : isService ? 'service' : 'other'}
      intro={fill(isAnnouncement ? copy.introAnnouncement : copy.intro, { recipients })}
      message={message}
      onMessageChange={flow.setMessageOverride}
      tone={flow.tone}
      onToneChange={flow.setTone}
      sendLabel={sendLabel(isAnnouncement ? recipientCount : undefined, copy)}
      hasRecipients={recipientCount > 0}
      onBack={flow.prevStep}
      onSend={handleSend}
    >
      {isService && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={sampleOpen}
            aria-controls="message-sample"
            onClick={() => setSampleOpen((v) => !v)}
            className="gg-btn gg-btn-ghost"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            {copy.sample}
          </button>
          <p
            id="message-sample"
            hidden={!sampleOpen}
            className="m-0 whitespace-pre-wrap"
            style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}
          >
            {SHARE_SERVICE_SAMPLE}
          </p>
        </div>
      )}
      {isService && <FlowersSection flow={flow} />}
    </Review>
  );
}

function FlowersSection({ flow }: { flow: Flow }) {
  const f = copy.flowers;
  const floristLabel = flow.customFlorist.trim() || f.floristFallback;
  const target = flow.flowerDeliveryTarget === 'home' ? f.targetHome : f.targetService;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold">{f.heading}</div>
          <p className="m-0 mt-[2px] text-[12px] leading-[1.5]" style={{ color: 'var(--text-hint)' }}>
            {f.note}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={flow.includeFlowers}
          aria-label={f.heading}
          onClick={() => flow.setIncludeFlowers(!flow.includeFlowers)}
          className={`gg-switch ${flow.includeFlowers ? 'gg-switch-on' : ''}`}
        >
          <span />
        </button>
      </div>

      {flow.includeFlowers && (
        <div className="flex flex-col gap-2">
          <div className="gg-field">
            <label htmlFor="custom-florist">
              {f.floristLabel}
              <span style={{ color: 'var(--text-eyebrow)' }}> {f.optional}</span>
            </label>
            <input
              id="custom-florist"
              className="gg-input"
              type="text"
              placeholder={f.floristPlaceholder}
              value={flow.customFlorist}
              onChange={(e) => flow.setCustomFlorist(e.target.value)}
            />
          </div>

          <div className="gg-field">
            <label>{f.deliverTo}</label>
            <div className="gg-seg">
              <button
                type="button"
                onClick={() => flow.setFlowerDeliveryTarget('service')}
                className={`gg-seg-opt ${flow.flowerDeliveryTarget === 'service' ? 'gg-seg-opt-active' : ''}`}
              >
                {f.toService}
              </button>
              <button
                type="button"
                onClick={() => flow.setFlowerDeliveryTarget('home')}
                className={`gg-seg-opt ${flow.flowerDeliveryTarget === 'home' ? 'gg-seg-opt-active' : ''}`}
              >
                {f.toHome}
              </button>
            </div>
          </div>

          {flow.messageOverride !== null ? (
            <p className="gg-reassure m-0 text-[12px] leading-[1.5]">
              {f.editedNote}
            </p>
          ) : (
          <p className="gg-reassure m-0 text-[12px] leading-[1.5]">
            {fill(f.addedLine, { florist: floristLabel, target })}
          </p>
          )}
        </div>
      )}
    </div>
  );
}
