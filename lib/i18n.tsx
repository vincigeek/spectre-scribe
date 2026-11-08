"use client";
/** React provider and switch for the UI language (REQ-28, T-23a). Strings live in i18n-messages.ts. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultUiLang, translate, UI_LANG_KEY, type MessageKey, type UiLang, type Vars } from "./i18n-messages";

export type { MessageKey, UiLang } from "./i18n-messages";

type Ctx = { lang: UiLang; setLang: (l: UiLang) => void; t: (key: MessageKey, vars?: Vars) => string };
const I18nContext = createContext<Ctx>({ lang: "en", setLang: () => undefined, t: (k, v) => translate("en", k, v) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("en");
  useEffect(() => {
    const saved = localStorage.getItem(UI_LANG_KEY);
    setLangState(saved === "en" || saved === "zh-CN" ? saved : defaultUiLang(navigator.language));
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: UiLang) => {
    setLangState(l);
    localStorage.setItem(UI_LANG_KEY, l);
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  return useContext(I18nContext);
}

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="flex items-center gap-2 text-sm">
      {t("ui.language")}
      <select value={lang} onChange={(e) => setLang(e.target.value as UiLang)} className="h-7 border border-input bg-transparent px-2 text-xs">
        <option value="en">English</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </label>
  );
}
