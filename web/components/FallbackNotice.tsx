/**
 * Language fallback UI. When a page or item is not published in the visitor's language, the site shows the fallback
 * language (English) instead; these components tell the visitor, in THEIR language, that this is happening.
 */
const LANG_NAME: Record<string, Record<string, string>> = {
  en: { en: 'English', si: 'Sinhala', ta: 'Tamil' },
  si: { en: 'ඉංග්‍රීසි', si: 'සිංහල', ta: 'දමිළ' },
  ta: { en: 'ஆங்கிலம்', si: 'சிங்களம்', ta: 'தமிழ்' },
};

const PAGE_MSG: Record<string, (lang: string, from: string) => string> = {
  en: (lang, from) => `This page is not available in ${lang} yet. You are viewing the ${from} version.`,
  si: (lang, from) => `මෙම පිටුව තවමත් ${lang} භාෂාවෙන් නොමැත. ඔබ දකින්නේ ${from} අනුවාදයයි.`,
  ta: (lang, from) => `இந்தப் பக்கம் இன்னும் ${lang} மொழியில் இல்லை. நீங்கள் ${from} பதிப்பைப் பார்க்கிறீர்கள்.`,
};

const TAG_TITLE: Record<string, (from: string) => string> = {
  en: (from) => `Not yet available in your language — shown in ${from}`,
  si: (from) => `ඔබේ භාෂාවෙන් තවමත් නොමැත — ${from} භාෂාවෙන් පෙන්වයි`,
  ta: (from) => `உங்கள் மொழியில் இன்னும் இல்லை — ${from} மொழியில் காட்டப்படுகிறது`,
};

export function FallbackNotice({ locale, from }: { locale: string; from?: string }) {
  if (!from) return null;
  const names = LANG_NAME[locale] ?? LANG_NAME.en;
  return (
    <div role="status" data-testid="fallback-notice" lang={locale} className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
      {(PAGE_MSG[locale] ?? PAGE_MSG.en)(names[locale], names[from])}
    </div>
  );
}

/** Small tag for list items that are shown in the fallback language. */
export function LangTag({ locale, from }: { locale: string; from?: string }) {
  if (!from) return null;
  const names = LANG_NAME[locale] ?? LANG_NAME.en;
  return (
    <span title={(TAG_TITLE[locale] ?? TAG_TITLE.en)(names[from])} data-testid="fallback-tag"
      className="inline-block w-fit rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
      {from}
    </span>
  );
}
