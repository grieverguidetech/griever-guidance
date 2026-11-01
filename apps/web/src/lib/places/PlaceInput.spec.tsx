import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaceInput } from './PlaceInput';
import { PlacesProvider } from './PlacesContext';
import type { PlaceSuggestion, PlacesClient } from './placesClient';

const funeralHome: PlaceSuggestion = {
  id: 'a',
  text: 'Oak Funeral Home, 1 Main St, Springfield, MO',
  mainText: 'Oak Funeral Home',
  secondaryText: '1 Main St, Springfield, MO',
};
const church: PlaceSuggestion = { id: 'b', text: 'St Mark Church, 2 Elm St, Springfield, MO', mainText: 'St Mark Church', secondaryText: '2 Elm St, Springfield, MO' };

function fakeClient(results: PlaceSuggestion[] = [funeralHome, church]) {
  const suggest = vi.fn<PlacesClient['suggest']>().mockResolvedValue(results);
  const endSession = vi.fn();
  return { client: { suggest, endSession } satisfies PlacesClient, suggest, endSession };
}

function setup(opts: { enabled?: boolean; load?: () => Promise<PlacesClient | null>; types?: readonly string[] } = {}) {
  const values: string[] = [];
  const types = 'types' in opts ? opts.types : ['funeral_home', 'church'];
  function Harness() {
    const [value, setValue] = useState('');
    return (
      <PlacesProvider value={{ enabled: opts.enabled ?? true, load: opts.load ?? (() => Promise.resolve(null)) }}>
        <label htmlFor="p" id="p-label">Place</label>
        <PlaceInput
          id="p"
          labelledBy="p-label"
          value={value}
          types={types}
          onChange={(v) => {
            values.push(v);
            setValue(v);
          }}
        />
      </PlacesProvider>
    );
  }
  render(<Harness />);
  return { values, input: () => screen.getByRole('combobox', { name: 'Place' }) as HTMLInputElement };
}

/** Types, then waits out the debounce. */
async function typeAndWait(text: string) {
  await userEvent.type(screen.getByLabelText('Place'), text);
  await screen.findByRole('listbox');
}

describe('PlaceInput', () => {
  it('asks for suggestions only after 3 characters, once typing pauses, with the place types', async () => {
    const { client, suggest } = fakeClient();
    setup({ load: () => Promise.resolve(client) });
    await userEvent.type(screen.getByLabelText('Place'), 'oa');
    await new Promise((r) => setTimeout(r, 450));
    expect(suggest).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Place'), 'k');
    expect(suggest).not.toHaveBeenCalled();
    expect(await screen.findAllByRole('option')).toHaveLength(2);
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('oak', ['funeral_home', 'church']);
  });

  it('sends one request for fast typing, with the whole text', async () => {
    const { client, suggest } = fakeClient();
    setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak fun');
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('oak fun', ['funeral_home', 'church']);
  });

  it('is a combobox with a listbox, the count announced politely, and options at least 44px', async () => {
    const { client } = fakeClient();
    const { input } = setup({ load: () => Promise.resolve(client) });
    expect(input().getAttribute('aria-expanded')).toBe('false');
    await typeAndWait('oak');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    expect(screen.getByRole('listbox', { name: 'Place suggestions' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 suggestions available');
    for (const o of screen.getAllByRole('option')) {
      expect(o.className).toContain('min-h-[44px]');
    }
  });

  it('moves with the arrow keys (wrapping), points aria-activedescendant at the option, and keeps focus in the input', async () => {
    const { client } = fakeClient();
    const { input } = setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak');
    const [first, second] = screen.getAllByRole('option');
    await userEvent.keyboard('{ArrowDown}');
    expect(input().getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(input().getAttribute('aria-activedescendant')).toBe(second.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(input().getAttribute('aria-activedescendant')).toBe(first.id);
    await userEvent.keyboard('{ArrowUp}');
    expect(input().getAttribute('aria-activedescendant')).toBe(second.id);
    expect(input()).toHaveFocus();
  });

  it('Enter on the highlighted option fills the field with name and address, closes, and ends the session', async () => {
    const { client, endSession } = fakeClient();
    const { input, values } = setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(input().value).toBe(funeralHome.text);
    expect(values.at(-1)).toBe(funeralHome.text);
    expect(screen.queryByRole('option')).toBeNull();
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input()).toHaveFocus();
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('a click on an option fills the field', async () => {
    const { client } = fakeClient();
    const { input } = setup({ load: () => Promise.resolve(client) });
    await typeAndWait('st m');
    await userEvent.click(screen.getByRole('option', { name: /St Mark Church/ }));
    expect(input().value).toBe(church.text);
  });

  it('Enter with no highlighted option does nothing to the text; Escape closes and keeps what was typed', async () => {
    const { client } = fakeClient();
    const { input } = setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak');
    await userEvent.keyboard('{Enter}');
    expect(input().value).toBe('oak');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { hidden: false })).toBeNull();
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().value).toBe('oak');
  });

  it('lets the user ignore the suggestions and keep typing anything', async () => {
    const { client } = fakeClient();
    const { input } = setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak');
    await userEvent.type(input(), ' hall, my own words');
    expect(input().value).toBe('oak hall, my own words');
  });

  it('announces "No suggestions" and stays closed when nothing matches', async () => {
    const { client } = fakeClient([]);
    const { input } = setup({ load: () => Promise.resolve(client) });
    await userEvent.type(input(), 'zzz');
    expect(await screen.findByText('No suggestions')).toBeInTheDocument();
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores an answer that arrives after the text changed', async () => {
    let release: (v: PlaceSuggestion[]) => void = () => undefined;
    const slow: PlacesClient = {
      suggest: () => new Promise((r) => (release = r)),
      endSession: vi.fn(),
    };
    const { input } = setup({ load: () => Promise.resolve(slow) });
    await userEvent.type(input(), 'oak');
    await new Promise((r) => setTimeout(r, 450));
    await userEvent.type(input(), 'x');
    await act(async () => release([funeralHome]));
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('with no key: a plain text input, no combobox, never loads Google, no error', async () => {
    const load = vi.fn(() => Promise.resolve(null));
    setup({ enabled: false, load });
    const field = screen.getByRole('textbox', { name: 'Place' });
    await userEvent.type(field, 'oak hall');
    await new Promise((r) => setTimeout(r, 450));
    expect(field).toHaveValue('oak hall');
    expect(field).not.toHaveAttribute('aria-expanded');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('with a place field that has no types: a plain text input', () => {
    setup({ types: undefined });
    expect(screen.getByRole('textbox', { name: 'Place' })).not.toHaveAttribute('aria-expanded');
  });

  it('when Google does not load: the field keeps working, nothing is shown', async () => {
    const { input } = setup({ load: () => Promise.resolve(null) });
    await userEvent.type(input(), 'oak hall');
    await new Promise((r) => setTimeout(r, 450));
    expect(input().value).toBe('oak hall');
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('when a request fails: the field keeps working, nothing is shown', async () => {
    const failing: PlacesClient = { suggest: () => Promise.reject(new Error('quota')), endSession: vi.fn() };
    const { input } = setup({ load: () => Promise.resolve(failing) });
    await userEvent.type(input(), 'oak hall');
    await new Promise((r) => setTimeout(r, 450));
    expect(input().value).toBe('oak hall');
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
