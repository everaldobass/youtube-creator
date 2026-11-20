import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-5',
  {
    variants: {
      variant: {
        default: 'border-border bg-panel text-muted-foreground',
        outline: 'border-border bg-transparent text-foreground',
        brand: 'border-brand/40 bg-brand/10 text-brand-soft',
        ai: 'border-ai/40 bg-ai/15 text-ai-soft',
        success: 'border-success/40 bg-success/10 text-success-soft',
        warning: 'border-warning/40 bg-warning/10 text-warning-soft',
        danger: 'border-danger/40 bg-danger/10 text-danger',
        info: 'border-info/40 bg-info/10 text-info',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
