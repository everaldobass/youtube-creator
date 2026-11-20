import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-11 min-w-11 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 sm:min-h-0 sm:min-w-0 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Ação primária: vermelho da marca em tom acessível com texto branco.
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
        // Ações de IA usam exclusivamente o roxo.
        ai: 'bg-ai text-primary-foreground shadow-sm hover:bg-ai-hover',
        // Ação secundária: superfície elevada, sem competir com o primário.
        secondary: 'border border-border bg-card-raised text-foreground hover:bg-card',
        outline: 'border border-border bg-transparent text-foreground hover:bg-card',
        // Neutra, sem moldura.
        ghost: 'text-muted-foreground hover:bg-card hover:text-foreground',
        // Perigo: ícone + superfície tingida + texto forte, separado do vermelho de ação.
        destructive:
          'border border-danger/40 bg-danger/10 text-danger hover:border-danger/60 hover:bg-danger/15',
        // Perigo preenchido, para a confirmação final de exclusão.
        'destructive-solid': 'bg-danger-strong text-white hover:bg-danger-strong/90',
      },
      size: {
        default: 'h-10 px-4',
        lg: 'h-11 px-5 text-[15px]',
        sm: 'h-9 px-3',
        icon: 'size-11 sm:size-10',
        'icon-sm': 'size-11 sm:size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
