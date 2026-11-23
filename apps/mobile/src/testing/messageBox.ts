import { fireEvent, screen, waitFor } from '@testing-library/react-native';

type ReactTestInstance = ReturnType<typeof screen.getByLabelText>;

/**
 * Test helpers for the message box on the send screens (#968). The box reads as text until Edit is
 * tapped, so a test cannot assume a field. These read the words in either mode, and type by tapping Edit first.
 */
const LABEL = 'Your message';

type Match = string | RegExp;

/** The words a box holds: the field's value when editing, the text's accessibility value when reading. */
export const shownOf = (box: ReactTestInstance): string => (box.props.value ?? box.props.accessibilityValue?.text ?? '') as string;

/** The words in the "Your message" box right now. */
export const messageNow = (): string => shownOf(screen.getByLabelText(LABEL));

const matches = (shown: string, expected: Match) => (typeof expected === 'string' ? shown === expected : expected.test(shown));

/** Throws unless the message box holds the words (a string must match exactly, like getByDisplayValue). */
export const getMessage = (expected: Match): ReactTestInstance => {
  const box = screen.getByLabelText(LABEL);
  if (!matches(shownOf(box), expected)) {
    throw new Error(`The message box holds ${JSON.stringify(shownOf(box))}, not ${String(expected)}`);
  }
  return box;
};

/** The box when it holds the words, else null. */
export const queryMessage = (expected: Match): ReactTestInstance | null => {
  const box = screen.queryByLabelText(LABEL);
  return box && matches(shownOf(box), expected) ? box : null;
};

/** Waits until the message box holds the words. The same extra arguments as findBy*. */
export const findMessage = (expected: Match, _options?: unknown, waitOptions?: { timeout?: number }) => waitFor(() => getMessage(expected), waitOptions);

/** Types into the message box, tapping Edit first when it is still reading. */
export const typeMessage = (text: string, label: string = LABEL, editName = 'Edit message') => {
  const edit = screen.queryByRole('button', { name: editName });
  if (edit) {
    fireEvent.press(edit);
  }
  fireEvent.changeText(screen.getByLabelText(label), text);
};
