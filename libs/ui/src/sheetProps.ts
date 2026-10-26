import type { ReactNode } from 'react';

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
  returnFocusRef?: { current: unknown };
  children: ReactNode;
}
