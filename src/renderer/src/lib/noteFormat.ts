/** Notes are stored as plain text so old summaries and Google's description
 *  field keep working. One block per line, in a small Markdown subset:
 *    # Heading
 *    - bullet
 *    - [x] struck-through bullet
 *    anything else is a plain line */

export type BlockType = 'heading' | 'bullet' | 'text'

export interface Block {
  id: string
  type: BlockType
  /** Struck through. Only meaningful for bullets. */
  done: boolean
  text: string
}

let seq = 0
export function newBlock(type: BlockType = 'text', text = '', done = false): Block {
  return { id: `b${++seq}`, type, done, text }
}

export function parseNote(src: string): Block[] {
  const blocks = src
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      let m = /^#{1,3}\s+(.*)$/.exec(line)
      if (m) return newBlock('heading', m[1])
      m = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/.exec(line)
      if (m) return newBlock('bullet', m[2], m[1] !== ' ')
      m = /^\s*[-*•]\s+(.*)$/.exec(line)
      if (m) return newBlock('bullet', m[1])
      return newBlock('text', line)
    })
  return blocks.length ? blocks : [newBlock()]
}

export function serializeNote(blocks: Block[]): string {
  if (blocks.every((b) => !b.text.trim())) return ''
  return blocks
    .map((b) => (b.type === 'heading' ? `# ${b.text}` : b.type === 'bullet' ? `- ${b.done ? '[x] ' : ''}${b.text}` : b.text))
    .join('\n')
}
