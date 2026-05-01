import { useEffect, useState } from 'react';
import { httpGet } from '@/lib/fetch';
import enUS from '../../../public/intl/language/en-US.json';

const languageNames = {
  'en-US': enUS,
};

const languageNameRequests: Record<string, Promise<Record<string, string>>> = {};

function loadLanguageNames(locale: string) {
  if (!languageNameRequests[locale]) {
    languageNameRequests[locale] = httpGet(
      `${process.env.basePath || ''}/intl/language/${locale}.json`,
    )
      .then(({ data }) => {
        if (data) {
          languageNames[locale] = data;

          return data;
        }

        return enUS;
      })
      .catch(() => enUS)
      .finally(() => {
        delete languageNameRequests[locale];
      });
  }

  return languageNameRequests[locale];
}

export function useLanguageNames(locale: string) {
  const [list, setList] = useState(languageNames[locale] || enUS);

  useEffect(() => {
    let mounted = true;

    if (languageNames[locale]) {
      setList(languageNames[locale]);
      return;
    }

    loadLanguageNames(locale).then(data => {
      if (mounted) {
        setList(data);
      }
    });

    return () => {
      mounted = false;
    };
  }, [locale]);

  return { languageNames: list };
}
