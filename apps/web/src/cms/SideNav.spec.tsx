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
  it('lists the 7 items in order, with Overview first, Who you\'ve lost before the account, and no The person link, inside the Sections nav', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
    const names = within(nav).getAllByRole('listitem').map((li) => li.textContent?.trim());
    expect(names).toEqual(['Overview', 'Announcement', 'Service', 'Obituary', 'Thank-yous', "Who you've lost", 'Your account']);
  });

  it('has a Who you\'ve lost item and no item named Your people', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
    expect(within(nav).getByRole('button', { name: "Who you've lost" })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /your people/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /your people/i })).not.toBeInTheDocument();
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
      "Who you've lost",
      'Your account',
    ]);
  });

  it('marks only the current item with aria-current=page', () => {
    setup({ section: 'people' });
    const nav = screen.getByRole('navigation', { name: /^Sections/ });
    const current = within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current.map((b) => b.textContent?.trim())).toEqual(["Who you've lost"]);
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
    await userEvent.click(screen.getByRole('button', { name: "Who you've lost" }));
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
    expect(current).toHaveClass('bg-v2-wash', 'shadow-[inset_3px_0_0_var(--color-v2-link)]');
    expect(current).not.toHaveClass('font-semibold');
    expect(screen.getByRole('button', { name: 'Overview' })).not.toHaveClass('bg-v2-wash');
  });

  it('on The person screen marks Who you\'ve lost current, and says so in the phone menu button', () => {
    setup({ section: 'person' });
    expect(screen.getByRole('button', { name: "Who you've lost" })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Sections · Who you\'ve lost' })).toBeInTheDocument();
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
      "Who you've lost",
      'Your account',
    ]);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Obituary/ }));
    expect(onSelect).toHaveBeenCalledWith('obituary');
  });

  it('with nobody named marks the current item: Who you\'ve lost or Your account', () => {
    setup({ personName: '', section: 'people' });
    expect(screen.getByRole('button', { name: "Who you've lost" })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Your account' })).not.toHaveAttribute('aria-current');
    cleanup();
    setup({ personName: '', section: 'account' });
    expect(screen.getByRole('button', { name: 'Your account' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: "Who you've lost" })).not.toHaveAttribute('aria-current');
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'SideNav.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });

  describe('with paths (#849)', () => {
    const hrefFor = (key: CmsNavKey) => (key === 'people' || key === 'account' ? null : `/people/abc/${key}`);

    it('makes the pages links with their href, and keeps Who you\'ve lost and Your account as buttons', () => {
      setup({ hrefFor });
      const nav = within(screen.getByRole('navigation', { name: /^Sections/ }));
      expect(nav.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
        '/people/abc/overview',
        '/people/abc/announcement',
        '/people/abc/service',
        '/people/abc/obituary',
        '/people/abc/thanks',
      ]);
      expect(nav.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(["Who you've lost", 'Your account']);
      expect(nav.getByRole('link', { name: /^Service/ })).toHaveAttribute('aria-current', 'page');
      expect(nav.getByRole('link', { name: /^Overview/ })).not.toHaveAttribute('aria-current');
    });

    it('Who you\'ve lost and Your account are links too when they have a path, and keep aria-current (#850)', () => {
      setup({ hrefFor: (key) => (key === 'people' ? '/people' : key === 'account' ? '/account' : null), section: 'account' });
      const nav = within(screen.getByRole('navigation', { name: /^Sections/ }));
      expect(nav.getByRole('link', { name: "Who you've lost" })).toHaveAttribute('href', '/people');
      expect(nav.getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/account');
      expect(nav.getByRole('link', { name: 'Your account' })).toHaveAttribute('aria-current', 'page');
      expect(nav.getByRole('link', { name: "Who you've lost" })).not.toHaveAttribute('aria-current');
    });

    it('on a person page the Who you\'ve lost link keeps aria-current (#954)', () => {
      setup({ hrefFor: (key) => (key === 'people' ? '/people' : `/people/abc/${key}`), section: 'person' });
      const nav = within(screen.getByRole('navigation', { name: /^Sections/ }));
      expect(nav.getByRole('link', { name: "Who you've lost" })).toHaveAttribute('aria-current', 'page');
    });

    it('a plain click or Enter on a link chooses it in the app, without following the href', async () => {
      const user = userEvent.setup();
      const { onSelect } = setup({ hrefFor });
      const link = screen.getByRole('link', { name: /^Obituary/ });
      const followed = vi.fn((event: Event) => event.defaultPrevented);
      document.addEventListener('click', followed);
      await user.click(link);
      expect(onSelect).toHaveBeenLastCalledWith('obituary');
      expect(followed).toHaveLastReturnedWith(true);
      link.focus();
      await user.keyboard('{Enter}');
      expect(onSelect).toHaveBeenCalledTimes(2);
      document.removeEventListener('click', followed);
    });

    it('a click with a key held is left to the browser (a new tab), and does not move in the app', () => {
      const { onSelect } = setup({ hrefFor });
      const link = screen.getByRole('link', { name: /^Obituary/ });
      // Read whether the app stopped the link, then stop it here so jsdom does not try to load the page.
      let preventedByApp: boolean | null = null;
      const stop = (event: Event) => {
        preventedByApp = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener('click', stop);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
      document.removeEventListener('click', stop);
      expect(onSelect).not.toHaveBeenCalled();
      expect(preventedByApp).toBe(false);
    });
  });
});
