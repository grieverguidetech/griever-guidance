import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Field } from './authForm';

describe('Field', () => {
  it('keeps the focus ring and still calls the handlers a caller passes', () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    render(<Field label="Email" value="" onChangeText={() => undefined} onFocus={onFocus} onBlur={onBlur} />);
    const input = screen.getByLabelText('Email');
    fireEvent(input, 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByLabelText('Email').props.style)).toMatchObject({ borderColor: '#006786', borderWidth: 2 });
    fireEvent(input, 'blur');
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByLabelText('Email').props.style)).toMatchObject({ borderWidth: 1 });
  });
});
