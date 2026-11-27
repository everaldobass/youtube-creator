'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Campo de chave com botão mostrar/ocultar. */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => {
  const [visivel, setVisivel] = React.useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visivel ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        className={cn('pr-11 font-mono text-[13px]', className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-0.5 top-0.5 text-muted-foreground"
        aria-label={visivel ? 'Ocultar chave' : 'Mostrar chave'}
        aria-pressed={visivel}
        onClick={() => setVisivel((v) => !v)}
      >
        {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
