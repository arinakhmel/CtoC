import { useState } from 'react';
import { useI18n, type MessageKey } from '../lib/i18n';

export interface FilterTab<Item> {
  id: string;
  label: MessageKey;
  /** Which items the tab keeps. The first tab is usually «Усі» and keeps everything. */
  test: (item: Item) => boolean;
}

/**
 * Tabs that filter a list on the client. Each tab is a toggle button with its count, so the user sees how many items each
 * one holds before choosing it. Tabs with no items stay visible but are disabled, except the active one.
 */
export function FilterTabs<Item>({ tabs, items, value, onChange }: { tabs: FilterTab<Item>[]; items: readonly Item[]; value: string; onChange: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="filter-tabs" role="group" aria-label={t('filters.label')}>
      {tabs.map((tab) => {
        const count = items.filter(tab.test).length;
        return (
          <button key={tab.id} type="button" aria-pressed={value === tab.id} disabled={count === 0 && value !== tab.id} onClick={() => onChange(tab.id)}>
            {t(tab.label)}
            <span className="count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The state of a tab bar and the items it keeps. Falls back to the first tab when the chosen one no longer exists. */
export function useFilterTabs<Item>(tabs: FilterTab<Item>[], items: readonly Item[]) {
  const [value, setValue] = useState(tabs[0]!.id);
  const active = tabs.find((tab) => tab.id === value) ?? tabs[0]!;
  return { value: active.id, setValue, visible: items.filter(active.test) };
}
