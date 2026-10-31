import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { ServiceSection, type ServicePatch } from './ServiceSection';

type Values = Parameters<typeof ServiceSection>[0]['values'];

/** Keeps the values in state, like the editor does, and records each patch. */
function setup(initial: Values = {}) {
  const patches: ServicePatch[] = [];
  const onReadyChange = vi.fn();
  function Harness() {
    const [values, setValues] = useState<Values>(initial);
    return (
      <ServiceSection
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
const preview = () => screen.getByRole('region', { name: 'What people will read' });
const change = () => userEvent.click(screen.getByRole('button', { name: 'Change the words' }));

describe('ServiceSection', () => {
  it('shows the ready hint, and "Back to Overview" only once ready with nothing left', async () => {
    const onNext = vi.fn();
    const { rerender } = render(
      <ServiceSection values={{}} onChange={vi.fn()} onReadyChange={vi.fn()} nextSection={null} onNext={onNext} />,
    );
    expect(screen.getByText(/Mark as ready when these details are settled/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Overview' })).toBeNull();
    rerender(
      <ServiceSection
        values={{ sectionStatus: { service: 'ready' } }}
        onChange={vi.fn()}
        onReadyChange={vi.fn()}
        nextSection={null}
        onNext={onNext}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Back to Overview' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  const add = (name: string) => userEvent.click(screen.getByRole('button', { name }));

  it('opens Funeral only, with the intro, and plain Add buttons for the rest; no h1', () => {
    setup();
    const names = screen.getAllByRole('group').map((g) => g.querySelector('legend')?.textContent);
    expect(names).toEqual(['Funeral or memorial service']);
    expect(screen.getByText("Add only the parts you're having. You can change anything later.")).toBeInTheDocument();
    for (const name of ['Add visitation or calling hours', 'Add burial', 'Add reception']) {
      const b = screen.getByRole('button', { name });
      expect(b).not.toHaveAttribute('aria-expanded');
      expect(b).not.toHaveAttribute('aria-controls');
      expect(b).toHaveClass('gg-chip', 'min-h-[44px]', 'text-accent-700');
      expect(within(b).getByTestId('add-icon')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByText('Also having')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Funeral or memorial service' }).closest('.gg-panel')).not.toBeNull();
  });

  it('opened groups follow the funeral card in real-world order, each its own panel, and focus moves to the new group', async () => {
    setup();
    await add('Add reception');
    await add('Add visitation or calling hours');
    expect(screen.getByRole('group', { name: 'Visitation or calling hours' })).toHaveFocus();
    await add('Add burial');
    expect(screen.getByRole('group', { name: 'Burial' })).toHaveFocus();
    const names = screen.getAllByRole('group').map((g) => g.querySelector('legend')?.textContent);
    expect(names).toEqual(['Funeral or memorial service', 'Visitation or calling hours', 'Burial', 'Reception']);
    expect(screen.getByRole('group', { name: 'Burial' }).closest('.gg-panel')).toHaveClass('gg-enter');
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
    expect(screen.queryByText('Also having')).toBeNull();
  });

  it('a group with data opens on its own, and stays open when the data is cleared', async () => {
    setup({ visitationPlace: 'Hall', burialPrivate: true });
    expect(screen.getByRole('textbox', { name: 'Visitation or calling hours Place' })).toHaveValue('Hall');
    expect(screen.getByRole('group', { name: 'Burial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add reception' })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Visitation or calling hours Place' }));
    expect(screen.getByRole('group', { name: 'Visitation or calling hours' })).toBeInTheDocument();
  });

  it('each group writes its own fields', async () => {
    const { patches } = setup();
    await add('Add visitation or calling hours');
    await add('Add burial');
    await add('Add reception');
    await userEvent.type(screen.getByRole('textbox', { name: 'Visitation or calling hours Place' }), 'H');
    expect(patches.at(-1)).toEqual({ visitationPlace: 'H' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Funeral or memorial service Place' }), 'C');
    expect(patches.at(-1)).toEqual({ servicePlace: 'C' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Burial Cemetery' }), 'R');
    expect(patches.at(-1)).toEqual({ burialPlace: 'R' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Reception Place' }), 'P');
    expect(patches.at(-1)).toEqual({ receptionPlace: 'P' });
  });

  it('the funeral group also writes type, address and officiant', async () => {
    const { patches } = setup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Funeral or memorial service Type of service (optional)' }), 'F');
    expect(patches.at(-1)).toEqual({ serviceType: 'F' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Funeral or memorial service Address' }), 'A');
    expect(patches.at(-1)).toEqual({ serviceAddress: 'A' });
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Funeral or memorial service Who will lead it (officiant)' }),
      'O',
    );
    expect(patches.at(-1)).toEqual({ serviceOfficiant: 'O' });
  });

  it('only the main service date writes serviceDate', async () => {
    const { patches } = setup();
    await add('Add visitation or calling hours');
    await add('Add burial');
    await add('Add reception');
    await userEvent.type(screen.getByRole('textbox', { name: 'Visitation or calling hours Date' }), '1');
    await userEvent.type(screen.getByRole('textbox', { name: 'Burial Date' }), '2');
    await userEvent.type(screen.getByRole('textbox', { name: 'Reception Date' }), '3');
    expect(patches.some((p) => 'serviceDate' in p)).toBe(false);
    await userEvent.type(screen.getByRole('textbox', { name: 'Funeral or memorial service Date' }), '4');
    expect(patches.at(-1)).toEqual({ serviceDate: '4' });
  });

  it('Private family hides the burial fields and the message says so', async () => {
    const { patches } = setup({ personName: 'Margaret Hayes', burialPlace: 'Rest Haven' });
    const box = screen.getByRole('checkbox', { name: 'Private burial, family only' });
    await userEvent.click(box);
    expect(patches.at(-1)).toEqual({ burialPrivate: true });
    expect(screen.getByRole('group', { name: 'Burial' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Cemetery')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Burial Date' })).toBeNull();
    expect(box).toHaveFocus();
    expect(preview()).toHaveTextContent('The burial will be private.');
    await userEvent.click(box);
    expect(screen.getByRole('textbox', { name: 'Burial Cemetery' })).toHaveValue('Rest Haven');
  });

  it('the checkbox is first in the burial group and its label is at least 44px tall', async () => {
    setup();
    await add('Add burial');
    const group = screen.getByRole('group', { name: 'Burial' });
    const box = within(group).getByRole('checkbox');
    expect(box.closest('label')).toHaveClass('min-h-[44px]');
    expect(group.querySelector('legend')?.nextElementSibling).toBe(box.closest('label'));
  });

  it('type of service comes after the place in the funeral group', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Funeral or memorial service' });
    const order = Array.from(group.querySelectorAll('label')).map((l) => l.textContent);
    expect(order.indexOf('Place')).toBeGreaterThan(-1);
    expect(order.indexOf('Type of service (optional)')).toBeGreaterThan(order.indexOf('Place'));
    expect(order.indexOf('Date')).toBeLessThan(order.indexOf('Place'));
  });

  it('the preview follows the details until the words are changed', async () => {
    setup({ personName: 'Margaret Hayes' });
    expect(preview()).toHaveTextContent('Add the details above and the message will appear here.');
    expect(preview()).not.toHaveTextContent('Hall');
    await add('Add reception');
    await userEvent.type(screen.getByRole('textbox', { name: 'Reception Place' }), 'Hall');
    expect(preview()).toHaveTextContent('A reception will be held at Hall.');
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use the details above' })).toBeNull();
  });

  it('is not a live region, has no phone styling, and shows a calm placeholder text with no details', () => {
    setup();
    expect(preview().closest('[aria-live]')).toBeNull();
    expect(preview().querySelector('[aria-live]')).toBeNull();
    expect(preview()).not.toHaveTextContent(/undefined|null/);
    expect(preview()).toHaveTextContent('Add the details above and the message will appear here.');
  });

  it('shows a placeholder when the edited message is empty', () => {
    setup({ serviceMessage: '' });
    expect(preview()).toHaveTextContent('Add the details above and the message will appear here.');
  });

  it('Change the words swaps in the textarea and moves focus into it', async () => {
    setup({ personName: 'Margaret Hayes', serviceDate: 'June 3, 2026' });
    await change();
    expect(message()).toHaveFocus();
    expect(message().value).toContain("Margaret Hayes' service");
    expect(screen.queryByRole('button', { name: 'Change the words' })).toBeNull();
  });

  it('after an edit the message stays as typed, and reset restores the preview with focus back', async () => {
    const { patches } = setup({ personName: 'Margaret Hayes' });
    await change();
    await userEvent.type(message(), 'X');
    expect(patches.at(-1)?.serviceMessage).toMatch(/X$/);
    await userEvent.click(screen.getByRole('button', { name: 'Use the details above' }));
    expect(patches.at(-1)).toEqual({ serviceMessage: undefined });
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(preview()).not.toHaveTextContent(/X$/);
    expect(screen.queryByRole('button', { name: 'Use the details above' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change the words' })).toHaveFocus();
  });

  it('new details do not reach an edited message', async () => {
    setup({ personName: 'Margaret Hayes', serviceMessage: 'My own words.' });
    await add('Add reception');
    await userEvent.type(screen.getByRole('textbox', { name: 'Reception Place' }), 'Hall');
    expect(preview()).toHaveTextContent('My own words.');
    expect(preview()).not.toHaveTextContent('Hall');
  });

  it('the hint is one sentence, changes once edited, stays linked to the textarea, and reset restores it', async () => {
    setup({ personName: 'Margaret Hayes' });
    const original = 'We start it from the details above. You can change it.';
    const stale = 'You changed the words, so new details above will not appear in them.';
    const hint = () => document.querySelector('[id$="-message-hint"]');
    expect(hint()).toHaveTextContent(original);
    await change();
    expect(message()).toHaveAccessibleDescription(original);
    await userEvent.type(message(), 'X');
    expect(hint()).toHaveTextContent(stale);
    expect(message()).toHaveAccessibleDescription(stale);
    await userEvent.click(screen.getByRole('button', { name: 'Use the details above' }));
    expect(hint()).toHaveTextContent(original);
  });

  describe('See the message link', () => {
    const link = () => screen.getByRole('link', { name: 'See the message' });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it.each([
      [true, 'smooth'],
      [false, 'auto'],
    ])('scrolls to the preview and focuses it (motion allowed: %s)', async (allowed, behavior) => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: allowed && query.includes('no-preference') }));
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      setup();
      expect(link()).toHaveClass('md:hidden');
      await userEvent.click(link());
      expect(scroll).toHaveBeenCalledWith({ behavior, block: 'start' });
      expect(preview()).toHaveFocus();
    });
  });

  describe('same day and same place as the service', () => {
    const service = { serviceDate: 'May 29, 2026', servicePlace: 'Chapel' };

    it('offers neither while the service has no date or place', async () => {
      setup();
      await add('Add reception');
      expect(screen.queryByRole('button', { name: /Same (day|place) as the service/ })).toBeNull();
    });

    it('fills the reception date once on tap, moves focus there, and the button goes away', async () => {
      const { patches } = setup(service);
      await add('Add reception');
      expect(patches).toEqual([]);
      await userEvent.click(screen.getByRole('button', { name: 'Reception Same day as the service' }));
      expect(patches).toEqual([{ receptionDate: 'May 29, 2026' }]);
      expect(screen.getByRole('textbox', { name: 'Reception Date' })).toHaveValue('May 29, 2026');
      expect(screen.getByRole('textbox', { name: 'Reception Date' })).toHaveFocus();
      expect(screen.queryByRole('button', { name: 'Reception Same day as the service' })).toBeNull();
    });

    it('fills the visitation place on tap', async () => {
      const { patches } = setup(service);
      await add('Add visitation or calling hours');
      await userEvent.click(screen.getByRole('button', { name: 'Visitation or calling hours Same place as the service' }));
      expect(patches).toEqual([{ visitationPlace: 'Chapel' }]);
      expect(screen.getByRole('textbox', { name: 'Visitation or calling hours Place' })).toHaveFocus();
    });

    it('burial gets a same-day button but no same-place button', async () => {
      const { patches } = setup(service);
      await add('Add burial');
      expect(screen.queryByRole('button', { name: /Burial Same place/ })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Burial Same day as the service' }));
      expect(patches).toEqual([{ burialDate: 'May 29, 2026' }]);
    });

    it('offers nothing for a field that already has a value, and the funeral group has none', async () => {
      setup({ ...service, receptionDate: 'June 1, 2026', receptionPlace: 'Hall' });
      expect(screen.queryByRole('button', { name: /Same (day|place) as the service/ })).toBeNull();
    });
  });

  it('notes write serviceNotes', async () => {
    const { patches } = setup();
    await userEvent.type(screen.getByLabelText('Anything else people should know'), 'N');
    expect(patches.at(-1)).toEqual({ serviceNotes: 'N' });
  });

  it('mark as ready follows sectionStatus.service and reports changes', async () => {
    const { onReadyChange } = setup({ sectionStatus: { service: 'ready' } });
    const button = screen.getByRole('button', { name: 'Mark as ready' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(onReadyChange).toHaveBeenCalledWith(false);
  });

  it('has no sms: link and no send, delete or remove control (C1, C9)', () => {
    setup({ personName: 'Margaret Hayes', serviceMessage: 'Hello' });
    expect(document.querySelector('a[href^="sms:"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /messages/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /send|share|delete|remove/i })).toBeNull();
  });

  it('every group is a labelled fieldset', () => {
    setup({ receptionPlace: 'x' });
    const group = screen.getByRole('group', { name: 'Reception' });
    expect(within(group).getByLabelText('Reception Date')).toBeInTheDocument();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ServiceSection.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsService')).toEqual([]);
  });
});
