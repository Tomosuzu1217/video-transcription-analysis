import { useState, useEffect } from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import { logout } from "./services/authSession";
import VideosPage from "./pages/VideosPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import AnalysisPage from "./pages/AnalysisPage";
import SettingsPage from "./pages/SettingsPage";
import MarketingDashboardPage from "./pages/MarketingDashboardPage";
import AdDataPage from "./pages/AdDataPage";
import HelpModal from "./components/HelpModal";

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-bold text-gray-200 dark:text-gray-700">404</p>
      <p className="mt-4 text-lg font-medium text-gray-600 dark:text-gray-400">ページが見つかりません</p>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
      >
        ダッシュボードに戻る
      </Link>
    </div>
  );
}

function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">動画CM分析</h1>
              <div className="flex gap-1">
                {[
                  { to: "/", label: "ダッシュボード" },
                  { to: "/videos", label: "動画一覧" },
                  { to: "/analysis", label: "分析" },
                  { to: "/ad-data", label: "広告データ" },
                  { to: "/settings", label: "設定" },
                ].map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === "/"}
                    className={({ isActive }) =>
                      `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                          : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDark(!dark)}
                className="flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1.5 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                title={dark ? "ライトモードに切替" : "ダークモードに切替"}
              >
                {dark ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => setHelpOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ヘルプ
              </button>

              <button
                onClick={() => {
                  if (window.confirm("ログアウトしますか？")) logout();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                title="ログアウト"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </nav>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<MarketingDashboardPage />} />
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/videos/:id" element={<VideoDetailPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/ad-data" element={<AdDataPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
