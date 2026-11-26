import { useI18n } from '../../../lib/i18n';
import type { FeedTask } from '../queries/feed';

export type RewardRange = 'any' | 'low' | 'mid' | 'high';
export type FeedSort = 'new' | 'deadline' | 'reward';
export interface FeedFilterState {
  query: string;
  reward: RewardRange;
  sort: FeedSort;
}
export const EMPTY_FEED_FILTER: FeedFilterState = { query: '', reward: 'any', sort: 'new' };

/** Reward ranges in kopecks: [from, to). The fixed price is only read here, never edited (US-13). */
const RANGES: Record<RewardRange, [number, number]> = {
  any: [0, Infinity],
  low: [0, 50_000],
  mid: [50_000, 150_000],
  high: [150_000, Infinity],
};

/** The cards the student sees: those that match the words and the reward range, in the chosen order. */
export function applyFeedFilter(tasks: readonly FeedTask[], { query, reward, sort }: FeedFilterState): FeedTask[] {
  const words = query.trim().toLocaleLowerCase('uk').split(/\s+/).filter(Boolean);
  const [from, to] = RANGES[reward];
  const kept = tasks.filter((task) => {
    const text = `${task.title} ${task.description}`.toLocaleLowerCase('uk');
    return words.every((word) => text.includes(word)) && task.priceKopecks >= from && task.priceKopecks < to;
  });
  if (sort === 'deadline') return [...kept].sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt));
  if (sort === 'reward') return [...kept].sort((a, b) => b.priceKopecks - a.priceKopecks);
  return kept; // the API already sends the newest first
}

/**
 * The filter bar of the feed: a search box, the reward range and the order. No number field and no field named after a price:
 * the student chooses among fixed prices and never types one (US-13, US-42).
 */
export function FeedFilters({ value, onChange }: { value: FeedFilterState; onChange: (next: FeedFilterState) => void }) {
  const { t } = useI18n();
  return (
    <div className="list-toolbar__fields">
      <p>
        <label htmlFor="feed-search">{t('feed.search')}</label>
        <input id="feed-search" type="search" value={value.query} placeholder={t('feed.searchPlaceholder')} onChange={(event) => onChange({ ...value, query: event.target.value })} />
      </p>
      <p>
        <label htmlFor="feed-reward">{t('feed.reward')}</label>
        <select id="feed-reward" value={value.reward} onChange={(event) => onChange({ ...value, reward: event.target.value as RewardRange })}>
          <option value="any">{t('feed.rewardAny')}</option>
          <option value="low">{t('feed.rewardLow')}</option>
          <option value="mid">{t('feed.rewardMid')}</option>
          <option value="high">{t('feed.rewardHigh')}</option>
        </select>
      </p>
      <p>
        <label htmlFor="feed-sort">{t('feed.sort')}</label>
        <select id="feed-sort" value={value.sort} onChange={(event) => onChange({ ...value, sort: event.target.value as FeedSort })}>
          <option value="new">{t('feed.sortNew')}</option>
          <option value="deadline">{t('feed.sortDeadline')}</option>
          <option value="reward">{t('feed.sortReward')}</option>
        </select>
      </p>
    </div>
  );
}
