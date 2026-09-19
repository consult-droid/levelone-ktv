import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import Dashboard from './Dashboard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'LevelOne KTV — Staff', robots: { index: false, follow: false } };

export default async function AdminPage() {
  const staff = await currentStaff();
  if (!staff) redirect('/admin/login');
  return <Dashboard staff={staff} />;
}
