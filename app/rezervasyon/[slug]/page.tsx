import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingView } from './BookingView';
import { ACTIVITIES, getActivity } from '@/lib/data';

export function generateStaticParams() {
  return ACTIVITIES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const activity = getActivity(slug);
  return activity ? { title: `${activity.title} — Rezervasyon` } : {};
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const activity = getActivity(slug);
  if (!activity) notFound();

  return <BookingView activity={activity} />;
}
