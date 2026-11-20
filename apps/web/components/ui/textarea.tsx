import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-20 w-full rounded-md border border-border bg-panel px-3 py-2 text-sm leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/80 hover:border-border/80 focus-visible:border-brand/60 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/60',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
