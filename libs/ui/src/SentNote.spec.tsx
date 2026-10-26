import { render, screen } from '@testing-library/react';
import { SentNote } from './SentNote';

const LEAD = 'Everyone has been told.';
const REST = "We don't keep a copy of what was sent.";

describe('SentNote', () => {
  it('shows the lead and the rest as separate pieces of text', () => {
    render(<SentNote lead={LEAD} rest={REST} />);
    expect(screen.getByText(LEAD)).toBeInTheDocument();
    expect(screen.getByText(REST)).toBeInTheDocument();
  });

  it('sets the lead in bold italic and the rest in plain italic', () => {
    render(<SentNote lead={LEAD} rest={REST} />);
    const lead = getComputedStyle(screen.getByText(LEAD));
    const rest = getComputedStyle(screen.getByText(REST));
    expect(lead.fontStyle).toBe('italic');
    expect(lead.fontWeight).toBe('600');
    expect(rest.fontStyle).toBe('italic');
    expect(rest.fontWeight).not.toBe('600');
  });

  it('has no border and no card background', () => {
    const { container } = render(<SentNote lead={LEAD} rest={REST} />);
    for (const el of [container.firstElementChild, screen.getByText(LEAD), screen.getByText(REST)]) {
      const style = getComputedStyle(el as Element);
      expect(['', '0px']).toContain(style.borderTopWidth);
      expect(['', 'rgba(0, 0, 0, 0)', 'transparent']).toContain(style.backgroundColor);
    }
  });

  it('shows the lead alone when there is no rest', () => {
    render(<SentNote lead="No one was texted this time." />);
    expect(screen.getByText('No one was texted this time.')).toBeInTheDocument();
  });
});
