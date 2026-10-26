import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ICON_DEFAULT_SIZE, ICON_PATHS } from './iconPaths';
import type { IconProps } from './iconPaths';

export type { IconName, IconProps } from './iconPaths';

/**
 * A small decorative icon, drawn with react-native-svg. It is hidden from screen readers: the
 * words next to it carry the meaning. Icon.web.tsx draws the same paths as a plain svg.
 */
export function Icon({ name, size = ICON_DEFAULT_SIZE, color, trailing = false }: IconProps) {
  const paths = ICON_PATHS[name];
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={trailing ? [styles.trailing, { marginTop: -size / 2 }] : undefined}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={paths.body} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <Path d={paths.shackle} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  trailing: { position: 'absolute', right: 0, top: '50%' },
});
