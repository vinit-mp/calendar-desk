import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { newBlock, parseNote, serializeNote, type Block, type BlockType } from '../lib/noteFormat'

interface Props {
  /** Given to the first line, so a <label htmlFor> focuses the editor. */
  id?: string
  value: string
  onChange: (value: string) => void
  /** Fires when focus leaves the whole editor, not when it moves between lines. */
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

interface Focus {
  id: string
  caret: number
}

/** A small block editor: one auto-growing textarea per line, each a heading,
 *  a bullet that can be struck through, or plain text. Reads and writes the
 *  plain-text format in lib/noteFormat. */
export default function NoteEditor({ id, value, onChange, onBlur, placeholder, disabled, className }: Props): React.JSX.Element {
  const [blocks, setBlocks] = useState<Block[]>(() => parseNote(value))
  const [activeId, setActiveId] = useState<string | null>(null)
  const emitted = useRef(value)
  const refs = useRef(new Map<string, HTMLTextAreaElement>())
  const pendingFocus = useRef<Focus | null>(null)

  // A new value from outside (another day, another event): start over from it.
  useEffect(() => {
    if (value === emitted.current) return
    emitted.current = value
    setBlocks(parseNote(value))
  }, [value])

  // Put the caret where the last structural edit wants it.
  useLayoutEffect(() => {
    const f = pendingFocus.current
    if (!f) return
    pendingFocus.current = null
    const el = refs.current.get(f.id)
    if (!el) return
    el.focus()
    el.setSelectionRange(f.caret, f.caret)
  })

  const commit = (next: Block[], focus?: Focus): void => {
    if (focus) pendingFocus.current = focus
    setBlocks(next)
    const text = serializeNote(next)
    emitted.current = text
    onChange(text)
  }

  const replace = (index: number, ...items: Block[]): Block[] => [...blocks.slice(0, index), ...items, ...blocks.slice(index + 1)]

  const active = blocks.find((b) => b.id === activeId) ?? blocks[blocks.length - 1]

  const caretOf = (b: Block): number => refs.current.get(b.id)?.selectionStart ?? b.text.length

  const setType = (b: Block, type: BlockType): void => {
    const next = b.type === type ? 'text' : type
    commit(
      blocks.map((x) => (x.id === b.id ? { ...x, type: next, done: next === 'bullet' && x.done } : x)),
      { id: b.id, caret: caretOf(b) }
    )
  }

  const toggleDone = (b: Block): void => {
    if (b.type !== 'bullet') return
    commit(blocks.map((x) => (x.id === b.id ? { ...x, done: !x.done } : x)), { id: b.id, caret: caretOf(b) })
  }

  const onText = (b: Block, text: string, caret: number): void => {
    // Markdown-style shortcuts at the start of a plain line.
    if (b.type === 'text') {
      if (/^#\s/.test(text)) return commit(blocks.map((x) => (x.id === b.id ? { ...x, type: 'heading', text: text.slice(2) } : x)), { id: b.id, caret: Math.max(0, caret - 2) })
      if (/^[-*]\s/.test(text)) return commit(blocks.map((x) => (x.id === b.id ? { ...x, type: 'bullet', done: false, text: text.slice(2) } : x)), { id: b.id, caret: Math.max(0, caret - 2) })
    }
    commit(blocks.map((x) => (x.id === b.id ? { ...x, text } : x)))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, b: Block, index: number): void => {
    const el = e.currentTarget
    const start = el.selectionStart
    const end = el.selectionEnd

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      toggleDone(b)
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      // Enter on an empty bullet ends the list.
      if (b.type === 'bullet' && b.text === '') {
        commit(replace(index, { ...b, type: 'text', done: false }), { id: b.id, caret: 0 })
        return
      }
      const after = newBlock(b.type === 'bullet' ? 'bullet' : 'text', b.text.slice(end))
      commit(replace(index, { ...b, text: b.text.slice(0, start) }, after), { id: after.id, caret: 0 })
      return
    }

    if (e.key === 'Backspace' && start === 0 && end === 0) {
      // First undo the formatting, then join with the line above.
      if (b.type !== 'text') {
        e.preventDefault()
        commit(replace(index, { ...b, type: 'text', done: false }), { id: b.id, caret: 0 })
      } else if (index > 0) {
        e.preventDefault()
        const prev = blocks[index - 1]
        const merged = blocks.filter((x) => x.id !== b.id).map((x) => (x.id === prev.id ? { ...x, text: x.text + b.text } : x))
        commit(merged, { id: prev.id, caret: prev.text.length })
      }
      return
    }

    if (e.key === 'Delete' && start === b.text.length && end === start && index < blocks.length - 1) {
      e.preventDefault()
      const next = blocks[index + 1]
      commit(
        blocks.filter((x) => x.id !== next.id).map((x) => (x.id === b.id ? { ...x, text: x.text + next.text } : x)),
        { id: b.id, caret: start }
      )
      return
    }

    if (e.key === 'ArrowUp' && start === 0 && end === 0 && index > 0) {
      e.preventDefault()
      const prev = blocks[index - 1]
      pendingFocus.current = { id: prev.id, caret: prev.text.length }
      setActiveId(prev.id)
      return
    }
    if (e.key === 'ArrowDown' && start === b.text.length && end === start && index < blocks.length - 1) {
      e.preventDefault()
      const next = blocks[index + 1]
      pendingFocus.current = { id: next.id, caret: 0 }
      setActiveId(next.id)
    }
  }

  // Multi-line paste becomes several blocks instead of a newline inside one.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>, b: Block, index: number): void => {
    const pasted = e.clipboardData.getData('text/plain')
    if (!pasted.includes('\n')) return
    e.preventDefault()
    const el = e.currentTarget
    const before = b.text.slice(0, el.selectionStart)
    const after = b.text.slice(el.selectionEnd)
    // At least two parts, since the paste contains a newline.
    const parts = parseNote(pasted)
    const head = parts[0]
    const last = parts[parts.length - 1]
    // Text before the caret keeps this line's formatting; otherwise the pasted line's wins.
    const first = before ? { ...b, text: before + head.text } : { ...head, id: b.id }
    commit(replace(index, first, ...parts.slice(1, -1), { ...last, text: last.text + after }), { id: last.id, caret: last.text.length })
  }

  const showPlaceholder = blocks.length === 1 && !blocks[0].text && blocks[0].type === 'text'

  return (
    <div
      className={`note${className ? ` ${className}` : ''}${disabled ? ' is-disabled' : ''}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur?.()
      }}
    >
      <div className="note__toolbar" role="toolbar" aria-label="Formatting">
        <ToolButton label="Heading" hint="Heading (type # then space)" on={active?.type === 'heading'} disabled={disabled} onClick={() => active && setType(active, 'heading')}>
          <span className="note__tool-h">H</span>
        </ToolButton>
        <ToolButton label="Bullet" hint="Bullet point (type - then space)" on={active?.type === 'bullet'} disabled={disabled} onClick={() => active && setType(active, 'bullet')}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3" cy="4.5" r="1.4" fill="currentColor" />
            <circle cx="3" cy="11.5" r="1.4" fill="currentColor" />
            <path d="M6.5 4.5h7M6.5 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </ToolButton>
        <ToolButton label="Strike through" hint="Strike through a bullet (Ctrl+Enter, or click its dot)" on={active?.type === 'bullet' && active.done} disabled={disabled || active?.type !== 'bullet'} onClick={() => active && toggleDone(active)}>
          <span className="note__tool-s">S</span>
        </ToolButton>
      </div>

      <div
        className="note__body"
        onMouseDown={(e) => {
          // Clicking the empty area under the text continues the last line.
          if (e.target !== e.currentTarget || disabled) return
          e.preventDefault()
          const last = blocks[blocks.length - 1]
          pendingFocus.current = { id: last.id, caret: last.text.length }
          setActiveId(last.id)
        }}
      >
        {blocks.map((b, i) => (
          <div key={b.id} className={`note__row note__row--${b.type}${b.done ? ' is-done' : ''}`}>
            {b.type === 'bullet' && (
              <button
                type="button"
                className="note__mark"
                aria-pressed={b.done}
                aria-label={b.done ? 'Remove strike-through' : 'Strike through'}
                title={b.done ? 'Remove strike-through' : 'Strike through'}
                disabled={disabled}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggleDone(b)}
              >
                {b.done ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="m2.5 6.2 2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="note__dot" />
                )}
              </button>
            )}
            <textarea
              ref={(el) => {
                if (el) refs.current.set(b.id, el)
                else refs.current.delete(b.id)
              }}
              id={i === 0 ? id : undefined}
              className="note__line"
              rows={1}
              value={b.text}
              placeholder={showPlaceholder ? placeholder : b.type === 'heading' ? 'Heading' : undefined}
              disabled={disabled}
              spellCheck
              onFocus={() => setActiveId(b.id)}
              onChange={(e) => onText(b, e.target.value, e.target.selectionStart)}
              onKeyDown={(e) => onKeyDown(e, b, i)}
              onPaste={(e) => onPaste(e, b, i)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolButton({ label, hint, on, disabled, onClick, children }: { label: string; hint: string; on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      className={`note__tool${on ? ' is-on' : ''}`}
      aria-label={label}
      aria-pressed={on}
      title={hint}
      disabled={disabled}
      // Keep the caret in the text while clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
