import { StyleSheet, Text } from 'react-native';
import { Sheet } from '../components/WhatYoullNeedSheet';

export const PAYWALL_HEADING = 'The full plan';
export const PAYWALL_LINE = 'Payment details will go here.';
export const LOCKED_REASON = 'Included with the full plan';

/**
 * Demo stand-in for the payment step (#292). A white panel; no payment code runs and no request is
 * made. The Close button and Android's Back both shut it. The Stripe step (#200) replaces the line.
 */
export function PaywallPlaceholder({ visible, onClose, onDismiss }: { visible: boolean; onClose: () => void; onDismiss?: () => void }) {
  return (
    <Sheet title={PAYWALL_HEADING} visible={visible} onClose={onClose} onDismiss={onDismiss}>
      <Text style={styles.line}>{PAYWALL_LINE}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: 16, color: '#111827' },
});
