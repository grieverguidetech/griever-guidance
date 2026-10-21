import { describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';
import { App } from './App';

describe('App with the account feature off', () => {
  it('opens on Home with no account entry', async () => {
    render(<App />);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
    expect(screen.getByText("Start with someone I've lost")).toBeTruthy();
    expect(screen.queryByText("What you'll need")).toBeNull();
    expect(screen.queryByText('Your account')).toBeNull();
  });

  it('removes the stale single service date key left by older versions', async () => {
    await AsyncStorage.setItem('gg.serviceDate.v1', 'May 29, 2020');
    render(<App />);
    await screen.findByText("Who you're writing about");
    expect(await AsyncStorage.getItem('gg.serviceDate.v1')).toBeNull();
  });
});
