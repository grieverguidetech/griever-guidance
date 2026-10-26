import { ICON_DEFAULT_SIZE, ICON_PATHS } from './iconPaths';
import type { IconProps } from './iconPaths';

export type { IconName, IconProps } from './iconPaths';

/** Web twin of Icon.tsx: a plain inline svg, so the web bundle does not need react-native-svg. */
export function Icon({ name, size = ICON_DEFAULT_SIZE, color, trailing = false, testID }: IconProps) {
  const paths = ICON_PATHS[name];
  return (
    <svg
      aria-hidden="true"
      data-testid={testID}
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={
        trailing
          ? { position: 'absolute', right: 0, top: '50%', marginTop: -size / 2, pointerEvents: 'none' }
          : { pointerEvents: 'none' }
      }
    >
      <path d={paths.body} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <path d={paths.shackle} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
