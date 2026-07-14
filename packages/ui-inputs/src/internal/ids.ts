/**
 * Derive the id of a field's error element from the control's id, so a control and
 * its `<FsError>` can wire `aria-describedby` ↔ `id` without a shared error service.
 */
export const fieldErrorId = (controlId: string): string => `${controlId}-error`;
