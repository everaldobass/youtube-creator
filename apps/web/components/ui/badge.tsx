import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-panel text-muted-foreground border border-border',
      outline: 'border border-border text-foreground',
      ai: 'bg-ai/15 text-ai border border-ai/40',
      success: 'bg-success/15 text-success border border-success/40',
      warning: 'bg-warning/15 text-warning border border-warning/40',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
