'use client';

import { useState } from 'react';

type Action = 'confirm' | 'unsubscribe';

const T: Record<string, Record<Action, { title: string; text: string; button: string; done: string }> & { error: string }> = {
  en: {
    confirm: { title: 'Confirm your subscription', text: 'Press the button to finish subscribing.', button: 'Confirm subscription', done: 'Thank you — your subscription is confirmed.' },
    unsubscribe: { title: 'Unsubscribe', text: 'Press the button to stop receiving updates from us.', button: 'Unsubscribe', done: 'You have been unsubscribed. You will no longer receive updates.' },
    error: 'This link is invalid or has expired. Please try again from the website.',
  },
  si: {
    confirm: { title: 'ඔබේ දායකත්වය තහවුරු කරන්න', text: 'දායක වීම සම්පූර්ණ කිරීමට බොත්තම ඔබන්න.', button: 'තහවුරු කරන්න', done: 'ස්තූතියි — ඔබේ දායකත්වය තහවුරු විය.' },
    unsubscribe: { title: 'දායකත්වය අවසන් කරන්න', text: 'අප වෙතින් යාවත්කාලීන ලැබීම නවත්වන්න බොත්තම ඔබන්න.', button: 'දායකත්වය අවසන් කරන්න', done: 'ඔබේ දායකත්වය අවසන් කරන ලදී.' },
    error: 'මෙම සබැඳිය වලංගු නැත. කරුණාකර වෙබ් අඩවියෙන් නැවත උත්සාහ කරන්න.',
  },
  ta: {
    confirm: { title: 'உங்கள் சந்தாவை உறுதிப்படுத்தவும்', text: 'சந்தாவை முடிக்க பொத்தானை அழுத்தவும்.', button: 'உறுதிப்படுத்து', done: 'நன்றி — உங்கள் சந்தா உறுதிசெய்யப்பட்டது.' },
    unsubscribe: { title: 'சந்தாவிலிருந்து விலகு', text: 'எங்களிடமிருந்து புதுப்பிப்புகளைப் பெறுவதை நிறுத்த பொத்தானை அழுத்தவும்.', button: 'விலகு', done: 'நீங்கள் சந்தாவிலிருந்து விலகினீர்கள்.' },
    error: 'இந்த இணைப்பு செல்லாது. இணையதளத்திலிருந்து மீண்டும் முயலவும்.',
  },
};

/** Confirm/unsubscribe needs a deliberate click (POST): mail scanners that pre-fetch links cannot trigger it. */
export function SubscriptionAction({ action, token, locale }: { action: Action; token: string; locale: string }) {
  const t = T[locale] ?? T.en;
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function run() {
    setState('busy');
    try {
      const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token }) });
      const json = await res.json().catch(() => ({}));
      setState(json.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-brand-dark">{t[action].title}</h1>
      {state === 'done' ? (
        <p className="mt-4 text-ink" role="status">{t[action].done}</p>
      ) : state === 'error' || !token ? (
        <p className="mt-4 text-red-700" role="alert">{t.error}</p>
      ) : (
        <>
          <p className="mt-3 text-muted">{t[action].text}</p>
          <button onClick={run} disabled={state === 'busy'} className="mt-6 rounded-full bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {t[action].button}
          </button>
        </>
      )}
    </div>
  );
}
