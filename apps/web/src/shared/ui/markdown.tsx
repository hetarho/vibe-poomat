import type { ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import { cn } from '../lib/cn'

/**
 * The one place markdown becomes elements. Nothing anywhere else may render a
 * description — a second renderer is how one of them ends up unsanitised.
 *
 * Safe by construction rather than by filtering: without `rehype-raw` no HTML in
 * the source is ever parsed into elements, and `skipHtml` drops it from the tree
 * instead of escaping it into visible text — so a `<script>` or an `onerror=`
 * is gone rather than shown. The default URL transform refuses every scheme but
 * http, https and mailto, which is what stops a `javascript:` link.
 */
type MarkdownProps = {
  children: string
  className?: string
}

/** Every link in user text leaves the site, so none of them speaks for it. */
function MarkdownLink({ href, children }: ComponentProps<'a'>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className="underline underline-offset-4"
    >
      {children}
    </a>
  )
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed',
        '[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:font-semibold [&_h1]:text-lg',
        '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:font-semibold [&_h2]:text-base',
        '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-medium',
        '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1',
        '[&_blockquote]:my-3 [&_blockquote]:border-muted [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
        '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_hr]:my-5 [&_hr]:border-muted',
        '[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded',
        '[&_strong]:font-semibold',
        className,
      )}
    >
      <ReactMarkdown skipHtml components={{ a: MarkdownLink }}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
