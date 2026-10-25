import { render, screen } from '@testing-library/react-native';
import { shareService } from '@griever/shared';
import { DetailsFormScreen } from './DetailsFormScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

describe('details message preview', () => {
  it('renders the composed preview without announcing each field change', () => {
    const flow = {
      selectedTemplate: shareService,
      fields: {},
      composedFields: { deceasedName: 'Margaret Hayes' },
      setField: jest.fn(),
      nextStep: jest.fn(),
      prevStep: jest.fn(),
    } as never;

    render(<DetailsFormScreen flow={flow} />);

    expect(screen.getByText("We'll send")).toBeTruthy();
    expect(screen.getByText("Margaret Hayes' service will be held [the service date] at [the time], [the location].")).toBeTruthy();
    expect(screen.getByText(/Margaret Hayes' service/).props.accessibilityLiveRegion).toBe('off');
  });
});
