import { PageHeader } from "@/components/page-header";
import { Workspace } from "@/components/workspace";
import { I18nProvider } from "@/lib/i18n";

export default function HomePage() {
  return (
    <I18nProvider>
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <PageHeader />
        <Workspace />
      </main>
    </I18nProvider>
  );
}
