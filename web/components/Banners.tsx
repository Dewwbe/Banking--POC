import { Banner } from './Sections';
import { getBanners, type Locale } from '@/lib/strapi';

/** Managed banners for one placement (home_top | home_secondary | products_top | promotions_top). Renders nothing when there are none. */
export async function Banners({ locale, placement }: { locale: Locale; placement: string }) {
  const banners = await getBanners(locale, placement);
  if (!banners.length) return null;
  return (
    <>
      {banners.map((b) => <Banner key={b.documentId} banner={b} />)}
    </>
  );
}
