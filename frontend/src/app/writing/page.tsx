"use client";

import { motion } from "motion/react";
import { PenLine, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { fieldControlClass } from "@/components/ui/Field";
import { staggerContainer, staggerItem } from "@/components/ui/motionPresets";
import PageHeader from "@/components/ui/PageHeader";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface WritingFeedbackOut {
  draft_id: string;
  clarity_notes: string[];
  citation_gaps: string[];
  grammar_notes: string[];
  suggestions: string[];
}

interface WritingHistoryItem {
  draft_id: string;
  preview: string;
  language: string;
  submitted_at: string;
}

export default function WritingPage() {
  const { t, locale } = useI18n();
  const [content, setContent] = useState("");
  const [result, setResult] = useState<WritingFeedbackOut | null>(null);
  const [history, setHistory] = useState<WritingHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = () => {
    api
      .get<WritingHistoryItem[]>("/api/writing/history")
      .then(setHistory)
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const openHistoryItem = async (draftId: string) => {
    setError(null);
    try {
      const res = await api.get<WritingFeedbackOut>(`/api/writing/feedback/${draftId}`);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post<WritingFeedbackOut>("/api/writing/feedback", { content, language: locale });
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
      <PageHeader eyebrow={t("writing.eyebrow")} title={t("writing.title")} description={t("writing.description")} />

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-5">
          <Card className="h-fit">
            <div className="flex items-center gap-2 text-sm font-bold text-ink-primary">
              <PenLine className="h-4 w-4 text-purple-text" />
              {t("writing.title")}
            </div>
            <form onSubmit={onSubmit} className="mt-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("writing.placeholder")}
                required
                minLength={20}
                rows={9}
                className={`${fieldControlClass} resize-y`}
              />
              <div className="mt-2 text-caption text-ink-tertiary">{content.length} characters</div>
              <Button type="submit" loading={loading} className="mt-4 w-full">
                {!loading && <Sparkles className="h-4 w-4" />}
                {t("writing.submit")}
              </Button>
            </form>
            <div className="mt-4 rounded-xl bg-purple-bg p-3 text-caption text-purple-text">
              <strong>{t("writing.integrityNote")}</strong> {t("writing.integrityNoteBody")}
            </div>
            {error && <p className="mt-3 text-caption text-danger-text">{error}</p>}
          </Card>

          <Card className="h-fit">
            <span className="text-sm font-bold text-ink-primary">{t("writing.history")}</span>
            <div className="mt-3 space-y-1.5">
              {history.length === 0 && <p className="text-caption text-ink-tertiary">{t("writing.noHistory")}</p>}
              {history.map((h) => (
                <button
                  key={h.draft_id}
                  onClick={() => openHistoryItem(h.draft_id)}
                  className={
                    "block w-full min-w-0 rounded-lg px-2.5 py-2 text-left text-caption transition-colors " +
                    (h.draft_id === result?.draft_id ? "bg-brand-tint text-brand-700" : "text-ink-secondary hover:bg-surface-sunken")
                  }
                >
                  <span className="block truncate font-medium">{h.preview}</span>
                  <span className="block text-[11px] text-ink-tertiary">{new Date(h.submitted_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="min-h-[420px]">
          {!result ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-purple-text text-white">
                <PenLine className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-title text-ink-primary">{t("writing.emptyTitle")}</h3>
              <p className="mt-2 max-w-sm text-body text-ink-secondary">{t("writing.empty")}</p>
            </div>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="text-title text-ink-primary">Four ways to strengthen it</h2>
                <Badge tone="purple">No rewrite</Badge>
              </div>
              <FeedbackCard title={t("writing.clarity")} items={result.clarity_notes} />
              <FeedbackCard title={t("writing.citationGaps")} items={result.citation_gaps} />
              <FeedbackCard title={t("writing.grammar")} items={result.grammar_notes} />
              <FeedbackCard title={t("writing.suggestions")} items={result.suggestions} />
            </motion.div>
          )}
        </Card>
      </div>
    </div>
  );
}

function FeedbackCard({ title, items }: { title: string; items: string[] }) {
  return (
    <motion.div variants={staggerItem} className="rounded-xl bg-surface-sunken p-3">
      <h3 className="text-sm font-bold text-ink-primary">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-caption text-ink-tertiary">—</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-caption text-ink-secondary">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-purple-text" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
