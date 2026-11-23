import { StyleSheet, View } from 'react-native';
import { v2 } from '@griever/tokens';
import { ConicSwirl } from './Swirl';

const mark = v2.recipes.doneMark;
const SWIRL_STOPS = [...mark.swirl];

/** Props that hide a decoration from screen readers. */
const HIDDEN = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export interface DoneMarkProps {
  checked: boolean;
}

/**
 * The tick on a checklist row. Done is a small colour swirl (it turns once, then rests, and stays
 * still with Reduce Motion). Open is a plain ring. It is decoration only: the row it sits in says
 * whether it is checked, so this is hidden from screen readers and ignores touches.
 */
export function DoneMark({ checked }: DoneMarkProps) {
  return (
    <View
      {...HIDDEN}
      pointerEvents="none"
      testID="done-mark"
      style={styles.box}
    >
      {checked ? (
        <ConicSwirl
          stops={SWIRL_STOPS}
          size={mark.size}
          spinMs={mark.spinMs}
          testID="done-mark-swirl"
        />
      ) : (
        <View testID="done-mark-ring" style={styles.ring} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: mark.size, height: mark.size },
  ring: {
    width: mark.size,
    height: mark.size,
    borderRadius: mark.size / 2,
    borderWidth: mark.openWidth,
    borderColor: mark.openRing,
  },
});
