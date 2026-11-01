import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { tr } from './locales/tr';

export const STORAGE_KEY = 'zeropulse_language';
export const DEFAULT_LANGUAGE = 'en';

const savedLanguage = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
const initialLanguage = savedLanguage === 'tr' || savedLanguage === 'en' ? savedLanguage : DEFAULT_LANGUAGE;

export const resources = {
  en: { translation: en },
  tr: { translation: tr },
} as const;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
    },
  });

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage;
}

i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  }
});

export default i18n;
export * from './formatters';
