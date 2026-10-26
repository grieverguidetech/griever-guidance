import type { ReactNode } from 'react';

/** The part of a DOM element the sheet needs, so a RefObject<HTMLElement | null> fits without a DOM lib here. */
export type FocusTargetRef = { current: { focus(): void; isConnected: boolean } | null };

export interface SheetProps {
  title: string;
  /** The Close button's words, from libs/copy. */
  closeLabel: string;
  /** Default true. On web the sheet is simply not drawn while false. */
  visible?: boolean;
  onClose: () => void;
  /** Native: Android Back. Defaults to onClose; a sheet with an open tip can close the tip first. */
  onRequestClose?: () => void;
  /** Native, iOS only: runs after the sheet has closed, so the caller can send screen-reader focus back. */
  onDismiss?: () => void;
  /** Native: a touch inside the body, for example to close an open tip. */
  onBodyTouch?: () => void;
  /** Web: the element that opened the sheet. Safari does not focus a button on click, so pass it. */
  returnFocusRef?: FocusTargetRef;
  /** Web: where focus lands when the opener is gone (the screen changed while the sheet was open). Default: the page's h1. */
  fallbackFocusRef?: FocusTargetRef;
  /** Web: id of the page root made inert while the sheet is open. Default "root", the id in apps/web/index.html. */
  inertRootId?: string;
  children: ReactNode;
}
