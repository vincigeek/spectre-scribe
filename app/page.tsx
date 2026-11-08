import { Workspace } from "@/components/workspace";
import { I18nProvider } from "@/lib/i18n";

export default function HomePage() {
  return (
    <I18nProvider>
      <main className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <Workspace />
      </main>
    </I18nProvider>
  );
}
