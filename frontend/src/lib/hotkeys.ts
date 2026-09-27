/**
 * Guards for single-key page shortcuts (react-hotkeys-hook `ignoreEventWhen`).
 * The library already skips text fields; these also keep shortcuts away from
 * elements that own the key themselves, and from open dialogs and forms.
 */
const target = (e: KeyboardEvent) => (e.target instanceof Element ? e.target : null)

/** Letter shortcuts (J, K, O, H, E, 1–4…) shouldn't fire behind a dialog or inside a form. */
export function insideDialogOrForm(e: KeyboardEvent): boolean {
  return !!target(e)?.closest('form,[role=dialog],[role=alertdialog],[role=menu],[role=listbox]')
}

/** Enter belongs to a focused button or link (activation), not to a page shortcut. */
export function enterBelongsToTarget(e: KeyboardEvent): boolean {
  return (
    insideDialogOrForm(e) ||
    !!target(e)?.closest('a[href],button,summary,[role=button],[role=link],[role=radio],[role=tab],[role=option],[role=menuitem],[role=checkbox],[role=switch]')
  )
}
