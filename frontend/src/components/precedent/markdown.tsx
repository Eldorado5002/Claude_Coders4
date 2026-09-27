import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/** The agent's long-form voice (playbook, policy, answers): serif prose, raw HTML off. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose-case', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
