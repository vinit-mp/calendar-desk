import { Fragment } from 'react'
import { parseNote } from '../lib/noteFormat'

/** Read-only, inline rendering of a formatted note, for small previews that
 *  clamp to a few lines. Blank lines are dropped to save room. */
export default function NotePreview({ text }: { text: string }): React.JSX.Element {
  const blocks = parseNote(text).filter((b) => b.text.trim())
  return (
    <>
      {blocks.map((b, i) => (
        <Fragment key={b.id}>
          {i > 0 && <br />}
          {b.type === 'heading' ? <b>{b.text}</b> : b.type === 'bullet' ? <span className={b.done ? 'is-struck' : undefined}>• {b.text}</span> : b.text}
        </Fragment>
      ))}
    </>
  )
}
