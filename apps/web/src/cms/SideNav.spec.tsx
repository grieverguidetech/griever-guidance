import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
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
  it('lists the 7 items in order inside the Sections nav', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const names = within(nav).getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Overview', 'The person', 'Announcement', 'Service', 'Obituary', 'Thank-yous', 'Your account']);
  });

  it('marks only the current item with aria-current=page', () => {
    setup({ section: 'obituary' });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const current = within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current.map((b) => b.textContent)).toEqual(['Obituary']);
  });

  it('shows the person name', () => {
    setup();
    expect(screen.getByText('Margaret Hale')).toBeInTheDocument();
  });

  it('shows "Not named yet" for a blank name', () => {
    setup({ personName: '  ' });
    expect(screen.getByText('Not named yet')).toBeInTheDocument();
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
    const menu = screen.getByRole('button', { name: 'Sections' });
    expect(within(screen.getByRole('navigation')).queryByRole('button', { name: 'Sections' })).toBeNull();
    expect(menu).toHaveClass('md:hidden');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(menu.getAttribute('aria-controls') ?? '')).toHaveClass('hidden', 'md:flex');
  });

  it('opens and closes with the menu button', async () => {
    setup();
    const menu = screen.getByRole('button', { name: 'Sections' });
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('choosing an item calls onSelect and closes the menu', async () => {
    const { onSelect } = setup();
    const menu = screen.getByRole('button', { name: 'Sections' });
    await userEvent.click(menu);
    await userEvent.click(screen.getByRole('button', { name: 'Announcement' }));
    expect(onSelect).toHaveBeenCalledWith<[CmsNavKey]>('announcement');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('Escape closes the menu and returns focus to the menu button', async () => {
    setup();
    const menu = screen.getByRole('button', { name: 'Sections' });
    await userEvent.click(menu);
    screen.getByRole('button', { name: 'Overview' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('shows statuses when given, with a missing open key as Not started and later sections as Later', () => {
    setup({ statuses: { person: 'ready', service: 'in_progress' } });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByText('Ready')).toBeInTheDocument();
    expect(within(nav).getByText('In progress')).toBeInTheDocument();
    expect(within(nav).queryAllByText('Not started')).toHaveLength(0);
    expect(within(nav).getAllByText('Later')).toHaveLength(3);
    expect(within(nav).getAllByText('Later')[0]).toHaveClass('text-[color:var(--text-muted)]');
    expect(within(nav).getAllByText('Later')[0]).toHaveClass('text-[14px]');
  });

  it('gives an item its label and status as one name, with a space between', () => {
    setup({ statuses: { service: 'in_progress' } });
    expect(screen.getByRole('button', { name: 'Service In progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Obituary Later' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
  });

  it('styles the current item beyond aria-current', () => {
    setup({ section: 'service' });
    expect(screen.getByRole('button', { name: 'Service' })).toHaveClass('font-semibold', 'bg-accent-100', 'border-l-4');
    expect(screen.getByRole('button', { name: 'Obituary' })).not.toHaveClass('font-semibold');
  });

  it('with accountOnly offers just "Your account": no sections, no name, no Change, no menu button', async () => {
    const { onSelect } = setup({ accountOnly: true });
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Your account']);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('Margaret Hale')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Your account' }));
    expect(onSelect).toHaveBeenCalledWith('account');
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'SideNav.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });
});
