import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { translations } from './translations';

export type Language = 'English' | 'Français' | 'Español';

export const languageCodeMap: Record<Language, string> = {
  English: 'en',
  Français: 'fr',
  Español: 'es',
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['English'], replace?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'English',
  setLanguage: () => {},
  t: () => '',
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<Language>('English');

  useEffect(() => {
    SecureStore.getItemAsync('app_language').then(val => {
      if (val === 'English' || val === 'Français' || val === 'Español') {
        setLanguageState(val as Language);
      }
    });
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    SecureStore.setItemAsync('app_language', lang);
  };

  const t = (key: keyof typeof translations['English'], replace?: Record<string, string>) => {
    let text = translations[language]?.[key] || translations['English'][key] || key;
    if (replace) {
      Object.keys(replace).forEach(k => {
        text = text.replace(`{${k}}`, replace[k]);
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
