import { useState } from 'react';
import { LANGS, useI18n } from '../lib/i18n';
import { THEMES, useTheme } from '../lib/theme';

/** The language and theme switches of the header. Toggle buttons (`aria-pressed`), so a screen reader hears which one is on. */
export function Preferences() {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="prefs" role="group" aria-label={t('layout.prefs')}>
      <div className="segmented" role="group" aria-label={t('layout.language')}>
        {LANGS.map((code) => (
          <button key={code} type="button" aria-pressed={lang === code} aria-label={t(`lang.${code}`)} lang={code} onClick={() => setLang(code)}>
            {code === 'uk' ? 'UA' : 'EN'}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label={t('layout.theme')}>
        {THEMES.map((name) => (
          <button key={name} type="button" aria-pressed={theme === name} aria-label={t(`theme.${name}`)} title={t(`theme.${name}`)} onClick={() => setTheme(name)}>
            <span className={`swatch swatch--${name}`} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The phone version: one small button per setting that shows the current choice; a tap drops the options down under it.
 * Only one list is open at a time.
 */
export function CompactPreferences({ variant = 'panel' }: { variant?: 'panel' | 'header' }) {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState<'lang' | 'theme' | null>(null);
  const toggle = (which: 'lang' | 'theme') => setOpen((current) => (current === which ? null : which));

  return (
    <div className={`prefs-compact prefs-compact--${variant}`} role="group" aria-label={t('layout.prefs')}>
      <div className="prefs-compact__item">
        <button
          type="button"
          className="prefs-compact__toggle"
          aria-expanded={open === 'lang'}
          aria-label={`${t('layout.language')}: ${t(`lang.${lang}`)}`}
          onClick={() => toggle('lang')}
        >
          <span className="prefs-compact__label">{t('layout.language')}</span>
          <span>{lang === 'uk' ? 'UA' : 'EN'}</span>
          <span aria-hidden="true" className="prefs-compact__caret" />
        </button>
        {open === 'lang' && (
          <div className="prefs-compact__list">
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={lang === code}
                lang={code}
                onClick={() => {
                  setLang(code);
                  setOpen(null);
                }}
              >
                {t(`lang.${code}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="prefs-compact__item">
        <button
          type="button"
          className="prefs-compact__toggle"
          aria-expanded={open === 'theme'}
          aria-label={`${t('layout.theme')}: ${t(`theme.${theme}`)}`}
          onClick={() => toggle('theme')}
        >
          <span className="prefs-compact__label">{t('layout.theme')}</span>
          <span className={`swatch swatch--${theme}`} aria-hidden="true" />
          <span className="prefs-compact__name">{t(`theme.${theme}`)}</span>
          <span aria-hidden="true" className="prefs-compact__caret" />
        </button>
        {open === 'theme' && (
          <div className="prefs-compact__list">
            {THEMES.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={theme === name}
                onClick={() => {
                  setTheme(name);
                  setOpen(null);
                }}
              >
                <span className={`swatch swatch--${name}`} aria-hidden="true" /> {t(`theme.${name}`)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
