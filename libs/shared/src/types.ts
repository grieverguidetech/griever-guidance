export type SendStatus = 'pending' | 'sent' | 'failed';

export type TemplateCategory = 'announcement' | 'service' | 'aftercare';

export type MessageTone = 'plain' | 'softer';

export type ContactGroup = 'family' | 'friends';

/** A place chosen from the (mocked) address typeahead in the details form. */
export interface Place {
  placeId: string;
  name: string;
  formattedAddress: string;
}

/** A florist surfaced near the service venue in the review step. */
export interface Florist {
  id: string;
  name: string;
  distanceLabel: string;
  deliveryHint: string;
}

/** Per-recipient delivery state shown on the sending-progress screen. */
export type RecipientDeliveryStatus = 'queued' | 'sending' | 'delivered' | 'failed';

/**
 * The person a session is about, captured once at session setup and carried
 * into every message. Message composition reads these from the session, never
 * from a per-flow form.
 */
export interface SessionDetails {
  personName: string;
  dateOfPassing: string;
  senderName: string;
  obituaryUrl: string;
}

export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  fields: TemplateField[];
  renderMessage(fields: Record<string, string>): string;
}

export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  selected: boolean;
  /** Circle the contact belongs to; undefined contacts fall into "Everyone else". */
  group?: ContactGroup;
}

export interface User {
  id: string;
  email: string;
  phoneNumber: string;
}

export interface SendEvent {
  id: string;
  userId: string;
  recipientCount: number;
  templateId: string;
  status: SendStatus;
  createdAt: string;
  deceasedName: string;
  serviceDate: string;
  serviceLocation: string;
  wakeTime?: string;
}

export interface ObituaryRequest {
  fullName: string;
  dateOfBirth: string;
  dateOfPassing: string;
  cityOfResidence?: string;
  survivors?: string;
  career?: string;
  personalNote?: string;
}

export interface ObituaryResponse {
  draft: string;
}
