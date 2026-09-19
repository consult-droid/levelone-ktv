import Link from 'next/link';
import { BookingFlow } from './BookingFlow';
import { Logo } from '@/components/Logo';

export const dynamic = 'force-dynamic';

export default function BookPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-6">
      <Link href="/" className="flex items-center gap-3">
        <Logo className="h-7" />
        <span className="text-sm font-extrabold tracking-[0.18em]">LEVEL ONE</span>
      </Link>
      <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Book your KTV room</h1>
      <BookingFlow />
    </main>
  );
}
