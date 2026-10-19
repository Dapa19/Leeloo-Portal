import { Activity as ActivityIcon } from 'lucide-react';
import { ActivityList, EmptyState, ErrorState, LoadingState, PageHeader, useLoad } from '../components/ui';
import type { Activity } from '../types';

export default function ActivityPage() {
  const { data, loading, error, reload } = useLoad<Activity[]>('/activity');
  return <><PageHeader eyebrow="THE PAPER TRAIL" title="Activity" description="A clear, chronological record of project updates and review decisions." />{loading ? <LoadingState label="Loading activity" /> : error ? <ErrorState message={error} retry={() => void reload()} /> : <section className="section-card activity-page-card">{data?.length ? <ActivityList items={data} showProject /> : <EmptyState title="No activity yet" text="Project updates, feedback, approvals and deliveries will appear here." action={<span className="empty-icon"><ActivityIcon size={19} /></span>} />}</section>}</>;
}
