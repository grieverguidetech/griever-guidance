import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import { v2 } from '@griever/tokens';

const { glows } = v2.roles.page;

/**
 * Two soft glows on the page: warm at the top right, cool at the bottom left. Decoration only: it
 * sits behind the content, takes no touches, is hidden from screen readers, and never moves.
 */
export function PageGlow() {
  return (
    <View
      testID="page-glow"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glowTopRight" cx="100%" cy="0%" rx="80%" ry="60%" fx="100%" fy="0%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={glows.topRight} stopOpacity={1} />
            <Stop offset="1" stopColor={glows.topRight} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowBottomLeft" cx="0%" cy="100%" rx="80%" ry="60%" fx="0%" fy="100%" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={glows.bottomLeft} stopOpacity={1} />
            <Stop offset="1" stopColor={glows.bottomLeft} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowTopRight)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowBottomLeft)" />
      </Svg>
    </View>
  );
}
