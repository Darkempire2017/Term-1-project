import { Mail } from 'lucide-react';

export const CONTACT_EMAIL = 'teamastrixhq@gmail.com';

// Contact line at the bottom of the sign-in, dashboard and profile pages
export function ContactFooter({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-[11px] text-slate-400 font-body ${className}`}>
      Need help? Contact{' '}
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="inline-flex items-center gap-1 font-semibold text-brand-500 hover:text-brand-700 underline-offset-2 hover:underline"
      >
        <Mail className="w-3 h-3" aria-hidden="true" />
        {CONTACT_EMAIL}
      </a>
    </p>
  );
}
