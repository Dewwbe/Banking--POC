'use client';

import { useState } from 'react';

const T: Record<string, { title: string; text: string; placeholder: string; button: string; ok: string; bad: string; busy: string }> = {
  en: { title: 'Stay up to date', text: 'Get news about rates and offers. You can unsubscribe at any time.', placeholder: 'Your email address', button: 'Subscribe', ok: 'Thank you! Please check your inbox to confirm your subscription.', bad: 'Please enter a valid email address, or try again later.', busy: 'Sending…' },
  si: { title: 'යාවත්කාලීනව සිටින්න', text: 'පොලී අනුපාත සහ දීමනා පිළිබඳ පුවත් ලබා ගන්න. ඕනෑම වේලාවක දායකත්වය අවසන් කළ හැක.', placeholder: 'ඔබේ ඊමේල් ලිපිනය', button: 'දායක වන්න', ok: 'ස්තූතියි! දායකත්වය තහවුරු කිරීමට ඔබේ ඊමේල් පරීක්ෂා කරන්න.', bad: 'වලංගු ඊමේල් ලිපිනයක් ඇතුළත් කරන්න, නැතහොත් පසුව උත්සාහ කරන්න.', busy: 'යවමින්…' },
  ta: { title: 'புதுப்பித்த நிலையில் இருங்கள்', text: 'விகிதங்கள் மற்றும் சலுகைகள் பற்றிய செய்திகளைப் பெறுங்கள். எப்போது வேண்டுமானாலும் விலகலாம்.', placeholder: 'உங்கள் மின்னஞ்சல்', button: 'சந்தா செய்', ok: 'நன்றி! சந்தாவை உறுதிப்படுத்த உங்கள் இன்பாக்ஸைப் பாருங்கள்.', bad: 'சரியான மின்னஞ்சலை உள்ளிடவும் அல்லது பின்னர் முயலவும்.', busy: 'அனுப்புகிறது…' },
};

export function SubscribeForm({ locale }: { locale: string }) {
  const t = T[locale] ?? T.en;
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — hidden from people, bots tend to fill it
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', email, language: locale, website }),
      });
      const json = await res.json().catch(() => ({}));
      setState(json.ok ? 'ok' : 'bad');
      if (json.ok) setEmail('');
    } catch {
      setState('bad');
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl" data-testid="subscribe-form">
      <p className="font-semibold text-white">{t.title}</p>
      <p className="mt-1 text-sm text-white/80">{t.text}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder}
          className="w-full rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm text-white placeholder-white/60 outline-none focus:border-white"
        />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute left-[-9999px] h-0 w-0 opacity-0" />
        <button type="submit" disabled={state === 'busy'} className="shrink-0 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-brand-dark transition hover:bg-lilac-soft disabled:opacity-60">
          {state === 'busy' ? t.busy : t.button}
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-2 min-h-5 text-sm ${state === 'bad' ? 'text-red-200' : 'text-white/90'}`}>
        {state === 'ok' ? t.ok : state === 'bad' ? t.bad : ''}
      </p>
    </form>
  );
}
