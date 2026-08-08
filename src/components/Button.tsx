import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-sky-600 text-white active:bg-sky-700 disabled:bg-slate-300',
  secondary: 'bg-slate-200 text-slate-900 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-100',
  danger: 'bg-red-600 text-white active:bg-red-700',
  ghost: 'text-sky-600 dark:text-sky-400',
};

export default function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`min-h-11 rounded-xl px-4 font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}
