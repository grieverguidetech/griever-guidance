import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '@griever/tokens';
import { Sheet } from './Sheet';
import type { SheetProps } from './sheetProps';
import { Body } from './Text';

/** The words the sheet needs: libs/copy/screens/paywall.json. */
export interface PaywallCopy {
  heading: string;
  line: string;
  close: string;
}

export type PaywallSheetProps = Pick<SheetProps, 'visible' | 'onClose' | 'onDismiss' | 'returnFocusRef'> & {
  copy: PaywallCopy;
};

/**
 * Demo stand-in for the payment step (#292), shared by web and mobile. No payment code runs and no
 * request is made; the Stripe step (#200) replaces the white box. Web hosts pass `returnFocusRef`
 * (the locked row); native hosts send screen-reader focus back in `onDismiss` and on close.
 */
export function PaywallSheet({ copy, visible, onClose, onDismiss, returnFocusRef }: PaywallSheetProps) {
  return (
    <Sheet
      title={copy.heading}
      closeLabel={copy.close}
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      returnFocusRef={returnFocusRef}
    >
      <View style={styles.box}>
        <Body>{copy.line}</Body>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderRadius: 12, padding: spacing[3] },
});
