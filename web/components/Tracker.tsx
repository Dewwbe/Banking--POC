'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Anonymous analytics for the CMS dashboard: one "pageview" per page and one "cta_click" per click on a CMS call to
 * action (links carrying data-cta, see ctaAttrs in components/Sections.tsx). Events go to our own /api/track route, which
 * adds the server-side token and forwards them to Strapi.
 *
 * Privacy: no cookie, no IP, no personal data. The session id is random, lives in sessionStorage (gone when the tab
 * closes) and only exists to count unique visitors. Nothing is sent when the browser sends Do Not Track / Global
 * Privacy Control, or when NEXT_PUBLIC_ANALYTICS_ENABLED=false.
 */
const SECTIONS = ['products', 'news', 'promotions', 'rates', 'about', 'contact', 'subscribe'];

function optedOut() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'false' || nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

function sessionId() {
  try {
    let id = sessionStorage.getItem('poc_sid');
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
      sessionStorage.setItem('poc_sid', id);
    }
    return id;
  } catch {
    return null; // storage blocked: skip tracking rather than invent an identifier that cannot be trusted
  }
}

function send(event: Record<string, unknown>) {
  const sid = sessionId();
  if (!sid) return;
  const parts = location.pathname.split('/').filter(Boolean); // ["en", "products", "fixed-deposit"]
  const body = JSON.stringify({
    ...event, sessionId: sid, path: location.pathname, language: parts[0], pageTitle: document.title,
    section: parts.length < 2 ? 'home' : SECTIONS.includes(parts[1]) ? parts[1] : 'other',
  });
  try {
    if (!navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' }))) {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* analytics must never break the page */ }
}

export function Tracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (optedOut()) return;
    // the title is set by the page's metadata after navigation, so read it on the next tick
    const t = setTimeout(() => send({ kind: 'pageview' }), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (optedOut()) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[data-cta]') as HTMLAnchorElement | null;
      if (!a) return;
      send({
        kind: 'cta_click', ctaId: a.dataset.ctaId, ctaLabel: a.dataset.ctaLabel ?? a.textContent?.trim(),
        ctaUrl: a.getAttribute('href'), keyConversion: a.dataset.ctaKey === '1',
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
