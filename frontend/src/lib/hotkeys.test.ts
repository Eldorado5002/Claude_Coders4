import { describe, expect, it } from 'vitest'
import { enterBelongsToTarget, insideDialogOrForm } from './hotkeys'

const key = (target: Element) => ({ target }) as unknown as KeyboardEvent

describe('shortcut guards', () => {
  it('lets Enter activate a focused button or link instead of a page shortcut', () => {
    const btn = document.createElement('button')
    const link = document.createElement('a')
    link.href = '#x'
    expect(enterBelongsToTarget(key(btn))).toBe(true)
    expect(enterBelongsToTarget(key(link))).toBe(true)
    expect(enterBelongsToTarget(key(document.body))).toBe(false)
  })

  it('ignores page shortcuts while a dialog or form has focus', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'alertdialog')
    const inner = document.createElement('span')
    dialog.appendChild(inner)
    const form = document.createElement('form')
    const btn = document.createElement('button')
    form.appendChild(btn)
    expect(insideDialogOrForm(key(inner))).toBe(true)
    expect(insideDialogOrForm(key(btn))).toBe(true)
    expect(insideDialogOrForm(key(document.body))).toBe(false)
  })
})
