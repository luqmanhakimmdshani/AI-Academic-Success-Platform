"use client";

import { motion } from "motion/react";
import { Download, FileText, Link2, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { fieldControlClass } from "@/components/ui/Field";
import { staggerContainer, staggerItem } from "@/components/ui/motionPresets";
import PageHeader from "@/components/ui/PageHeader";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface ReferenceEntryOut {
  title: string;
  authors: string;
  year: number | null;
  doi: string;
  url: string;
  credibility_tier: string;
  credibility_basis: string;
  annotation: string;
  formatted_apa: string;
  resolved: boolean;
}

interface ReferenceListOut {
  id: string;
  title: string;
  entries: ReferenceEntryOut[];
}

interface ReferenceListHistoryItem {
  id: string;
  title: string;
  entry_count: number;
  created_at: string;
}

const TIER_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  peer_reviewed: "success",
  grey_literature: "warning",
  non_academic: "danger",
  unknown: "neutral",
};

export default function SourcesPage() {
  const { t, locale } = useI18n();
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<ReferenceListOut | null>(null);
  const [history, setHistory] = useState<ReferenceListHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadHistory = () => {
    api
      .get<ReferenceListHistoryItem[]>("/api/sources/history")
      .then(setHistory)
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const openHistoryItem = async (id: string) => {
    setError(null);
    try {
      const res = await api.get<ReferenceListOut>(`/api/sources/${id}`);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.error"));
    }
  };

  const onExport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      await api.download(`/api/sources/${result.id}/export.docx`, "references.docx");
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
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20);
    try {
      const res = await api.post<ReferenceListOut>("/api/sources/organize", { entries, language: locale });
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
      <PageHeader eyebrow={t("sources.eyebrow")} title={t("sources.title")} description={t("sources.description")} />

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
        <div className="flex flex-col gap-5">
          <Card className="h-fit">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-ink-primary">
                <Link2 className="h-4 w-4 text-ink-secondary" />
                {t("sources.title")}
              </div>
              <span className="text-caption text-ink-tertiary">one per line</span>
            </div>
            <form onSubmit={onSubmit} className="mt-4">
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={t("sources.placeholder")}
                required
                rows={8}
                className={`${fieldControlClass} resize-y`}
              />
              <Button type="submit" loading={loading} className="mt-4 w-full">
                {!loading && <Sparkles className="h-4 w-4" />}
                {t("sources.submit")}
              </Button>
            </form>
            {error && <p className="mt-3 text-caption text-danger-text">{error}</p>}
          </Card>

          <Card className="h-fit">
            <span className="text-sm font-bold text-ink-primary">{t("sources.history")}</span>
            <div className="mt-3 space-y-1.5">
              {history.length === 0 && <p className="text-caption text-ink-tertiary">{t("sources.noHistory")}</p>}
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => openHistoryItem(h.id)}
                  className={
                    "block w-full min-w-0 rounded-lg px-2.5 py-2 text-left text-caption transition-colors " +
                    (h.id === result?.id ? "bg-brand-tint text-brand-700" : "text-ink-secondary hover:bg-surface-sunken")
                  }
                >
                  <span className="block truncate font-medium">{h.title}</span>
                  <span className="block text-[11px] text-ink-tertiary">{new Date(h.created_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="min-h-[420px]">
          {!result ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-neutral-text text-white">
                <FileText className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-title text-ink-primary">{t("sources.emptyTitle")}</h3>
              <p className="mt-2 max-w-sm text-body text-ink-secondary">{t("sources.empty")}</p>
            </div>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-3">
              <div className="flex justify-end">
                <Button type="button" variant="secondary" loading={exporting} onClick={onExport}>
                  {!exporting && <Download className="h-4 w-4" />}
                  {t("sources.exportWord")}
                </Button>
              </div>
              {result.entries.map((entry, i) => (
                <motion.div key={i} variants={staggerItem} className="rounded-xl border border-line p-4">
                  {entry.resolved ? (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-ink-primary">{entry.title}</h3>
                        <Badge tone={TIER_TONE[entry.credibility_tier] ?? "neutral"} className="shrink-0">
                          {t(`sources.credibility.${entry.credibility_tier}`)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-caption text-ink-tertiary">{entry.credibility_basis}</p>
                      {entry.annotation && <p className="mt-2 text-body text-ink-secondary">{entry.annotation}</p>}
                      <p className="mt-2 rounded-lg bg-surface-sunken p-2 text-caption text-ink-secondary">{entry.formatted_apa}</p>
                    </>
                  ) : (
                    <p className="text-body text-danger-text">
                      {t("sources.unresolved")}: {entry.title}
                    </p>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </Card>
      </div>
    </div>
  );
}
