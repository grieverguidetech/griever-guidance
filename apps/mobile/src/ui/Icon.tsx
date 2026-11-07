import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ICON_DEFAULT_SIZE, ICON_PATHS } from './iconPaths';
import type { IconProps, IconShape } from './iconPaths';

export type { IconName, IconProps } from './iconPaths';

function drawShape(shape: IconShape, color: string, strokeWidth: number, key: number) {
  if (shape.kind === 'circle') {
    return <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} stroke={color} strokeWidth={strokeWidth} />;
  }
  return (
    <Path
      key={key}
      d={shape.d}
      stroke={shape.fill ? undefined : color}
      fill={shape.fill ? color : undefined}
      strokeWidth={strokeWidth}
      strokeLinecap={shape.linecap}
      strokeLinejoin={shape.linejoin}
    />
  );
}

/**
 * A small decorative icon, drawn with react-native-svg. It is hidden from screen readers: the
 * words next to it carry the meaning.
 */
export function Icon({ name, size = ICON_DEFAULT_SIZE, color, trailing = false, testID }: IconProps) {
  const spec = ICON_PATHS[name];
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={trailing ? [styles.none, styles.trailing, { marginTop: -size / 2 }] : styles.none}
    >
      <Svg width={size} height={size} viewBox={spec.viewBox} fill="none">
        {spec.shapes.map((shape, i) => drawShape(shape, color, spec.strokeWidth, i))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  none: { pointerEvents: 'none' },
  trailing: { position: 'absolute', right: 0, top: '50%' },
});
