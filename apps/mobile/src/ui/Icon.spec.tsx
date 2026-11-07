import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Circle, Path } from 'react-native-svg';
import { Icon } from './Icon';
import { ICON_PATHS } from './iconPaths';
import type { IconName } from './iconPaths';

const NAMES: IconName[] = ['lock', 'check', 'progress', 'circle'];

describe('Icon (mobile)', () => {
  it('draws the lock from its original paths at stroke 1.8 in a 24 viewBox', () => {
    render(<Icon name="lock" color="#605d5d" testID="icon" />);
    const paths = screen.UNSAFE_getAllByType(Path);
    expect(paths.map((p) => p.props.d)).toEqual([
      'M6 11h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 6 11z',
      'M8 11V7.5a4 4 0 0 1 8 0V11',
    ]);
    expect(paths.every((p) => p.props.strokeWidth === 1.8 && p.props.stroke === '#605d5d')).toBe(true);
    expect(ICON_PATHS.lock.viewBox).toBe('0 0 24 24');
  });

  it('draws the check as a round-capped stroke of 2 in the given colour', () => {
    render(<Icon name="check" color="#2a7048" />);
    const [path] = screen.UNSAFE_getAllByType(Path);
    expect(path.props).toMatchObject({
      d: 'M3 8.5l3.2 3.2L13 4.8',
      stroke: '#2a7048',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    });
    expect(ICON_PATHS.check.viewBox).toBe('0 0 16 16');
  });

  it('draws the not-started circle as an outline, r 5.5 at 8,8, stroke 1.5, with no fill shape', () => {
    render(<Icon name="circle" color="#8a8686" />);
    const [circle] = screen.UNSAFE_getAllByType(Circle);
    expect(circle.props).toMatchObject({ cx: 8, cy: 8, r: 5.5, stroke: '#8a8686', strokeWidth: 1.5 });
    expect(screen.UNSAFE_queryAllByType(Path)).toHaveLength(0);
  });

  it('draws in-progress as the same circle plus a filled left half', () => {
    render(<Icon name="progress" color="#605d5d" />);
    const [circle] = screen.UNSAFE_getAllByType(Circle);
    expect(circle.props).toMatchObject({ r: 5.5, strokeWidth: 1.5 });
    const [half] = screen.UNSAFE_getAllByType(Path);
    expect(half.props.fill).toBe('#605d5d');
    expect(half.props.stroke).toBeUndefined();
    expect(half.props.d).toBe('M8 2.5A5.5 5.5 0 0 0 8 13.5z');
  });

  it('scales with the size prop', () => {
    render(<Icon name="check" color="#2a7048" size={32} testID="icon" />);
    const svg = screen.getByTestId('icon', { includeHiddenElements: true }).findByProps({ viewBox: '0 0 16 16' });
    expect(svg.props.width).toBe(32);
    expect(svg.props.height).toBe(32);
  });

  it.each(NAMES)('keeps %s hidden from assistive tech', (name) => {
    render(<Icon name={name} color="#605d5d" testID="icon" />);
    const node = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(node.props.accessible).toBe(false);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
