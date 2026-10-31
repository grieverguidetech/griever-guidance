import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { ThanksSection, type ThanksPatch } from './ThanksSection';

type Values = Parameters<typeof ThanksSection>[0]['values'];

function setup(initial: Values = {}) {
  const patches: ThanksPatch[] = [];
  const onReadyChange = vi.fn();
  function Harness() {
    const [values, setValues] = useState<Values>(initial);
    return (
      <ThanksSection
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

describe('ThanksSection', () => {
  it('shows the intro, one message prefilled with the name, and no h1', () => {
    setup({ personName: 'Margaret Hayes' });
    expect(screen.getByText(/A short note to thank the people who supported you/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(message().value).toContain('after the passing of Margaret Hayes.');
    expect(screen.queryByRole('button', { name: 'Use the starting message' })).toBeNull();
  });

  it('follows the name until the first edit, then stops', async () => {
    const { rerender } = render(<ThanksSection values={{ personName: 'Ann' }} onChange={vi.fn()} onReadyChange={vi.fn()} />);
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toContain('passing of Ann.');
    rerender(<ThanksSection values={{ personName: 'Bea' }} onChange={vi.fn()} onReadyChange={vi.fn()} />);
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toContain('passing of Bea.');
    rerender(<ThanksSection values={{ personName: 'Cy', thanksMessage: 'Mine' }} onChange={vi.fn()} onReadyChange={vi.fn()} />);
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Mine');
  });

  it('uses a plain fallback when there is no name', () => {
    setup();
    expect(message().value).toContain('passing of our loved one.');
    expect(message().value).not.toContain('{');
  });

  it('saves only thanksMessage on edit, shows the edited hint, and resets with focus kept', async () => {
    const { patches } = setup({ personName: 'Ann' });
    await userEvent.type(message(), '!');
    expect(patches.at(-1)).toEqual({ thanksMessage: expect.stringMatching(/!$/) });
    expect(screen.getByText(/You changed the message/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use the starting message' }));
    expect(patches.at(-1)).toEqual({ thanksMessage: undefined });
    expect(message().value).toContain('passing of Ann.');
    expect(message()).toHaveFocus();
    expect(screen.getByText(/We start it from the name on The person/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use the starting message' })).toBeNull();
  });

  it('marks ready, and leads on to the next section or the Overview', async () => {
    const onReadyChange = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(<ThanksSection values={{}} onChange={vi.fn()} onReadyChange={onReadyChange} nextSection={null} onNext={onNext} />);
    expect(screen.queryByRole('button', { name: 'Back to Overview' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { pressed: false }));
    expect(onReadyChange).toHaveBeenCalledWith(true);
    rerender(<ThanksSection values={{ sectionStatus: { thanks: 'ready' } }} onChange={vi.fn()} onReadyChange={onReadyChange} nextSection={null} onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to Overview' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('has no send, share or delete control', () => {
    setup();
    expect(screen.queryByRole('button', { name: /send|share|delete|remove/i })).toBeNull();
    expect(document.querySelector('a[href^="sms:"]')).toBeNull();
  });

  it('has no hard-coded copy in the source', () => {
    const source = readFileSync(join(__dirname, 'ThanksSection.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsThanks')).toEqual([]);
  });
});
