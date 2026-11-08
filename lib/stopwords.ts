/**
 * Versioned local stopword lists (REQ-26b). Changing a list changes metric values,
 * so bump STOPWORDS_VERSION with any edit. Entries are stored in normalised form:
 * lowercase, with apostrophes and hyphens removed.
 */
import type { Language } from "./text-units";

export const STOPWORDS_VERSION = "sw-1";

const EN = `a about above after again against all am an and any are as at be because been
before being below between both but by can could did do does doing down during each few
for from further had has have having he her here hers herself him himself his how i if in
into is it its itself just me more most my myself no nor not now of off on once only or
other our ours ourselves out over own same she should so some such than that the their
theirs them themselves then there these they this those through to too under until up very
was we were what when where which while who whom why will with would you your yours
yourself yourselves im ive id ill youre youve youd youll hes shes its were theyre theyve
dont doesnt didnt isnt arent wasnt werent cant couldnt wont wouldnt shouldnt hasnt havent
hadnt lets thats theres whats`;

const ZH = `的 了 是 在 我 你 他 她 它 们 我们 你们 他们 她们 它们 这 那 这个 那个 这些 那些 这里 那里
和 与 及 而 或 且 并 就 也 都 还 又 才 只 很 太 更 最 已 已经 不 没 没有 别 一 一个 一些 有 无
着 过 地 得 之 其 所 以 于 为 被 把 让 给 从 对 向 往 在于 由 自己 什么 怎么 为什么 哪 哪里 谁
吗 呢 吧 啊 呀 哦 嗯 么 但 但是 可是 然而 因为 所以 如果 虽然 然后 于是 而且 或者 只是 就是 可以 会 能 要 想`;

function toSet(list: string): ReadonlySet<string> {
  return new Set(list.split(/\s+/).filter(Boolean));
}

const LISTS: Readonly<Record<Language, ReadonlySet<string>>> = {
  en: toSet(EN),
  zh: toSet(ZH),
};

export function isStopword(normalisedToken: string, language: Language): boolean {
  return LISTS[language].has(normalisedToken);
}
