import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { AnnouncementSection, type AnnouncementPatch } from './AnnouncementSection';

type Values = Parameters<typeof AnnouncementSection>[0]['values'];

function setup(initial: Values = {}) {
  const patches: AnnouncementPatch[] = [];
  const onReadyChange = vi.fn();
  function Harness() {
    const [values, setValues] = useState<Values>(initial);
    return (
      <AnnouncementSection
        values={values}
        onChange={(patch) => {
          patches.push(patch);
          setValues((v) => ({ ...v, ...patch }));
        }}
        onReadyChange={onReadyChange}
      />
    );
  }
  render(<Harness />);
  return { patches, onReadyChange };
}

const message = () => screen.getByLabelText('Message') as HTMLTextAreaElement;

describe('AnnouncementSection', () => {
  it('prefills the message from the name and date of passing', () => {
    setup({ personName: 'Margaret Hayes', dateOfPassing: 'May 29, 2026' });
    expect(message().value).toContain('Margaret Hayes passed away on May 29, 2026.');
    expect(screen.getByText(/We start it from the details/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use the details above' })).toBeNull();
  });

  it('follows the details until the first edit, then keeps the edit', async () => {
    const user = userEvent.setup();
    const { patches, onReadyChange } = setup({ personName: 'Margaret Hayes' });
    await user.type(message(), '!');
    expect(patches[0]?.announcementMessage).toMatch(/Margaret Hayes passed away.*!$/);
    expect(screen.getByText(/You changed the message/)).toBeInTheDocument();
    expect(onReadyChange).not.toHaveBeenCalled();
  });

  it('resets to the details and returns focus to the message', async () => {
    const user = userEvent.setup();
    const { patches } = setup({ personName: 'Margaret Hayes', announcementMessage: 'My own words' });
    expect(message().value).toBe('My own words');
    await user.click(screen.getByRole('button', { name: 'Use the details above' }));
    expect(patches.at(-1)).toEqual({ announcementMessage: undefined });
    expect(message().value).toContain('Margaret Hayes passed away');
    expect(message()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Use the details above' })).toBeNull();
  });

  it('marks the section ready and offers Next', async () => {
    const user = userEvent.setup();
    const onReadyChange = vi.fn();
    const onNext = vi.fn();
    render(
      <AnnouncementSection values={{}} onChange={vi.fn()} onReadyChange={onReadyChange} nextSection="service" onNext={onNext} />,
    );
    await user.click(screen.getByRole('button', { pressed: false }));
    expect(onReadyChange).toHaveBeenCalledWith(true);
  });

  it('has no heading, send, share or delete control', () => {
    setup({ personName: 'Margaret Hayes' });
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: /send|share|delete|remove/i })).toBeNull();
  });

  it('has no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'AnnouncementSection.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsAnnouncement')).toEqual([]);
  });
});
