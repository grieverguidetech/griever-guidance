import type { Template, TemplateCategory } from './types.js';

export const funeralAndWake: Template = {
  id: 'funeral-and-wake',
  name: 'Funeral & wake details',
  description: 'Share the time and location of the service and wake.',
  category: 'service',
  fields: [
    {
      key: 'deceasedName',
      label: 'Full name',
      placeholder: 'e.g. Margaret Ellen Hayes',
      required: true,
    },
    {
      key: 'serviceDate',
      label: 'Service date and time',
      placeholder: 'e.g. Tuesday, June 10 at 11:00 AM',
      required: true,
    },
    {
      key: 'serviceLocation',
      label: 'Service location',
      placeholder: 'e.g. St. Mary\'s Church, 42 Oak St, Boston',
      required: true,
    },
    {
      key: 'wakeTime',
      label: 'Wake time (optional)',
      placeholder: 'e.g. Monday evening from 6–8 PM at Sullivan\'s Funeral Home',
      required: false,
    },
  ],
  renderMessage(fields) {
    const wake = fields['wakeTime']
      ? `\n\nWake: ${fields['wakeTime']}`
      : '';
    return (
      `We wanted to let you know that ${fields['deceasedName']} has passed away. ` +
      `The funeral service will be held on ${fields['serviceDate']} at ${fields['serviceLocation']}.` +
      wake +
      `\n\nThank you for your kindness and support during this time.`
    );
  },
};

export const passingAnnouncement: Template = {
  id: 'passing-announcement',
  name: 'Passing announcement',
  description: 'Let people know of a passing with a brief, personal message.',
  category: 'announcement',
  fields: [
    {
      key: 'deceasedName',
      label: 'Full name',
      placeholder: 'e.g. Robert James Callahan',
      required: true,
    },
    {
      key: 'dateOfPassing',
      label: 'Date of passing',
      placeholder: 'e.g. June 7, 2025',
      required: true,
    },
    {
      key: 'briefMessage',
      label: 'Brief personal message (optional)',
      placeholder: 'e.g. He was deeply loved and will be greatly missed.',
      required: false,
    },
  ],
  renderMessage(fields) {
    const message = fields['briefMessage'] ? ` ${fields['briefMessage']}` : '';
    return (
      `We are writing to share the news that ${fields['deceasedName']} passed away on ${fields['dateOfPassing']}.` +
      message +
      `\n\nMore details about services will follow. Thank you for your love and support.`
    );
  },
};

export const celebrationOfLife: Template = {
  id: 'celebration-of-life',
  name: 'Celebration of life',
  description: 'Invite people to celebrate and remember a life well lived.',
  category: 'service',
  fields: [
    {
      key: 'deceasedName',
      label: 'Full name',
      placeholder: 'e.g. Dorothy Anne Sullivan',
      required: true,
    },
    {
      key: 'eventDate',
      label: 'Event date and time',
      placeholder: 'e.g. Saturday, June 14 at 2:00 PM',
      required: true,
    },
    {
      key: 'eventLocation',
      label: 'Event location',
      placeholder: 'e.g. The Riverside Club, 88 Harbor Rd, Portland',
      required: true,
    },
  ],
  renderMessage(fields) {
    return (
      `You are warmly invited to a Celebration of Life honoring ${fields['deceasedName']}. ` +
      `We will gather on ${fields['eventDate']} at ${fields['eventLocation']} ` +
      `to share memories and celebrate the life she lived.\n\n` +
      `We hope you can join us. Your presence would mean a great deal.`
    );
  },
};

export const thankYouNote: Template = {
  id: 'thank-you-note',
  name: 'Thank-you note',
  description: 'Send a heartfelt thank you to those who offered support.',
  category: 'aftercare',
  fields: [
    {
      key: 'senderName',
      label: 'Your name or family name',
      placeholder: 'e.g. The Hayes Family',
      required: true,
    },
    {
      key: 'deceasedName',
      label: 'Full name of the deceased',
      placeholder: 'e.g. Margaret Ellen Hayes',
      required: true,
    },
    {
      key: 'personalNote',
      label: 'Personal note (optional)',
      placeholder: 'e.g. Your flowers brought us so much comfort.',
      required: false,
    },
  ],
  renderMessage(fields) {
    const note = fields['personalNote'] ? ` ${fields['personalNote']}` : '';
    return (
      `On behalf of ${fields['senderName']}, we want to sincerely thank you for your kindness and support following the passing of ${fields['deceasedName']}.` +
      note +
      `\n\nYour presence and thoughtfulness during this time has meant more than words can express.`
    );
  },
};

export const serviceReminder: Template = {
  id: 'service-reminder',
  name: 'Service reminder',
  description: 'Send a reminder about an upcoming funeral or memorial service.',
  category: 'service',
  fields: [
    {
      key: 'deceasedName',
      label: 'Full name of the deceased',
      placeholder: 'e.g. Robert James Callahan',
      required: true,
    },
    {
      key: 'serviceDate',
      label: 'Service date and time',
      placeholder: 'e.g. Tuesday, June 10 at 11:00 AM',
      required: true,
    },
    {
      key: 'serviceLocation',
      label: 'Service location',
      placeholder: 'e.g. St. Mary\'s Church, 42 Oak St, Boston',
      required: true,
    },
  ],
  renderMessage(fields) {
    return (
      `This is a reminder that the funeral service for ${fields['deceasedName']} will be held ${fields['serviceDate']} at ${fields['serviceLocation']}.` +
      `\n\nWe hope to see you there. Thank you for your continued support.`
    );
  },
};

export const obituaryLink: Template = {
  id: 'obituary-link',
  name: 'Share an obituary',
  description: 'Share a link to an obituary with a personal message.',
  category: 'aftercare',
  fields: [
    {
      key: 'deceasedName',
      label: 'Full name of the deceased',
      placeholder: 'e.g. Dorothy Anne Sullivan',
      required: true,
    },
    {
      key: 'obituaryUrl',
      label: 'Obituary link',
      placeholder: 'e.g. https://example.com/obituary',
      required: true,
    },
    {
      key: 'personalNote',
      label: 'Personal note (optional)',
      placeholder: 'e.g. She touched so many lives.',
      required: false,
    },
  ],
  renderMessage(fields) {
    const note = fields['personalNote'] ? `\n${fields['personalNote']}` : '';
    return (
      `We wanted to share the obituary for ${fields['deceasedName']}:\n\n` +
      fields['obituaryUrl'] +
      note +
      `\n\nThank you for your love and support.`
    );
  },
};

/**
 * Flow A — Share the service. Logistics in one message, with an optional
 * florist line appended (exactly one sentence) when the griever opts in.
 */
export const shareService: Template = {
  id: 'share-service',
  name: 'Share the service',
  description: 'Date, time and place, in one message.',
  category: 'service',
  // The person's name comes from the session, never asked here.
  fields: [
    {
      key: 'serviceDate',
      label: 'Service date',
      placeholder: 'e.g. June 14, 2026',
      required: true,
    },
    {
      key: 'serviceTime',
      label: 'Time',
      placeholder: 'e.g. 2:00 PM',
      required: true,
    },
    {
      key: 'serviceLocation',
      label: 'Location',
      placeholder: 'Start typing a place or address',
      required: true,
    },
    {
      key: 'serviceNotes',
      label: 'Notes',
      placeholder: 'Reception to follow at the house',
      required: false,
    },
  ],
  renderMessage(fields) {
    const name = fields['deceasedName']?.trim() || 'Our loved one';
    const date = fields['serviceDate']?.trim();
    const time = fields['serviceTime']?.trim();
    const location = fields['serviceLocation']?.trim();
    const notes = fields['serviceNotes']?.trim();

    const possessive = /s$/i.test(name) ? `${name}'` : `${name}'s`;
    let core = `${possessive} service will be held`;
    if (date) core += ` ${date}`;
    if (time) core += ` at ${time}`;
    if (location) core += `, ${location}`;
    core += '.';
    if (notes) core += ` ${notes}`;

    const florist = fields['floristName']?.trim();
    if (florist) {
      const where =
        fields['flowerDeliveryTarget'] === 'home'
          ? "the family's home"
          : 'the service';
      core += ` If you'd like to send flowers, ${florist} can deliver to ${where}.`;
    }

    const url = normalizeUrl(fields['obituaryUrl']);
    if (url) core += `\n\n${url}`;
    return core;
  },
};

/**
 * Flow B — Announce the passing. Sendable on name + date alone; never blocks
 * on service details the griever does not have yet. `tone` selects gentler
 * phrasing without changing any facts.
 */
export const announcePassing: Template = {
  id: 'announce-passing',
  name: 'Announce the passing',
  description: 'A gentle note letting people know.',
  category: 'announcement',
  // Name, date, sender and obituary link all come from the session. The only
  // thing this flow can ask for is an optional extra line.
  fields: [
    {
      key: 'personalNote',
      label: "Anything you'd like to add",
      placeholder: 'She was peaceful, and we were with her.',
      required: false,
    },
  ],
  renderMessage(fields) {
    const name = fields['deceasedName']?.trim() || 'our loved one';
    const date = fields['dateOfPassing']?.trim();
    const note = fields['personalNote']?.trim();
    const sender = fields['senderName']?.trim();
    const url = normalizeUrl(fields['obituaryUrl']);
    const softer = fields['tone'] === 'softer';
    const serviceDate = fields['serviceDate']?.trim();
    const serviceTime = fields['serviceTime']?.trim();
    const serviceLocation = fields['serviceLocation']?.trim();
    const detailsKnown =
      fields['serviceDetailsKnown'] === 'yes' &&
      Boolean(serviceDate || serviceLocation);
    const detailsFollow =
      fields['serviceDetailsKnown'] === 'no' ||
      (fields['serviceDetailsKnown'] === 'yes' && !detailsKnown);

    let body = softer
      ? `It is with love and a heavy heart that we let you know ${name} passed away`
      : `With much love, we're letting you know that ${name} passed away`;
    if (date) body += ` on ${date}`;
    body += '.';

    if (note) body += ` ${note}`;
    if (detailsKnown) {
      const parts: string[] = [];
      if (serviceDate) parts.push(serviceDate);
      if (serviceTime) parts.push(`at ${serviceTime}`);
      if (serviceLocation) parts.push(serviceLocation);
      body += ` The service will be held ${parts.join(', ')}.`;
    } else if (detailsFollow) {
      body += softer
        ? " We'll share details of the service as soon as we can."
        : ' Details of the service will follow once we have them.';
    }
    if (sender) body += ` — ${sender}`;
    if (url) body += `\n\n${url}`;
    return body;
  },
};

function normalizeUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export const categoryLabels: Record<TemplateCategory, string> = {
  announcement: 'Announcement',
  service:      'Service details',
  aftercare:    'Aftercare',
};

/** Label for the coloured tag shown against a record in send history. */
export function historyTagLabel(category: TemplateCategory): string {
  return category === 'announcement' ? 'Announcement' : 'Service details';
}

export const templates: Template[] = [
  announcePassing,
  shareService,
  thankYouNote,
  obituaryLink,
];
