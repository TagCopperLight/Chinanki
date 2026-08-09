import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '@/lib/db/db';
import { listDecks } from '@/lib/db/decks';
import {
  buildForecast,
  buildHeatmap,
  cardBreakdown,
  currentStreak,
  retentionByMonth,
  retentionOverall,
  reviewsPerDayAverage,
} from '@/lib/stats';
import { studyDayKey } from '@/lib/time';
import { useSettings } from '@/hooks/useSettings';
import ChartTooltip from '@/components/ChartTooltip';
import EmptyState from '@/components/EmptyState';
import Heatmap from '@/components/Heatmap';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { inputClass } from '@/components/Field';

const HEATMAP_DAYS = 182;
const FORECAST_DAYS = 30;

export default function StatsPage() {
  const { settings } = useSettings();
  const [deckFilter, setDeckFilter] = useState<'all' | number>('all');

  const decks = useLiveQuery(() => listDecks(), [], []);
  const reviews = useLiveQuery(
    () =>
      deckFilter === 'all'
        ? db.reviews.toArray()
        : db.reviews.where('deckId').equals(deckFilter).toArray(),
    [deckFilter],
    [],
  );
  const cards = useLiveQuery(
    () =>
      deckFilter === 'all'
        ? db.cards.toArray()
        : db.cards.where('deckId').equals(deckFilter).toArray(),
    [deckFilter],
    [],
  );

  const now = Date.now();
  const { rolloverHour } = settings;
  const todayKey = studyDayKey(now, rolloverHour);

  const reviewedToday = reviews.filter(
    (review) => studyDayKey(review.reviewedAt, rolloverHour) === todayKey,
  ).length;
  const streak = currentStreak(reviews, now, rolloverHour);
  const retention = retentionOverall(reviews);
  const perDay = reviewsPerDayAverage(reviews, now, rolloverHour, 30);
  const heatmap = buildHeatmap(reviews, now, rolloverHour, HEATMAP_DAYS);
  const forecast = buildForecast(cards, now, rolloverHour, FORECAST_DAYS);
  const breakdown = cardBreakdown(cards);
  const monthly = retentionByMonth(reviews);
  const totalForecastDue = forecast.reduce((sum, day) => sum + day.dueCount, 0);
  const latestMonth = monthly.at(-1);

  return (
    <>
      <PageHeader title="Statistics" />

      <div className="space-y-6 p-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Deck
          </span>
          <select
            className={inputClass}
            value={deckFilter === 'all' ? 'all' : String(deckFilter)}
            onChange={(event) =>
              setDeckFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
          >
            <option value="all">All decks</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>

        {reviews.length === 0 ? (
          <EmptyState
            title="No reviews yet"
            description="Study a deck and your progress will show up here."
          />
        ) : (
          <>
            <div className="flex gap-2">
              <StatCard id="stat-streak" label="Day streak" value={String(streak)} />
              <StatCard id="stat-today" label="Reviews today" value={String(reviewedToday)} />
              <StatCard
                id="stat-retention"
                label="Retention"
                value={`${Math.round(retention.rate * 100)}%`}
                hint={`${retention.reviewed} reviews`}
              />
            </div>

            <section className="space-y-2">
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Activity ({perDay.toFixed(1)} reviews/day over 30 days)
              </h2>
              <Heatmap days={heatmap} />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Upcoming workload
              </h2>
              <p className="sr-only" aria-live="off">
                {`${totalForecastDue} card${totalForecastDue === 1 ? '' : 's'} due over the next ${FORECAST_DAYS} days.`}
              </p>
              <div className="h-40" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}
                      interval={6}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}
                      width={28}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ className: 'fill-slate-200/70 dark:fill-slate-700/60' }}
                    />
                    <Bar dataKey="dueCount" name="Due" fill="#0284c7" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {monthly.length > 1 && (
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Retention by month
                </h2>
                {latestMonth && (
                  <p className="sr-only" aria-live="off">
                    {`Latest month (${latestMonth.month}) retention: ${Math.round(latestMonth.rate * 100)}%.`}
                  </p>
                )}
                <div className="h-40" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}
                      />
                      <YAxis
                        domain={[0, 1]}
                        width={36}
                        tick={{ fontSize: 10, className: 'fill-slate-500 dark:fill-slate-400' }}
                        tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      />
                      <Tooltip
                        content={
                          <ChartTooltip formatValue={(value) => `${Math.round(value * 100)}%`} />
                        }
                        cursor={{ className: 'stroke-slate-300 dark:stroke-slate-600' }}
                      />
                      <Line type="monotone" dataKey="rate" name="Retention" stroke="#16a34a" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-300">Cards</h2>
              <div className="flex gap-2">
                <StatCard id="breakdown-new" label="New" value={String(breakdown.new)} />
                <StatCard id="breakdown-learning" label="Learning" value={String(breakdown.learning)} />
                <StatCard id="breakdown-young" label="Young" value={String(breakdown.young)} />
                <StatCard id="breakdown-mature" label="Mature" value={String(breakdown.mature)} />
              </div>
              {breakdown.suspended > 0 && (
                <p className="text-xs text-slate-500">{breakdown.suspended} suspended</p>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
