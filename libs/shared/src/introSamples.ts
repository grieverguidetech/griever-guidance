import { announcePassing, shareService, thankYouNote } from './templates.js';
import type { Template } from './types.js';

/** Placeholder shown in place of a real name in the intro samples. */
export const SAMPLE_PERSON_NAME = '[Name]';
const SAMPLE_SENDER_NAME = '[Your name]';

export interface IntroSample {
  title: string;
  text: string;
}

function sample(
  title: string,
  template: Template,
  fields: Record<string, string>,
): IntroSample {
  return { title, text: template.renderMessage(fields) };
}

/**
 * Three samples rendered from the real templates, so they cannot drift from
 * what the app writes. No obituary link, no florist, no real contact data (C10).
 */
export function getIntroSamples(): IntroSample[] {
  return [
    sample('Letting people know', announcePassing, {
      deceasedName: SAMPLE_PERSON_NAME,
      senderName: SAMPLE_SENDER_NAME,
      serviceDetailsKnown: 'no',
    }),
    sample('Sharing the service', shareService, {
      deceasedName: SAMPLE_PERSON_NAME,
      serviceDate: '[day and date]',
      serviceTime: '[time]',
      serviceLocation: '[place]',
    }),
    sample('Thanking people', thankYouNote, {
      senderName: SAMPLE_SENDER_NAME,
      deceasedName: SAMPLE_PERSON_NAME,
    }),
  ];
}
