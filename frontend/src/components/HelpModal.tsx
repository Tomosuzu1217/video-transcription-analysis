import { useState } from "react";

const sections = [
  {
    id: "overview",
    title: "このアプリについて",
    content: [
      "「動画CM分析」は、動画CMの書き起こし・分析を行うツールです。",
      "動画をアップロードすると、AIが自動で音声を文字に起こし、キーワード分析やコンバージョンとの相関分析を行えます。",
    ],
  },
  {
    id: "first-setup",
    title: "はじめに: 初期設定",
    content: [
      "まず、AI分析機能を使うために Google AI Studio の APIキーを設定します。",
    ],
    steps: [
      "画面上部の「設定」タブをクリックします。",
      "Google AI Studio (https://aistudio.google.com/apikey) にアクセスし、Googleアカウントでログインします。",
      "「APIキーを作成」をクリックし、表示されたキーをコピーします。",
      "設定画面の入力欄にキーを貼り付けて「追加」を押します。",
      "「全キーをテスト」ボタンで、キーが正しく動作するか確認できます。",
      "複数のキーを登録すると、使用量の制限に達した時に自動で次のキーに切り替わります。",
    ],
  },
  {
    id: "upload",
    title: "STEP 1: 動画をアップロードする",
    content: [
      "「動画管理」タブから動画ファイルをアップロードします。",
    ],
    steps: [
      "画面上部の「動画管理」タブをクリックします。",
      "アップロード方法は2つあります:",
      "  -- 方法A: 点線の枠内に動画ファイルをドラッグ&ドロップする",
      "  -- 方法B: 「ファイルを選択」ボタンをクリックしてファイルを選ぶ",
      "複数のファイルを同時にアップロードできます。",
      "アップロードが始まると、進捗バーとファイル名が表示されます。",
      "完了すると、動画一覧にカードが追加されます。",
    ],
    tips: [
      "動画形式: mp4, mov, avi, mkv, webm, wmv, flv, mpeg, mpg, m4v, 3gp, ts, mts, m2ts, ogv, vob",
      "音声形式: mp3, wav, aac, ogg, flac, wma, m4a, opus",
      "最大ファイルサイズ: 500MB",
      "一度に最大20ファイルまでアップロード可能",
    ],
  },
  {
    id: "transcription",
    title: "STEP 2: 書き起こしを確認する",
    content: [
      "アップロードが完了すると、自動で書き起こし処理が始まります。",
    ],
    steps: [
      "動画カードのステータスを確認します:",
      "  -- 「アップロード済」: 書き起こし待ちの状態",
      "  -- 「書き起こし中」: AIが音声をテキストに変換中（黄色で点滅）",
      "  -- 「書き起こし完了」: 完了（緑色で表示）",
      "  -- 「エラー」: 処理に失敗（赤色で表示）",
      "動画カードをクリックすると、詳細画面が開きます。",
      "詳細画面では以下のことができます:",
      "  -- 動画の再生（再生速度の変更: 0.5x 〜 2.0x）",
      "  -- 書き起こしテキストの確認（タイムスタンプ付き）",
      "  -- テキストのコピー、TXT/SRT/VTT/JSON形式でのダウンロード",
      "エラーが出た場合は「再書き起こし」ボタンで再試行できます。",
    ],
  },
  {
    id: "conversion",
    title: "STEP 3: コンバージョンデータを登録する",
    content: [
      "各動画にコンバージョン（成果指標）データを登録すると、キーワードとの相関分析ができるようになります。",
    ],
    steps: [
      "動画の詳細画面を開きます（動画カードをクリック）。",
      "画面下部の「コンバージョン」セクションを見つけます。",
      "「指標名」に項目名を入力します（例: クリック数、登録数、売上など）。",
      "「値」に数値を入力します。",
      "必要に応じて「備考」を入力します。",
      "「追加」ボタンを押して登録します。",
      "登録後、鉛筆アイコンで編集、ゴミ箱アイコンで削除できます。",
    ],
    tips: [
      "2本以上の動画にコンバージョンデータを登録すると、相関分析が使えるようになります。",
    ],
  },
  {
    id: "analysis",
    title: "STEP 4: 分析する",
    content: [
      "「分析」タブから各種分析を実行できます。",
    ],
    steps: [
      "画面上部の「分析」タブをクリックします。",
      "4つのタブから分析の種類を選びます:",
      "",
      "--- キーワード分析 ---",
      "全動画のテキストからよく使われるキーワードを抽出し、出現回数を表示します。",
      "「キーワード分析を実行」ボタンを押すと開始します。",
      "",
      "--- 相関分析 ---",
      "キーワードの有無とコンバージョン数値の関連性を分析します。",
      "「効果スコア」が高いキーワードほど、良い成果につながる傾向があります。",
      "",
      "--- AIレコメンド ---",
      "Gemini AIが動画全体を分析し、改善提案を生成します。",
      "分析は数ステップで進み、各ステップの進捗が画面に表示されます。",
      "※ この機能にはAPIキーの設定が必要です。",
      "",
      "--- テキスト検索 ---",
      "全動画の書き起こしテキストを横断検索できます。",
      "検索結果から該当動画に直接ジャンプできます。",
    ],
    tips: [
      "キーワード分析と相関分析の結果はCSVでダウンロードできます。",
    ],
  },
  {
    id: "dashboard",
    title: "ダッシュボードの見方",
    content: [
      "「ダッシュボード」タブでは、全体の状況をひと目で把握できます。",
    ],
    steps: [
      "上部のカード: 動画数・書き起こし状況・処理時間・コンバージョン数の概要",
      "各項目の意味:",
      "  -- 動画数: アップロード済みの総動画数",
      "  -- 書き起こし完了: テキスト変換が終わった動画数",
      "  -- 処理中/エラー: 現在処理中またはエラーの動画数",
      "  -- 平均再生時間: 全動画の平均の長さ",
      "  -- CV数: 登録されているコンバージョンデータの総数",
    ],
  },
  {
    id: "settings",
    title: "設定の使い方",
    content: [
      "「設定」タブでAPIキーとAIモデルを管理します。",
    ],
    steps: [
      "--- APIキー管理 ---",
      "「追加」: 新しいAPIキーを入力して登録します。",
      "「全キーをテスト」: 登録済みの全キーが有効かチェックします。",
      "ゴミ箱アイコン: 不要なキーを削除します。",
      "キーは安全のためマスク表示されます（先頭4文字と末尾4文字のみ表示）。",
      "",
      "--- モデル選択 ---",
      "AI分析に使うGeminiモデルを選択できます。",
      "無料枠で使う場合は「Gemini 2.5 Flash」または「Gemini 2.0 Flash」を推奨します。",
      "リストにないモデル名も手入力で指定できます。",
    ],
  },
  {
    id: "tips",
    title: "便利な使い方・コツ",
    content: [],
    steps: [
      "動画管理画面の検索ボックスでファイル名を絞り込めます。",
      "動画の詳細画面でファイル名をクリックすると名前を変更できます。",
      "書き起こしテキストの各行にはタイムスタンプが付いています。",
      "再生速度を0.5xにすると、聞き取りにくい箇所を確認しやすくなります。",
      "複数のGoogleアカウントでAPIキーを作ると、無料枠の制限を回避しやすくなります。",
      "書き起こしでエラーが出た場合は「再書き起こし」ボタンで再試行してください。",
    ],
  },
  {
    id: "troubleshooting",
    title: "よくあるトラブル",
    content: [],
    steps: [
      "--- 書き起こしが終わらない ---",
      "初回起動時はWhisperモデル（約3GB）のダウンロードが必要です。",
      "動画の長さに応じて処理に時間がかかります。画面は自動更新されます。",
      "",
      "--- AI分析が実行できない ---",
      "「設定」タブでAPIキーが正しく登録されているか確認してください。",
      "「全キーをテスト」で「有効」と表示されるか確認してください。",
      "",
      "--- アップロードに失敗する ---",
      "ファイルサイズが500MBを超えていないか確認してください。",
      "対応していない動画形式の場合は変換してからアップロードしてください。",
      "",
      "--- 相関分析が実行できない ---",
      "書き起こし済みでコンバージョンデータがある動画が2本以上必要です。",
    ],
  },
];

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  const [activeSection, setActiveSection] = useState("overview");

  if (!open) return null;

  const current = sections.find((s) => s.id === activeSection) ?? sections[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative flex w-full max-w-4xl max-h-[85vh] rounded-xl bg-white shadow-2xl overflow-hidden mx-4">
        {/* Sidebar */}
        <nav className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
          <div className="px-4 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">操作マニュアル</h2>
          </div>
          <ul className="py-2">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    activeSection === s.id
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">{current.title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {current.content.map((p, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">{p}</p>
            ))}

            {current.steps && (
              <ol className="space-y-1.5">
                {current.steps.map((step, i) => {
                  // Section header lines (--- xxx ---)
                  if (step.startsWith("---") && step.endsWith("---")) {
                    return (
                      <li key={i} className="pt-3 pb-1">
                        <p className="text-sm font-semibold text-gray-800">
                          {step.replace(/^-+\s*/, "").replace(/\s*-+$/, "")}
                        </p>
                      </li>
                    );
                  }
                  // Blank line
                  if (step === "") {
                    return <li key={i} className="h-2" />;
                  }
                  // Sub-item (indented with --)
                  if (step.startsWith("  --")) {
                    return (
                      <li key={i} className="flex gap-2 pl-6 text-sm text-gray-600">
                        <span className="shrink-0 text-gray-400">-</span>
                        <span>{step.replace(/^\s*--\s*/, "")}</span>
                      </li>
                    );
                  }
                  // Normal step
                  return (
                    <li key={i} className="flex gap-3 text-sm text-gray-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed pt-0.5">{step}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {current.tips && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">ヒント</p>
                <ul className="space-y-1">
                  {current.tips.map((tip, i) => (
                    <li key={i} className="text-sm text-amber-800">{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
