import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { SideNav } from './SideNav';
import type { CmsNavKey } from './SideNav';

function setup(props: Partial<Parameters<typeof SideNav>[0]> = {}) {
  const onSelect = vi.fn();
  render(<SideNav personName="Margaret Hale" section="service" onSelect={onSelect} {...props} />);
  return { onSelect };
}

describe('SideNav', () => {
  it('lists the 7 items in order, with Overview first, Your people before the account, and no The person link, inside the Sections nav', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
    const names = within(nav).getAllByRole('listitem').map((li) => li.textContent?.trim());
    expect(names).toEqual(['Overview', 'Announcement', 'Service', 'Obituary', 'Thank-yous', 'Your people', 'Your account']);
  });

  it('names the person in the landmark, and keeps Sections with no name', () => {
    setup();
    expect(screen.getByRole('navigation', { name: 'Sections for Margaret Hale' })).toBeInTheDocument();
    cleanup();
    setup({ personName: '  ' });
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
  });

  it('has no Change button and no name line, in any state', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Change/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Margaret Hale')).toBeNull();
  });

  it('makes every section and the two ends a button', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Overview',
      'Announcement',
      'Service',
      'Obituary',
      'Thank-yous',
      'Your people',
      'Your account',
    ]);
  });

  it('marks only the current item with aria-current=page', () => {
    setup({ section: 'people' });
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
    const current = within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current.map((b) => b.textContent?.trim())).toEqual(['Your people']);
  });

  it('is 12rem wide from md up, never shrinks, and stays sticky', () => {
    setup();
    const column = screen.getByRole('navigation', { name: /^Sections/ }).parentElement?.parentElement;
    expect(column?.className).toContain('md:w-48');
    expect(column?.className).toContain('md:shrink-0');
    expect(column?.className).toContain('md:sticky');
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
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
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

  it('shows the not-started circles with no statuses given, the same as with nobody saved', () => {
    setup({ personName: '' });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('img', { name: 'Not started' })).toHaveLength(4);
  });

  it('gives an item its label and status as one name, with a space between', () => {
    setup({ statuses: { service: 'in_progress' } });
    expect(screen.getByRole('button', { name: 'Service In progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Obituary Not started' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
  });

  it('styles the current item beyond aria-current', () => {
    setup({ section: 'service' });
    const current = screen.getByRole('button', { name: /^Service/ });
    expect(current).toHaveClass('bg-accent-100', 'shadow-[inset_3px_0_0_var(--color-accent-700)]');
    expect(current).not.toHaveClass('font-semibold');
    expect(screen.getByRole('button', { name: 'Overview' })).not.toHaveClass('bg-accent-100');
  });

  it('on The person screen marks Your people current, and says so in the phone menu button', () => {
    setup({ section: 'person' });
    expect(screen.getByRole('button', { name: 'Your people' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Sections · Your people' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page')).toHaveLength(1);
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

  it('with nobody named still offers the full nav, with no name line', async () => {
    const { onSelect } = setup({ personName: '', section: 'people' });
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      'Overview',
      'Announcement',
      'Service',
      'Obituary',
      'Thank-yous',
      'Your people',
      'Your account',
    ]);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Obituary/ }));
    expect(onSelect).toHaveBeenCalledWith('obituary');
  });

  it('with nobody named marks the current item: Your people or Your account', () => {
    setup({ personName: '', section: 'people' });
    expect(screen.getByRole('button', { name: 'Your people' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Your account' })).not.toHaveAttribute('aria-current');
    cleanup();
    setup({ personName: '', section: 'account' });
    expect(screen.getByRole('button', { name: 'Your account' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Your people' })).not.toHaveAttribute('aria-current');
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'SideNav.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });
});
