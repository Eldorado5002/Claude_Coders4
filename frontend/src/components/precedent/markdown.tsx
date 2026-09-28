import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Safe } from './safe'

/** The agent's long-form voice (playbook, policy, answers): serif prose, raw HTML off. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <Safe label="This text">
      <div className={cn('prose-case', className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
      </div>
    </Safe>
  )
}
