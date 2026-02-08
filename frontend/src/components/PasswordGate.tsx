import { useState, useEffect, type ReactNode } from "react";

const PASSWORD_HASH = import.meta.env.VITE_APP_PASSWORD_HASH as string;
const SESSION_KEY = "authenticated";

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function PasswordGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Skip gate if no password hash is configured
    if (!PASSWORD_HASH) {
      setAuthenticated(true);
      setChecking(false);
      return;
    }
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored === PASSWORD_HASH) {
      setAuthenticated(true);
    }
    setChecking(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const hash = await sha256(password);
    if (hash === PASSWORD_HASH) {
      sessionStorage.setItem(SESSION_KEY, PASSWORD_HASH);
      setAuthenticated(true);
    } else {
      setError("パスワードが正しくありません");
    }
  };

  if (checking) return null;
  if (authenticated) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <h1 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
          動画CM分析
        </h1>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-6">
          アクセスにはパスワードが必要です
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            autoFocus
          />
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            className="w-full mt-4 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}
