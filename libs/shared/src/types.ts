export type SendStatus = 'pending' | 'sent' | 'failed';

export type TemplateCategory = 'announcement' | 'service' | 'aftercare' | 'obituary';

export type MessageTone = 'plain' | 'softer';

export type ContactGroup = 'family' | 'friends';

export type AuthProvider = 'google' | 'facebook' | 'x' | 'password';

export type ContactSource = 'import' | 'manual';

/** The only user-assigned grouping — who hears first vs. everyone else (D5). */
export type ContactTier = 'first' | 'family';

/** The four fixed moments in the real-world funeral-planning order (C1). */
export type MomentKey = 'announce' | 'service' | 'obituary' | 'thanks';

export type MomentStatus = 'done' | 'next' | 'later';

export interface Moment {
  key: MomentKey;
  status: MomentStatus;
  completedAt?: string;
  recipientCount?: number;
}

/**
 * The signed-in griever's account. Sign-in is mocked (see D1/D2) — no real
 * OAuth or password storage, matching the rest of this app's mocked backends.
 */
export interface Account {
  authProvider: AuthProvider;
  /** Derived from `authProvider`: social sign-in imports contacts, email means manual entry. */
  contactSource: ContactSource;
  email: string;
  /** Never gates use of the app — confirmation is asynchronous and optional. */
  emailVerified: boolean;
  senderName: string;
}

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
  /** Optional — e.g. "The Waltham Register" (C4). */
  obituaryPublisher?: string;
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
  /** The only user-assigned grouping (D3/D5); undefined behaves as 'family'. */
  tier?: ContactTier;
  source?: ContactSource;
  /**
   * Imported provider metadata (e.g. ['Extended family'], ['Her church']) —
   * never a taxonomy the user builds. Used to render richer sections in
   * B3/C5 when available; falls back to `tier` grouping otherwise.
   */
  providerLabels?: string[];
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
