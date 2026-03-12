import { useState } from "react";
import IntegratedAITab from "../components/analysis/IntegratedAITab";
import MarketingReactionTab from "../components/analysis/MarketingReactionTab";

type TabKey = "reaction" | "ai";

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  {
    key: "reaction",
    label: "反応カテゴリ",
    description: "広告文言から、ユーザーが反応しやすい訴求カテゴリを整理します。",
  },
  {
    key: "ai",
    label: "AI補助分析",
    description: "必要なときだけ、詳細な要因分析と補助インサイトを確認します。",
  },
];

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("reaction");

  const currentTab = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
              Analysis
            </p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">広告反応の整理</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              まずは反応カテゴリで全体像を見て、必要なときだけAIで深掘りする構成に絞っています。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900/40 dark:text-gray-300">
          {currentTab.description}
        </div>
      </section>

      {activeTab === "reaction" && <MarketingReactionTab />}
      {activeTab === "ai" && <IntegratedAITab />}
    </div>
  );
}
