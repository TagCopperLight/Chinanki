import { RATINGS, RATING_LABELS, type Rating, type SchedulingState } from '@/lib/fsrs';
import { DAY_MS, formatInterval } from '@/lib/time';

const COLOURS: Record<Rating, string> = {
  1: 'bg-red-600 active:bg-red-700',
  2: 'bg-amber-600 active:bg-amber-700',
  3: 'bg-green-600 active:bg-green-700',
  4: 'bg-sky-600 active:bg-sky-700',
};

export default function RatingButtons({
  previews,
  now,
  onRate,
}: {
  previews: Record<Rating, SchedulingState>;
  now: number;
  onRate: (rating: Rating) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {RATINGS.map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onRate(rating)}
          className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-1 text-white ${COLOURS[rating]}`}
        >
          <span className="text-sm font-semibold">{RATING_LABELS[rating]}</span>
          <span className="text-xs opacity-80">
            {formatInterval((previews[rating].due - now) / DAY_MS)}
          </span>
        </button>
      ))}
    </div>
  );
}
