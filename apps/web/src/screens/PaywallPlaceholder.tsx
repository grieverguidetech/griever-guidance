import type { RefObject } from 'react';
import { Sheet } from '../lib/WhatYoullNeedSheet';

export const PAYWALL_HEADING = 'The full plan';
export const PAYWALL_LINE = 'Payment details will go here.';
export const LOCKED_REASON = 'Included with the full plan';

/**
 * Demo stand-in for the payment step (#292). No payment code runs and no request is made;
 * the Stripe step (#200) replaces the white box. Render it only while open.
 */
export function PaywallPlaceholder({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  return (
    <Sheet title={PAYWALL_HEADING} onClose={onClose} returnFocusRef={returnFocusRef}>
      <div className="p-4 text-[15px]" style={{ background: '#ffffff', borderRadius: 12 }}>
        <p className="m-0">{PAYWALL_LINE}</p>
      </div>
    </Sheet>
  );
}
