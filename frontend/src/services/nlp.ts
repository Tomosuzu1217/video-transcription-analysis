/**
 * Client-side NLP utilities ported from Python backend.
 * Emotion word dictionaries & persuasion technique detection.
 */

const POSITIVE_WORDS = new Set([
  "嬉しい", "楽しい", "素晴らしい", "最高", "成功", "幸せ", "安心", "希望", "感動",
  "自由", "効果", "簡単", "得", "実証", "科学", "証明", "改善", "向上", "達成",
  "可能", "解決", "メリット", "チャンス", "秘密", "発見", "驚き", "新しい", "画期的",
  "革命", "最新", "特別", "優れる", "凄い", "面白い", "魅力", "感謝", "豊か",
  "快適", "理想", "満足", "信頼", "実現", "成長", "上がる", "増える", "高まる",
  "喜び", "笑顔", "元気", "健康", "美しい", "輝く", "夢", "好き", "愛",
  "勝つ", "強い", "賢い", "正しい", "良い", "素敵", "最強", "完璧", "究極",
]);

const NEGATIVE_WORDS = new Set([
  "不安", "怖い", "失敗", "危険", "損", "後悔", "問題", "困難", "辛い", "悲しい",
  "心配", "リスク", "地獄", "最悪", "罠", "間違い", "嘘", "騙す", "無駄",
  "苦しい", "痛い", "ストレス", "疲れる", "嫌", "ダメ", "悪い", "弱い", "落ちる",
  "減る", "下がる", "壊れる", "消える", "負ける", "病気", "老化", "衰える",
  "孤独", "絶望", "恐怖", "悩み", "困る", "焦る", "怒り", "イライラ", "退屈",
  "つまらない", "惨め", "劣る", "遅い", "難しい", "複雑", "面倒", "障害",
  "崩壊", "破綻", "限界", "暴落", "低下", "悪化", "深刻", "致命的",
]);

const TECHNIQUE_DICTIONARIES: Record<string, Set<string>> = {
  "緊急性・限定性": new Set([
    "今すぐ", "限定", "残り", "急いで", "本日", "特別", "無料", "チャンス",
    "期間限定", "数量限定", "先着", "早い者勝ち", "今だけ", "今回だけ",
    "最後", "ラスト", "締め切り", "間に合う", "見逃す",
  ]),
  "社会的証明": new Set([
    "万人", "人気", "話題", "注目", "評価", "研究", "論文", "データ", "実験",
    "科学的", "エビデンス", "証拠", "統計", "調査", "結果", "ハーバード",
    "スタンフォード", "大学", "教授", "専門家", "世界的", "有名",
    "ベストセラー", "売れる", "選ばれる", "支持", "推薦", "口コミ",
  ]),
  "権威性": new Set([
    "専門家", "教授", "博士", "研究者", "科学者", "医師", "プロ",
    "権威", "第一人者", "実績", "経験", "資格", "認定", "公式",
    "論文", "学術", "査読", "発表", "受賞", "著書",
  ]),
  "希少性": new Set([
    "限定", "残り", "在庫", "品切れ", "売り切れ", "数量",
    "先着", "今だけ", "特別", "独占", "唯一", "希少", "レア",
  ]),
};

export interface EmotionSegment {
  start_time: number;
  end_time: number;
  text: string;
  emotion_score: number;
  positive_words: string[];
  negative_words: string[];
}

export function analyzeSegmentEmotions(
  segments: { start_time: number; end_time: number; text: string }[],
): EmotionSegment[] {
  return segments.map((seg) => {
    const text = seg.text;
    if (!text.trim()) {
      return { ...seg, emotion_score: 0, positive_words: [], negative_words: [] };
    }
    const posFound = new Set<string>();
    const negFound = new Set<string>();
    for (const w of POSITIVE_WORDS) if (text.includes(w)) posFound.add(w);
    for (const w of NEGATIVE_WORDS) if (text.includes(w)) negFound.add(w);
    const total = posFound.size + negFound.size;
    const score = total === 0 ? 0 : (posFound.size - negFound.size) / total;
    return {
      start_time: seg.start_time,
      end_time: seg.end_time,
      text,
      emotion_score: Math.round(score * 1000) / 1000,
      positive_words: [...posFound],
      negative_words: [...negFound],
    };
  });
}

export interface VolatilityMetrics {
  volatility_std: number;
  direction_changes: number;
  max_amplitude: number;
  avg_score: number;
  score_range: number;
}

export function calculateEmotionVolatility(segments: EmotionSegment[]): VolatilityMetrics {
  const scores = segments.map((s) => s.emotion_score);
  if (scores.length === 0) {
    return { volatility_std: 0, direction_changes: 0, max_amplitude: 0, avg_score: 0, score_range: 0 };
  }
  const n = scores.length;
  const avg = scores.reduce((a, b) => a + b, 0) / n;
  const variance = scores.reduce((a, s) => a + (s - avg) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  let directionChanges = 0;
  let prevNonzero: number | null = null;
  for (const s of scores) {
    if (s !== 0) {
      if (prevNonzero !== null && (s > 0) !== (prevNonzero > 0)) directionChanges++;
      prevNonzero = s;
    }
  }

  let maxAmp = 0;
  for (let i = 1; i < n; i++) {
    const amp = Math.abs(scores[i] - scores[i - 1]);
    if (amp > maxAmp) maxAmp = amp;
  }

  return {
    volatility_std: Math.round(std * 10000) / 10000,
    direction_changes: directionChanges,
    max_amplitude: Math.round(maxAmp * 10000) / 10000,
    avg_score: Math.round(avg * 10000) / 10000,
    score_range: Math.round((Math.max(...scores) - Math.min(...scores)) * 10000) / 10000,
  };
}

export interface PersuasionTechnique {
  technique: string;
  category: string;
  matches: string[];
}

export function detectPersuasionTechniques(text: string): PersuasionTechnique[] {
  if (!text.trim()) return [];
  const results: PersuasionTechnique[] = [];
  for (const [category, wordSet] of Object.entries(TECHNIQUE_DICTIONARIES)) {
    const matches: string[] = [];
    for (const w of wordSet) if (text.includes(w)) matches.push(w);
    if (matches.length > 0) {
      results.push({ technique: category, category, matches: [...new Set(matches)].sort() });
    }
  }
  return results;
}
