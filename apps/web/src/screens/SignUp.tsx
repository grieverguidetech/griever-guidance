import type { AuthProvider } from '@griever/shared';
import { GoogleLogo, FacebookLogo, XLogo, EnvelopeSimple } from '@phosphor-icons/react';

interface Props {
  onContinueWithProvider: (provider: Extract<AuthProvider, 'google' | 'facebook' | 'x'>) => void;
  onUseEmail: () => void;
}

export function SignUp({ onContinueWithProvider, onUseEmail }: Props) {
  return (
    <div className="flex flex-col gap-4 pt-[52px] min-h-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.1]">Griever Guidance</h1>
        <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
          We'll help you tell people what they need to know. First, somewhere safe to keep it.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="gg-eyebrow m-0">Fastest — brings your contacts with you</p>
        <button
          type="button"
          onClick={() => onContinueWithProvider('google')}
          className="gg-btn gg-btn-secondary gg-btn-block"
        >
          <GoogleLogo size={18} weight="duotone" />
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => onContinueWithProvider('facebook')}
          className="gg-btn gg-btn-secondary gg-btn-block"
        >
          <FacebookLogo size={18} weight="duotone" />
          Continue with Facebook
        </button>
        <button
          type="button"
          onClick={() => onContinueWithProvider('x')}
          className="gg-btn gg-btn-secondary gg-btn-block"
        >
          <XLogo size={18} weight="duotone" />
          Continue with X
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="gg-eyebrow m-0">Or keep it separate</p>
        <button
          type="button"
          onClick={onUseEmail}
          className="gg-btn gg-btn-ghost gg-btn-block justify-start !px-0"
        >
          <EnvelopeSimple size={18} weight="regular" />
          Use an email and password
        </button>
        <p className="text-[12px] m-0" style={{ color: 'var(--text-muted)' }}>
          You'll add the people you want to reach by hand — a few minutes' work.
        </p>
      </div>

      <p className="text-[12px] m-0" style={{ color: 'var(--text-hint)', marginTop: 'auto' }}>
        We only ever use your contacts to send the messages you write. We don't post anything,
        anywhere.
      </p>
    </div>
  );
}
