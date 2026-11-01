import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { SideNav } from './SideNav';
import type { CmsNavKey } from './SideNav';

function setup(props: Partial<Parameters<typeof SideNav>[0]> = {}) {
  const onSelect = vi.fn();
  const onChangePerson = vi.fn();
  render(<SideNav personName="Margaret Hale" section="service" onSelect={onSelect} onChangePerson={onChangePerson} {...props} />);
  return { onSelect, onChangePerson };
}

describe('SideNav', () => {
  it('lists the 7 items in order, with Your people first and no The person link, inside the Sections nav', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const names = within(nav).getAllByRole('listitem').map((li) => li.textContent);
    expect(names).toEqual(['Your people', 'Overview', 'Announcement', 'Service', 'Obituary', 'Thank-yous', 'Your account']);
  });

  it('makes every section and the two ends a button', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Your people',
      'Overview',
      'Announcement',
      'Service',
      'Obituary',
      'Thank-yous',
      'Your account',
    ]);
  });

  it('marks only the current item with aria-current=page', () => {
    setup({ section: 'people' });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const current = within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current.map((b) => b.textContent)).toEqual(['Your people']);
  });

  it('is 12rem wide from md up, never shrinks, and stays sticky', () => {
    setup();
    const column = screen.getByRole('navigation', { name: 'Sections' }).parentElement?.parentElement;
    expect(column?.className).toContain('md:w-48');
    expect(column?.className).toContain('md:shrink-0');
    expect(column?.className).toContain('md:sticky');
  });

  it('shows the person name', () => {
    setup();
    expect(screen.getByText('Margaret Hale')).toBeInTheDocument();
  });

  it('shows no name line for a blank name, and never "Not named yet"', () => {
    setup({ personName: '  ' });
    expect(screen.queryByText('Not named yet')).toBeNull();
    expect(screen.queryByText('Margaret Hale')).toBeNull();
  });

  it('Change has a name that starts with its visible word and calls onChangePerson', async () => {
    const { onChangePerson } = setup();
    const change = screen.getByRole('button', { name: "Change who you're writing about" });
    expect(change).toHaveTextContent('Change');
    await userEvent.click(change);
    expect(onChangePerson).toHaveBeenCalledTimes(1);
  });

  it('keeps the menu button outside the nav landmark and hides it from md up', () => {
    setup();
    const menu = screen.getByRole('button', { name: 'Sections · Service' });
    expect(within(screen.getByRole('navigation')).queryByRole('button', { name: /^Sections/ })).toBeNull();
    expect(menu).toHaveClass('md:hidden');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(menu.getAttribute('aria-controls') ?? '')).toHaveClass('hidden', 'md:flex');
  });

  it('opens and closes with the menu button', async () => {
    setup();
    const menu = screen.getByRole('button', { name: 'Sections · Service' });
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('choosing an item calls onSelect and closes the menu', async () => {
    const { onSelect } = setup();
    const menu = screen.getByRole('button', { name: 'Sections · Service' });
    await userEvent.click(menu);
    await userEvent.click(screen.getByRole('button', { name: 'Your people' }));
    expect(onSelect).toHaveBeenCalledWith<[CmsNavKey]>('people');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('Escape closes the menu and returns focus to the menu button', async () => {
    setup();
    const menu = screen.getByRole('button', { name: 'Sections · Service' });
    await userEvent.click(menu);
    screen.getByRole('button', { name: 'Overview' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('shows a green check for ready, a plain icon for not started, and not those words', () => {
    setup({ statuses: { announcement: 'ready', service: 'in_progress' } });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).queryByText('Ready')).toBeNull();
    expect(within(nav).queryByText('Not started')).toBeNull();
    expect(within(nav).getByText('In progress')).toBeInTheDocument();
    const ready = within(nav).getByRole('img', { name: 'Ready' });
    expect(ready.closest('button')).toHaveTextContent('Announcement');
    expect(ready.getAttribute('class')).toContain('success');
    // Obituary and Thank-yous are not started; Overview and the ends carry no status.
    expect(within(nav).getAllByRole('img', { name: 'Not started' })).toHaveLength(2);
    expect(within(nav).queryByText('Later')).toBeNull();
  });

  it('gives an item its label and status as one name, with a space between', () => {
    setup({ statuses: { service: 'in_progress' } });
    expect(screen.getByRole('button', { name: 'Service In progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Obituary Not started' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
  });

  it('styles the current item beyond aria-current', () => {
    setup({ section: 'service' });
    const current = screen.getByRole('button', { name: 'Service' });
    expect(current).toHaveClass('bg-accent-100', 'shadow-[inset_3px_0_0_var(--color-accent-700)]');
    expect(current).not.toHaveClass('font-semibold');
    expect(screen.getByRole('button', { name: 'Overview' })).not.toHaveClass('bg-accent-100');
  });

  it('puts the current section in the phone menu button', () => {
    setup({ section: 'overview' });
    expect(screen.getByRole('button', { name: 'Sections · Overview' })).toBeInTheDocument();
  });

  it('is sticky from md up at the shell offset', () => {
    setup();
    const menu = screen.getByRole('button', { name: 'Sections · Service' });
    expect(menu.parentElement).toHaveClass('md:sticky', 'md:top-4');
  });

  it('with accountOnly offers just Your people and Your account: no sections, no name, no Change, no menu button', async () => {
    const { onSelect } = setup({ accountOnly: true });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Your people', 'Your account']);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText('Margaret Hale')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Your account' }));
    expect(onSelect).toHaveBeenCalledWith('account');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Your people' }));
    expect(onSelect).toHaveBeenCalledWith('people');
  });

  it('with accountOnly marks the current item: Your people or Your account', () => {
    setup({ accountOnly: true, section: 'people' });
    expect(screen.getByRole('button', { name: 'Your people' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Your account' })).not.toHaveAttribute('aria-current');
    cleanup();
    setup({ accountOnly: true, section: 'account' });
    expect(screen.getByRole('button', { name: 'Your account' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Your people' })).not.toHaveAttribute('aria-current');
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'SideNav.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });
});
