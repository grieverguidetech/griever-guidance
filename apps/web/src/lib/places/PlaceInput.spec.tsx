import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaceInput, countText, type PlaceInputProps as Props } from './PlaceInput';
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
  const newToken = vi.fn(() => ({}));
  const details = vi.fn<PlacesClient['details']>().mockResolvedValue({ name: 'Oak Funeral Home', address: '1 Main St, Springfield, MO 65801' });
  return { client: { suggest, newToken, details } satisfies PlacesClient, suggest, newToken, details };
}

function setup(opts: { onPick?: Props['onPick']; wantsDetails?: Props['wantsDetails']; enabled?: boolean; load?: () => Promise<PlacesClient | null>; types?: readonly string[] } = {}) {
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
          onPick={opts.onPick}
          wantsDetails={opts.wantsDetails}
          onChange={(v) => {
            values.push(v);
            setValue(v);
          }}
        />
      </PlacesProvider>
    );
  }
  const { unmount } = render(<Harness />);
  return { unmount, values, input: () => screen.getByRole('combobox', { name: 'Place' }) as HTMLInputElement };
}

/** Types, then waits out the debounce. */
async function typeAndWait(text: string) {
  await userEvent.type(screen.getByLabelText('Place'), text);
  await screen.findByRole('listbox');
  await waitFor(() => expect(screen.queryByText('Searching…')).toBeNull());
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
    expect(suggest).toHaveBeenCalledWith('oak', ['funeral_home', 'church'], expect.any(Object));
  });

  it('sends one request for fast typing, with the whole text', async () => {
    const { client, suggest } = fakeClient();
    setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak fun');
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('oak fun', ['funeral_home', 'church'], expect.any(Object));
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

  it('Enter on the highlighted option fills the field with name and address and closes', async () => {
    const { client } = fakeClient();
    const { input, values } = setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(input().value).toBe(funeralHome.text);
    expect(values.at(-1)).toBe(funeralHome.text);
    expect(screen.queryByRole('option')).toBeNull();
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input()).toHaveFocus();
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

  it('shows "No matches" as a row that cannot be chosen when nothing matches', async () => {
    const { client } = fakeClient([]);
    const { input } = setup({ load: () => Promise.resolve(client) });
    await userEvent.type(input(), 'zzz');
    const row = await screen.findByRole('option', { name: 'No matches' });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
    await userEvent.click(row);
    expect(input().value).toBe('zzz');
  });

  it('shows a spinner and a Searching row, announced politely, while a search is pending; results replace them', async () => {
    let release: (v: PlaceSuggestion[]) => void = () => undefined;
    const pending: PlacesClient = {
      suggest: () => new Promise((r) => (release = r)),
      newToken: () => ({}),
      details: vi.fn(),
    };
    const { input } = setup({ load: () => Promise.resolve(pending) });
    expect(document.querySelector('.gg-spinner')).toBeNull();
    await userEvent.type(input(), 'oak');
    const row = await screen.findByRole('option', { name: 'Searching…' });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(document.querySelector('.gg-spinner')).not.toBeNull();
    expect(document.querySelector('.gg-spinner')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    expect(input()).not.toHaveAttribute('aria-busy');
    // Still running after about a second: now it is announced.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Searching…'), { timeout: 2000 });
    // The Searching row cannot be chosen, and arrow keys do not move onto it.
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(input().value).toBe('oak');
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
    await act(async () => release([funeralHome]));
    expect(await screen.findByRole('option', { name: /Oak Funeral Home/ })).toBeInTheDocument();
    expect(screen.queryByText('Searching…', { selector: 'li' })).toBeNull();
    expect(document.querySelector('.gg-spinner')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('1 suggestion available');
  });

  it('does not announce Searching later when a search fails quickly', async () => {
    const failing: PlacesClient = {
      suggest: () => Promise.reject(new Error('down')),
      newToken: () => ({}),
      details: vi.fn(),
    };
    const { input } = setup({ load: () => Promise.resolve(failing) });
    await userEvent.type(input(), 'oak');
    await new Promise((r) => setTimeout(r, 1800));
    expect(document.body.textContent).not.toContain('Searching…');
  });

  it('does not announce Searching for a search that finishes quickly', async () => {
    const { client } = fakeClient();
    setup({ load: () => Promise.resolve(client) });
    const seen: string[] = [];
    const watch = new MutationObserver(() => seen.push(screen.getByRole('status').textContent ?? ''));
    watch.observe(screen.getByRole('status'), { childList: true, characterData: true, subtree: true });
    await typeAndWait('oak');
    watch.disconnect();
    expect(seen).not.toContain('Searching…');
    expect(screen.getByRole('status')).toHaveTextContent('2 suggestions available');
  });

  it('Escape closes the Searching row and the No matches row', async () => {
    const { client } = fakeClient([]);
    const { input } = setup({ load: () => Promise.resolve(client) });
    await userEvent.type(input(), 'zzz');
    await screen.findByRole('option', { name: 'No matches' });
    expect(input().getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('closes the Searching row with Escape', async () => {
    const pending: PlacesClient = { suggest: () => new Promise(() => undefined), newToken: () => ({}), details: vi.fn() };
    const { input } = setup({ load: () => Promise.resolve(pending) });
    await userEvent.type(input(), 'oak');
    await screen.findByRole('option', { name: 'Searching…' });
    await userEvent.keyboard('{Escape}');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('draws the spinner ring light under the accent arc', () => {
    const css = readFileSync(join(import.meta.dirname, '../../styles.css'), 'utf8');
    const block = /\.gg-spinner \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(block).toContain('border: 2px solid var(--color-neutral-300)');
    expect(block).toContain('border-top-color: var(--color-accent-700)');
  });

  it('the spinner only spins when motion is allowed', () => {
    const css = readFileSync(join(import.meta.dirname, '../../styles.css'), 'utf8');
    const spin = /@media \(prefers-reduced-motion: no-preference\) \{\s*\.gg-spinner \{[^}]*animation:/;
    expect(css).toMatch(spin);
    expect(css.replace(spin, '')).not.toMatch(/\.gg-spinner\s*\{[^}]*animation:/);
  });

  it('on a pick, fetches the details and gives them to onPick', async () => {
    const { client, details } = fakeClient();
    const onPick = vi.fn(() => true);
    setup({ load: () => Promise.resolve(client), onPick });
    await typeAndWait('oak');
    await userEvent.click(screen.getByRole('option', { name: /Oak Funeral Home/ }));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(details).toHaveBeenCalledWith(funeralHome);
    expect(onPick).toHaveBeenCalledWith(funeralHome, { name: 'Oak Funeral Home', address: '1 Main St, Springfield, MO 65801' });
    expect(screen.getByRole('status')).toHaveTextContent('Address filled in');
  });

  it('on a pick whose details fail, gives onPick null so it can fall back to the prediction', async () => {
    const { client, details } = fakeClient();
    details.mockRejectedValue(new Error('network'));
    const onPick = vi.fn();
    setup({ load: () => Promise.resolve(client), onPick });
    await typeAndWait('oak');
    await userEvent.click(screen.getByRole('option', { name: /Oak Funeral Home/ }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(funeralHome, null));
  });

  it('drops a pick when the user types before its details arrive', async () => {
    const { client, details } = fakeClient();
    let release: (d: { name: string; address: string }) => void = () => undefined;
    details.mockImplementation(() => new Promise((r) => (release = r)));
    const onPick = vi.fn();
    const { input } = setup({ load: () => Promise.resolve(client), onPick });
    await typeAndWait('oak');
    await userEvent.click(screen.getByRole('option', { name: /Oak Funeral Home/ }));
    await userEvent.type(input(), 'x');
    await act(async () => release({ name: 'a', address: 'b' }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('while details load: the spinner and busy list show, and the place name is in the field at once', async () => {
    const { client, details } = fakeClient();
    let release: (d: { name: string; address: string }) => void = () => undefined;
    details.mockImplementation(() => new Promise((r) => (release = r)));
    const onPick = vi.fn(() => true);
    const { input } = setup({ load: () => Promise.resolve(client), onPick });
    await typeAndWait('oak');
    await userEvent.click(screen.getByRole('option', { name: /Oak Funeral Home/ }));
    await waitFor(() => expect(details).toHaveBeenCalled());
    expect(input().value).toBe('Oak Funeral Home');
    expect(document.querySelector('.gg-spinner')).not.toBeNull();
    expect(screen.getByRole('listbox', { hidden: true })).toHaveAttribute('aria-busy', 'true');
    await act(async () => release({ name: 'Oak Funeral Home', address: '1 Main St' }));
    expect(document.querySelector('.gg-spinner')).toBeNull();
    expect(onPick).toHaveBeenCalled();
  });

  it('gives up on slow details after 3 seconds and falls back to null', async () => {
    const { client, details } = fakeClient();
    details.mockImplementation(() => new Promise(() => undefined));
    const onPick = vi.fn();
    setup({ load: () => Promise.resolve(client), onPick });
    await typeAndWait('oak');
    await userEvent.click(screen.getByRole('option', { name: /Oak Funeral Home/ }));
    expect(onPick).not.toHaveBeenCalled();
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(funeralHome, null), { timeout: 4500 });
  }, 10000);

  it('does not call details when wantsDetails says the address will not be used', async () => {
    const { client, details } = fakeClient();
    const onPick = vi.fn();
    setup({ load: () => Promise.resolve(client), onPick, wantsDetails: () => false });
    await typeAndWait('oak');
    await userEvent.click(screen.getByRole('option', { name: /Oak Funeral Home/ }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(funeralHome, null));
    expect(details).not.toHaveBeenCalled();
  });

  it('does not call onPick when the field unmounts while details load', async () => {
    const { client, details } = fakeClient();
    let release: (d: { name: string; address: string }) => void = () => undefined;
    details.mockImplementation(() => new Promise((r) => (release = r)));
    const onPick = vi.fn();
    const { unmount } = setup({ load: () => Promise.resolve(client), onPick });
    await typeAndWait('oak');
    await userEvent.click(screen.getByRole('option', { name: /Oak Funeral Home/ }));
    await waitFor(() => expect(details).toHaveBeenCalled());
    unmount();
    await act(async () => release({ name: 'a', address: 'b' }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('ignores an answer that arrives after the text changed', async () => {
    let release: (v: PlaceSuggestion[]) => void = () => undefined;
    const slow: PlacesClient = {
      suggest: () => new Promise((r) => (release = r)),
      newToken: () => ({}),
      details: vi.fn(),
    };
    const { input } = setup({ load: () => Promise.resolve(slow) });
    await userEvent.type(input(), 'oak');
    await new Promise((r) => setTimeout(r, 450));
    await userEvent.type(input(), 'x');
    await act(async () => release([funeralHome]));
    expect(screen.queryByRole('option', { name: /Oak Funeral Home/ })).toBeNull();
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

  it('when Google does not load: the field becomes a plain textbox, nothing is shown', async () => {
    setup({ load: () => Promise.resolve(null) });
    await userEvent.type(screen.getByLabelText('Place'), 'oak hall');
    const field = await screen.findByRole('textbox', { name: 'Place' });
    expect(field).toHaveValue('oak hall');
    expect(field).not.toHaveAttribute('aria-expanded');
    expect(field).not.toHaveAttribute('aria-controls');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('when a request fails: the field keeps working, nothing is shown', async () => {
    const failing: PlacesClient = { suggest: () => Promise.reject(new Error('quota')), newToken: () => ({}), details: vi.fn() };
    const { input } = setup({ load: () => Promise.resolve(failing) });
    await userEvent.type(input(), 'oak hall');
    await new Promise((r) => setTimeout(r, 450));
    expect(input().value).toBe('oak hall');
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shares no token between fields, keeps one while typing, and starts a new one after a pick', async () => {
    const { client, suggest, newToken } = fakeClient();
    const load = () => Promise.resolve(client);
    function Two() {
      const [a, setA] = useState('');
      const [b, setB] = useState('');
      return (
        <PlacesProvider value={{ enabled: true, load }}>
          <label htmlFor="a">A</label>
          <PlaceInput id="a" labelledBy="" value={a} types={['church']} onChange={setA} />
          <label htmlFor="b">B</label>
          <PlaceInput id="b" labelledBy="" value={b} types={['cemetery']} onChange={setB} />
        </PlacesProvider>
      );
    }
    render(<Two />);
    const fieldA = screen.getByRole('combobox', { name: 'A' });
    const fieldB = screen.getByRole('combobox', { name: 'B' });
    await userEvent.type(fieldA, 'oak');
    await screen.findByRole('listbox');
    await userEvent.type(fieldA, 'x');
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
    const tokenA = suggest.mock.calls[0][2];
    expect(suggest.mock.calls[1][2]).toBe(tokenA);
    await userEvent.type(fieldB, 'rest');
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(3));
    expect(suggest.mock.calls[2][2]).not.toBe(tokenA);
    expect(newToken).toHaveBeenCalledTimes(2);
    // Leaving a field ends its session: coming back starts a new token.
    await userEvent.clear(fieldA);
    await userEvent.type(fieldA, 'elm');
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(4));
    expect(suggest.mock.calls[3][2]).not.toBe(tokenA);
  });

  it('Escape ends the session and does not reach a parent handler', async () => {
    const { client, suggest } = fakeClient();
    const parentEscape = vi.fn();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && parentEscape();
    const { input } = setup({ load: () => Promise.resolve(client) });
    document.addEventListener('keydown', onKey);
    await typeAndWait('oak');
    await userEvent.keyboard('{Escape}');
    document.removeEventListener('keydown', onKey);
    expect(parentEscape).not.toHaveBeenCalled();
    await userEvent.type(input(), 'x');
    await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
    expect(suggest.mock.calls[1][2]).not.toBe(suggest.mock.calls[0][2]);
  });

  it('Down Arrow reopens a closed list', async () => {
    const { client } = fakeClient();
    const { input } = setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    await userEvent.keyboard('{ArrowDown}');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('scrolls the active option into view, nearest', async () => {
    const { client } = fakeClient();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak');
    await userEvent.keyboard('{ArrowDown}');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('puts a separator between the name and the address for a screen reader', async () => {
    const { client } = fakeClient();
    setup({ load: () => Promise.resolve(client) });
    await typeAndWait('oak');
    expect(screen.getByRole('option', { name: /Oak Funeral Home\s*,\s*1 Main St/ })).toBeInTheDocument();
  });

  it('countText says none, one or many', () => {
    expect(countText(0)).toBe('No matches');
    expect(countText(1)).toBe('1 suggestion available');
    expect(countText(3)).toBe('3 suggestions available');
  });
});
