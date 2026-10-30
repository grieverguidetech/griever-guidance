import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { CmsShell } from './CmsShell';
import type { CmsNavKey } from './SideNav';

function setup(section: CmsNavKey = 'service') {
  const onSelect = vi.fn();
  const onAccount = vi.fn();
  const onChangePerson = vi.fn();
  render(
    <CmsShell personName="Margaret Hale" section={section} onSelect={onSelect} onChangePerson={onChangePerson} onAccount={onAccount} notice={<p>Saved</p>}>
      <h2>Details</h2>
    </CmsShell>,
  );
  return { onSelect, onAccount, onChangePerson };
}

describe('CmsShell', () => {
  it.each<[CmsNavKey, string]>([
    ['overview', 'Overview'],
    ['person', 'The person'],
    ['service', 'Service'],
    ['account', 'Your account'],
  ])('renders one h1 matching the section %s', (section, title) => {
    setup(section);
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(title);
  });

  it('renders the notice and children, children without an h1', () => {
    setup();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeInTheDocument();
  });

  it('aria-current follows the section', () => {
    setup('thanks');
    expect(screen.getByRole('button', { name: 'Thank-yous' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Service' })).not.toHaveAttribute('aria-current');
  });

  it('routes section items to onSelect and the account item to onAccount', async () => {
    const { onSelect, onAccount } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Obituary' }));
    expect(onSelect).toHaveBeenCalledWith('obituary');
    await userEvent.click(screen.getByRole('button', { name: 'Your account' }));
    expect(onAccount).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('Change calls onChangePerson', async () => {
    const { onChangePerson } = setup();
    await userEvent.click(screen.getByRole('button', { name: "Change who you're writing about" }));
    expect(onChangePerson).toHaveBeenCalledTimes(1);
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'CmsShell.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });
});
