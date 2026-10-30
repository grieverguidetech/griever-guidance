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

describe('CmsShell people view', () => {
  it('has one h1, no section buttons, and "Your account" calls onAccount after focusing the h1', async () => {
    const onAccount = vi.fn();
    render(
      <CmsShell title="Your people" peopleView personName="" section="overview" onSelect={vi.fn()} onChangePerson={vi.fn()} onAccount={onAccount}>
        <p>List</p>
      </CmsShell>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Your account']);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Your account' }));
    expect(onAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });
});

describe('CmsShell save line', () => {
  const line = 'Saved in this browser as you type. Nothing is sent from here.';

  it('shows the static line in editor views, not as a live region, with one h1', () => {
    setup('service');
    const el = screen.getByText(line);
    expect(el.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('is absent on the overview, which has its own saved-as-you-go line', () => {
    setup('overview');
    expect(screen.queryByText(line)).toBeNull();
  });

  it('is absent in the people view', () => {
    render(
      <CmsShell title="Your people" peopleView personName="" section="overview" onSelect={vi.fn()} onChangePerson={vi.fn()} onAccount={vi.fn()}>
        <p>List</p>
      </CmsShell>,
    );
    expect(screen.queryByText(line)).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

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
    setup('person');
    expect(screen.getByRole('button', { name: 'The person' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Service' })).not.toHaveAttribute('aria-current');
  });

  it('routes section items to onSelect and the account item to onAccount', async () => {
    const { onSelect, onAccount } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'The person' }));
    expect(onSelect).toHaveBeenCalledWith('person');
    await userEvent.click(screen.getByRole('button', { name: 'Your account' }));
    expect(onAccount).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the h1 after a menu choice on a phone', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Sections · Service' }));
    await userEvent.click(screen.getByRole('button', { name: 'The person' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('moves focus off the nav when Change is pressed', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Sections · Service' }));
    await userEvent.click(screen.getByRole('button', { name: "Change who you're writing about" }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
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
