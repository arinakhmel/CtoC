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
