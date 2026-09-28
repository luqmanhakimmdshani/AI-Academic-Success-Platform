"use client";

import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Check, Copy, Download, Lightbulb, Loader2, Search, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { fieldControlClass, Label } from "@/components/ui/Field";
import { scrollReveal, staggerContainer, staggerItem } from "@/components/ui/motionPresets";
import PageHeader from "@/components/ui/PageHeader";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface SourceOut {
  title: string;
  authors: string;
  year: number | null;
  doi: string;
  url: string;
  venue: string;
  formatted_apa: string;
}

interface ThemeOut {
  theme: string;
  summary: string;
  sources: SourceOut[];
}

interface FindingOut {
  finding: string;
  sources: SourceOut[];
}

interface LitReviewSummary {
  id: string;
  topic: string;
  language: string;
  themes: ThemeOut[];
  key_findings: FindingOut[];
  research_gaps: string[];
  sources: SourceOut[];
}

interface ResearchHistoryItem {
  id: string;
  topic: string;
  language: string;
  created_at: string;
}

export default function ResearchPage() {
  const { t, locale } = useI18n();
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<LitReviewSummary | null>(null);
  const [history, setHistory] = useState<ResearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadHistory = () => {
    api
      .get<ResearchHistoryItem[]>("/api/research/history")
      .then(setHistory)
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const openHistoryItem = async (id: string) => {
    setError(null);
    try {
      const res = await api.get<LitReviewSummary>(`/api/research/search/${id}`);
      setResult(res);
      setTopic(res.topic);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    }
  };

  const onExport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      await api.download(`/api/research/search/${result.id}/export.docx`, "references.docx");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setExporting(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post<LitReviewSummary>("/api/research/search", { topic, language: locale });
      setResult(res);
      loadHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader eyebrow={t("research.eyebrow")} title={t("research.title")} description={t("research.description")} />

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.5fr]">
        <div className="flex flex-col gap-5">
          <Card className="h-fit">
            <div className="flex items-center gap-2 text-sm font-bold text-ink-primary">
              <Search className="h-4 w-4 text-brand-500" />
              {t("research.title")}
            </div>
            <form onSubmit={onSubmit} className="mt-4">
              <Label>{t("research.topicLabel")}</Label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t("research.placeholder")}
                required
                minLength={3}
                rows={5}
                className={`${fieldControlClass} resize-none`}
              />
              <Button type="submit" loading={loading} className="mt-4 w-full">
                {!loading && <Sparkles className="h-4 w-4" />}
                {loading ? t("research.searching") : t("research.submit")}
              </Button>
            </form>
            {error && <p className="mt-3 text-caption text-danger-text">{error}</p>}
          </Card>

          <Card className="h-fit">
            <span className="text-sm font-bold text-ink-primary">{t("research.history")}</span>
            <div className="mt-3 space-y-1.5">
              {history.length === 0 && <p className="text-caption text-ink-tertiary">{t("research.noHistory")}</p>}
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => openHistoryItem(h.id)}
                  className={
                    "block w-full min-w-0 rounded-lg px-2.5 py-2 text-left text-caption transition-colors " +
                    (h.id === result?.id ? "bg-brand-tint text-brand-700" : "text-ink-secondary hover:bg-surface-sunken")
                  }
                >
                  <span className="block truncate font-medium">{h.topic}</span>
                  <span className="block text-[11px] text-ink-tertiary">{new Date(h.created_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="min-h-[420px]">
          {loading ? (
            <ResearchLoadingState />
          ) : !result ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500 text-white">
                <BookOpen className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-title text-ink-primary">{t("research.emptyTitle")}</h3>
              <p className="mt-2 max-w-sm text-body text-ink-secondary">{t("research.empty")}</p>
            </div>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
              {result.themes.length === 0 && result.key_findings.length === 0 ? (
                <p className="text-body text-ink-secondary">{t("research.noAbstracts")}</p>
              ) : (
                <>
                  <motion.section variants={staggerItem}>
                    <h2 className="text-title text-ink-primary">{t("research.themes")}</h2>
                    <div className="mt-3 space-y-3">
                      {result.themes.map((theme, i) => (
                        <motion.div key={i} {...scrollReveal} className="rounded-xl bg-surface-sunken p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-ink-primary">{theme.theme}</span>
                            <Badge>{theme.sources.length} sources</Badge>
                          </div>
                          <p className="mt-1.5 text-caption text-ink-secondary">{theme.summary}</p>
                          <SourceChips sources={theme.sources} />
                        </motion.div>
                      ))}
                    </div>
                  </motion.section>

                  <motion.section variants={staggerItem}>
                    <h2 className="text-title text-ink-primary">{t("research.keyFindings")}</h2>
                    <ul className="mt-3 space-y-2 text-body text-ink-secondary">
                      {result.key_findings.map((finding, i) => (
                        <motion.li key={i} {...scrollReveal} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-200" />
                          <span>
                            {finding.finding}
                            <SourceChips sources={finding.sources} />
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  </motion.section>

                  <motion.section variants={staggerItem}>
                    <h2 className="flex items-center gap-2 text-title text-ink-primary">
                      <Lightbulb className="h-4 w-4 text-warning-text" />
                      {t("research.gaps")}
                    </h2>
                    <ul className="mt-3 space-y-1.5 text-body text-ink-secondary">
                      {result.research_gaps.map((gap, i) => (
                        <motion.li key={i} {...scrollReveal} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                          {gap}
                        </motion.li>
                      ))}
                    </ul>
                  </motion.section>
                </>
              )}

              <motion.section variants={staggerItem}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-title text-ink-primary">{t("research.sources")}</h2>
                  <Button type="button" variant="secondary" loading={exporting} onClick={onExport}>
                    {!exporting && <Download className="h-4 w-4" />}
                    {t("research.exportWord")}
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {result.sources.map((source, i) => (
                    <SourceCard key={i} source={source} />
                  ))}
                </div>
              </motion.section>
            </motion.div>
          )}
        </Card>
      </div>
    </div>
  );
}

const STAGE_COUNT = 4;

function ResearchLoadingState() {
  const { t } = useI18n();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (stage >= STAGE_COUNT - 1) return;
    const timer = setTimeout(() => setStage((s) => s + 1), 1600);
    return () => clearTimeout(timer);
  }, [stage]);

  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      <div className="mt-5 flex gap-1.5" aria-hidden>
        {Array.from({ length: STAGE_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-6 rounded-full transition-colors duration-500 ${i <= stage ? "bg-brand-500" : "bg-surface-sunken"}`}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={stage}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          className="mt-4 max-w-xs text-caption text-ink-secondary"
        >
          {t(`research.stages.${stage}`)}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function SourceCard({ source }: { source: SourceOut }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(source.formatted_apa);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied or unavailable; ignore
    }
  };

  return (
    <motion.div {...scrollReveal} className="rounded-xl border border-line p-3 transition-colors hover:border-brand-200">
      <a href={source.url} target="_blank" rel="noreferrer" className="block">
        <span className="block text-caption font-bold leading-4 text-ink-primary">{source.title || "Untitled"}</span>
        <span className="mt-2 block text-[11px] text-ink-tertiary">
          {source.authors} {source.year ? `(${source.year})` : ""} {source.venue}
        </span>
      </a>
      {source.formatted_apa && (
        <button
          type="button"
          onClick={onCopy}
          className="mt-2 flex w-full items-center gap-1.5 rounded-lg bg-surface-sunken p-2 text-left text-[11px] text-ink-secondary transition-colors hover:bg-surface-sunken/70"
        >
          {copied ? <Check className="h-3 w-3 shrink-0 text-success-text" /> : <Copy className="h-3 w-3 shrink-0" />}
          <span className="flex-1">{copied ? t("research.copied") : source.formatted_apa}</span>
        </button>
      )}
    </motion.div>
  );
}

function SourceChips({ sources }: { sources: SourceOut[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {sources.map((s, i) => {
        const label = s.title.slice(0, 40) + (s.title.length > 40 ? "…" : "");
        return s.url ? (
          <a key={i} href={s.url} target="_blank" rel="noreferrer">
            <Badge tone="brand" title={s.title} className="hover:underline">
              {label}
            </Badge>
          </a>
        ) : (
          <Badge key={i} tone="brand" title={s.title}>
            {label}
          </Badge>
        );
      })}
    </div>
  );
}
