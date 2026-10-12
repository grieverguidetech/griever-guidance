import { describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';
import { App } from './App';

describe('App with the account feature off', () => {
  it('opens on the template picker with no account entry', async () => {
    render(<App />);
    expect(await screen.findByText('Grievers Guidance')).toBeTruthy();
    expect(screen.getByText('Choose the type of message you would like to send.')).toBeTruthy();
    expect(screen.queryByText('Your account')).toBeNull();
  });

  it('removes the stale single service date key left by older versions', async () => {
    await AsyncStorage.setItem('gg.serviceDate.v1', 'May 29, 2020');
    render(<App />);
    await screen.findByText('Grievers Guidance');
    expect(await AsyncStorage.getItem('gg.serviceDate.v1')).toBeNull();
  });
});
