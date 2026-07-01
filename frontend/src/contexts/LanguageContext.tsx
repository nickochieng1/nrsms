import { createContext, useContext, useState, ReactNode } from 'react'
import { type Lang, t as _t } from '@/i18n/translations'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LangCtx>({
  lang: 'en',
  setLang: () => {},
  t: (k) => k,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem('nrsms_lang') as Lang) ?? 'en'
  )
  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('nrsms_lang', l)
  }
  const tFn = (key: string) => _t(lang, key)
  return (
    <LanguageContext.Provider value={{ lang, setLang, t: tFn }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)
