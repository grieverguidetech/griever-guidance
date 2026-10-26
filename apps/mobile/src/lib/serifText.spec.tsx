import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';
import { SerifReadyContext, SerifText } from '@griever/ui';

function styleOf(style: TextStyle, ready = true) {
  render(
    <SerifReadyContext.Provider value={ready}>
      <SerifText style={style}>Words</SerifText>
    </SerifReadyContext.Provider>,
  );
  return StyleSheet.flatten(screen.getByText('Words').props.style) as TextStyle;
}

describe('SerifText on native', () => {
  it.each([['bold'], ['600'], ['500'], ['700']] as const)('fontWeight %s uses the semibold face and clears the weight', (fontWeight) => {
    const s = styleOf({ fontWeight });
    expect(s.fontFamily).toBe('SourceSerif4_600SemiBold');
    expect(s.fontWeight).toBeUndefined();
  });

  it.each([[undefined], ['400'], ['normal']] as const)('fontWeight %s uses the regular face', (fontWeight) => {
    const s = styleOf({ fontWeight });
    expect(s.fontFamily).toBe('SourceSerif4_400Regular');
    expect(s.fontWeight).toBeUndefined();
  });

  it('italic uses the italic faces and clears fontStyle', () => {
    const regular = styleOf({ fontStyle: 'italic' });
    expect(regular.fontFamily).toBe('SourceSerif4_400Regular_Italic');
    expect(regular.fontStyle).toBeUndefined();
  });

  it('bold italic uses the semibold italic face', () => {
    expect(styleOf({ fontStyle: 'italic', fontWeight: '600' }).fontFamily).toBe('SourceSerif4_600SemiBold_Italic');
  });

  it('keeps the caller weight and adds no family until the serif is ready', () => {
    const s = styleOf({ fontWeight: 'bold' }, false);
    expect(s.fontFamily).toBeUndefined();
    expect(s.fontWeight).toBe('bold');
  });

  it('leaves a caller-chosen family, weight and style alone', () => {
    const s = styleOf({ fontFamily: 'Courier', fontWeight: 'bold', fontStyle: 'italic' });
    expect(s).toEqual(expect.objectContaining({ fontFamily: 'Courier', fontWeight: 'bold', fontStyle: 'italic' }));
  });
});
