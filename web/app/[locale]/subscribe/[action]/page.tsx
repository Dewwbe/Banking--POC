import { notFound } from 'next/navigation';
import { SubscriptionAction } from '@/components/SubscriptionAction';
import { isLocale } from '@/lib/strapi';

export const dynamic = 'force-dynamic';

export default async function SubscribeActionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; action: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale, action } = await params;
  if (!isLocale(locale) || (action !== 'confirm' && action !== 'unsubscribe')) notFound();
  const { token } = await searchParams;
  return <SubscriptionAction action={action} token={typeof token === 'string' ? token : ''} locale={locale} />;
}
