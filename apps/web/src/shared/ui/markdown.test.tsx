import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './markdown'

/** A description somebody might actually store, with the usual attempts in it. */
const HOSTILE = [
  '# Title',
  '',
  'A paragraph with <script>alert(1)</script> in it.',
  '',
  '<img src="x" onerror="alert(1)">',
  '',
  '<div onclick="alert(1)">click</div>',
  '',
  '[a link](javascript:alert(1))',
  '',
  '[an outside link](https://ada.test)',
].join('\n')

function renderMarkdown(source: string): HTMLElement {
  const { container } = render(<Markdown>{source}</Markdown>)

  return container
}

describe('Markdown (the one renderer)', () => {
  it('renders ordinary markdown as elements', () => {
    renderMarkdown('# Heading\n\nSome **bold** text.\n\n- one\n- two')

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  /** Dropped from the tree, not escaped into visible text: the tags are gone. */
  it('renders no script element, and no escaped tag standing in for one', () => {
    const container = renderMarkdown(HOSTILE)

    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).not.toContain('<script>')
    expect(container.textContent).not.toContain('&lt;script&gt;')
  })

  it('renders no element carrying an event handler attribute', () => {
    const container = renderMarkdown(HOSTILE)

    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(attribute.name).not.toMatch(/^on/i)
      }
    }
  })

  /** The `<img onerror>` line is a tag, so the whole element goes with it. */
  it('renders no element at all for an html tag in the source', () => {
    const container = renderMarkdown(HOSTILE)

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).not.toContain('click')
  })

  it('leaves a javascript: link with nothing to navigate to', () => {
    const container = renderMarkdown(HOSTILE)

    for (const anchor of container.querySelectorAll('a')) {
      expect(anchor.getAttribute('href') ?? '').not.toMatch(/javascript/i)
    }
    expect(screen.getByRole('link', { name: 'an outside link' })).toHaveAttribute(
      'href',
      'https://ada.test',
    )
  })

  /** Somebody else's text never speaks for this site, and never shares its tab. */
  it('sends every link out of the site safely', () => {
    renderMarkdown('[out](https://ada.test)')

    const link = screen.getByRole('link', { name: 'out' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
    expect(link.getAttribute('rel')).toContain('nofollow')
  })
})
