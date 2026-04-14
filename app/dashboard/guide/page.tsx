import { readFile, stat } from 'fs/promises';
import path from 'path';

type GuidePageProps = {
  searchParams?: {
    lang?: string;
  };
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/`([^`]+)`/g, '<code class="rounded bg-gray-100 px-1 py-0.5 text-[0.95em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p class="mb-4 leading-7 text-gray-700">${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const text = renderInline(headingMatch[2]);
      if (level === 1) html.push(`<h1 class="mb-4 mt-8 text-3xl font-bold tracking-tight text-gray-900 first:mt-0">${text}</h1>`);
      if (level === 2) html.push(`<h2 class="mb-3 mt-8 text-2xl font-semibold text-gray-900">${text}</h2>`);
      if (level === 3) html.push(`<h3 class="mb-2 mt-6 text-lg font-semibold text-gray-900">${text}</h3>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
        html.push('<ol class="mb-4 list-decimal space-y-1 pl-6 text-gray-700">');
      }
      html.push(`<li>${renderInline(orderedMatch[1])}</li>`);
      continue;
    }

    const unorderedMatch = line.match(/^-\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
        html.push('<ul class="mb-4 list-disc space-y-1 pl-6 text-gray-700">');
      }
      html.push(`<li>${renderInline(unorderedMatch[1])}</li>`);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return html.join('\n');
}

export default async function DashboardGuidePage({ searchParams }: GuidePageProps) {
  const language = searchParams?.lang === 'en' ? 'en' : 'ko';
  const guideFileName = language === 'en' ? 'DASHBOARD_BUSINESS_GUIDE_EN.md' : 'DASHBOARD_BUSINESS_GUIDE_KO.md';
  const guidePath = path.join(process.cwd(), 'docs', guideFileName);
  const markdown = await readFile(guidePath, 'utf-8');
  const guideStat = await stat(guidePath);
  const html = markdownToHtml(markdown);

  const lastUpdated = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(guideStat.mtime);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <p className="text-sm font-medium text-purple-700">Dashboard Guide</p>
            <p className="mt-1 text-sm text-gray-500">
              {language === 'ko'
                ? '업무용 설명서입니다. 계산식과 화면 의미를 정리한 문서입니다.'
                : 'A business guide that explains the dashboard metrics, screens, and logic.'}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {language === 'ko' ? '최종 업데이트' : 'Last updated'}: {lastUpdated}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
              <a
                href="/dashboard/guide?lang=ko"
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  language === 'ko' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                KR
              </a>
              <a
                href="/dashboard/guide?lang=en"
                className={`border-l border-gray-200 px-4 py-2 text-sm font-medium transition-colors ${
                  language === 'en' ? 'bg-purple-100 font-bold text-purple-900 ring-1 ring-inset ring-purple-400' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                EN
              </a>
            </div>
          </div>
        </div>
        <article
          className="prose prose-gray max-w-none prose-headings:scroll-mt-24"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </main>
  );
}
