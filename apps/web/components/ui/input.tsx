import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-border bg-panel px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/80 hover:border-border/80 focus-visible:border-brand/60 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger/60',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
