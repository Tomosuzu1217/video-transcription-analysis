import { getAll, put, generateId, STORES } from "../services/db";
import { callGeminiJson } from "../services/gemini";
import { analyzeSegmentEmotions, calculateEmotionVolatility, detectPersuasionTechniques } from "../services/nlp";
import { getManagedTags } from "./settings";
import { getAllAdPerformance } from "./adPerformance";
import { supabase } from "../services/supabase";
import type {
  DashboardData,
  VideoRecord,
  TranscriptionRecord,
  ConversionRecord,
  AnalysisRecord,
  AdPerformance,
  CrossPlatformAnalysisResult,
  ABDeepComparisonResult,
  RankingPlatformInsightResult,
  MarketingReportResult,
  ContentSuggestion,
  KeywordItem,
  AiAnalysisResult,
  RankingComparisonResult,
  PsychologicalContentResult,
  MarketingReactionCategoryResult,
} from "../types";

type TranscriptSegment = TranscriptionRecord["segments"][number];

interface LoadedVideoData {
  name: string;
  videoId: number;
  transcript: string;
  segments: TranscriptSegment[];
  conversions: Record<string, number>;
  ranking: number | null;
  ranking_notes: string | null;
  code: string | null;
  adPerformance: AdPerformance | null;
}

function buildAdBlock(ad: AdPerformance): string {
  const fmt = (v: number | null, suffix = "") =>
    v !== null ? `${v.toLocaleString("ja-JP")}${suffix}` : "不明";
  return [
    "広告実績:",
    `  媒体=${ad.media}`,
    `  消化金額=${fmt(ad.spend, "円")}`,
    `  LINE追加=${fmt(ad.line_adds, "人")}`,
    `  回答数=${fmt(ad.answers, "件")}`,
    `  回答率=${fmt(ad.answer_rate, "%")}`,
    `  回答CPA=${fmt(ad.answer_cpa, "円")}`,
    `  顧客数=${fmt(ad.customers, "人")}`,
    `  成約数=${fmt(ad.contracts, "件")}`,
    `  売上=${fmt(ad.revenue, "円")}`,
    `  ROI=${fmt(ad.roi, "%")}`,
    `  事業貢献スコア=${fmt(ad.score)}`,
  ].join("\n");
}

export interface KeywordAnalysisResult {
  keywords: KeywordItem[];
  video_count: number;
}

export interface CorrelationAnalysisResult {
  correlations: Array<{
    keyword: string;
    avg_conversion_with: number;
    avg_conversion_without: number;
    effectiveness_score: number;
    video_count: number;
  }>;
  message?: string;
}

interface MarketingReactionCategoryDefinition {
  id: string;
  label: string;
  description: string;
  stage: "awareness" | "consideration" | "decision";
  reactionHypothesis: string;
  markers: string[];
}

const MARKETING_REACTION_CATEGORIES: MarketingReactionCategoryDefinition[] = [
  {
    id: "pain_empathy",
    label: "悩み共感",
    description: "不安や課題に寄り添い、当事者意識を起こす訴求です。",
    stage: "awareness",
    reactionHypothesis: "課題認知の初動反応を取りやすいカテゴリです。",
    markers: ["悩み", "不安", "心配", "迷", "困", "つら", "しんど", "できない", "失敗", "ありませんか"],
  },
  {
    id: "benefit_clarity",
    label: "便益訴求",
    description: "利用後に得られる変化やメリットを明確に伝える訴求です。",
    stage: "consideration",
    reactionHypothesis: "比較検討時の期待感を強めやすいカテゴリです。",
    markers: ["変わる", "改善", "ラク", "簡単", "効率", "成果", "結果", "叶", "実現", "メリット", "ベネフィット"],
  },
  {
    id: "trust_building",
    label: "信頼形成",
    description: "専門性、監修、運営実績などで安心感を作る訴求です。",
    stage: "consideration",
    reactionHypothesis: "意思決定前の不信感を下げるカテゴリです。",
    markers: ["専門", "監修", "実績", "安心", "信頼", "サポート", "創業", "運営", "経験", "プロ", "認定"],
  },
  {
    id: "social_proof",
    label: "社会的証明",
    description: "口コミ、利用者数、事例など第三者情報で後押しする訴求です。",
    stage: "consideration",
    reactionHypothesis: "他者の成功を見て行動しやすくなるカテゴリです。",
    markers: ["口コミ", "評判", "利用者", "お客様", "事例", "レビュー", "ランキング", "選ばれて", "支持", "満足度"],
  },
  {
    id: "specificity_evidence",
    label: "具体根拠",
    description: "数値、期間、比較などで説得力を高める訴求です。",
    stage: "consideration",
    reactionHypothesis: "曖昧さを減らし、納得反応を作るカテゴリです。",
    markers: ["%", "円", "日", "ヶ月", "倍", "人", "件", "データ", "数字", "統計", "比較", "平均"],
  },
  {
    id: "objection_relief",
    label: "不安解消",
    description: "費用、手間、失敗への懸念を先回りして下げる訴求です。",
    stage: "decision",
    reactionHypothesis: "申込直前の離脱を抑えやすいカテゴリです。",
    markers: ["無料", "返金", "相談", "保証", "安心", "サポート", "初心者", "はじめて", "リスク", "負担", "手間"],
  },
  {
    id: "urgency_offer",
    label: "緊急性オファー",
    description: "期限、限定性、特典で今動く理由を作る訴求です。",
    stage: "decision",
    reactionHypothesis: "意思決定を前倒ししやすいカテゴリです。",
    markers: ["今だけ", "限定", "本日", "先着", "締切", "期間限定", "急いで", "特典", "キャンペーン", "ラスト"],
  },
  {
    id: "action_prompt",
    label: "行動喚起",
    description: "登録、申込、相談など具体行動を明確に促す訴求です。",
    stage: "decision",
    reactionHypothesis: "視聴後の行動率に直結しやすいカテゴリです。",
    markers: ["登録", "申込", "申し込み", "予約", "相談", "チェック", "クリック", "詳細", "問い合わせ", "応募", "始めて"],
  },
];

function average(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return Math.round((filtered.reduce((sum, value) => sum + value, 0) / filtered.length) * 10) / 10;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function buildReactionSummary(result: MarketingReactionCategoryResult["category_overview"]): string {
  if (result.length === 0) return "反応カテゴリに該当する文言が見つかりませんでした。";
  const topMentions = result.slice(0, 2).map((item) => item.label).join("・");
  const topPerformers = [...result]
    .filter((item) => item.avg_ad_score !== null)
    .sort((a, b) => (b.avg_ad_score ?? 0) - (a.avg_ad_score ?? 0))
    .slice(0, 2)
    .map((item) => item.label)
    .join("・");
  if (!topPerformers) {
    return `出現量が多い反応カテゴリは ${topMentions} です。広告実績データとの紐付けが少ないため、まずはコード連携を増やすと判断精度が上がります。`;
  }
  return `出現量が多いカテゴリは ${topMentions}、実績が高い広告で相対的に強いカテゴリは ${topPerformers} です。ユーザー反応を見たい場合は、この差分を起点に訴求の強弱を比較できます。`;
}

async function loadVideosData(): Promise<LoadedVideoData[]> {
  const [videos, transcriptions, conversions, adPerfList] = await Promise.all([
    getAll<VideoRecord>(STORES.VIDEOS),
    getAll<TranscriptionRecord>(STORES.TRANSCRIPTIONS),
    getAll<ConversionRecord>(STORES.CONVERSIONS),
    getAllAdPerformance().catch(() => [] as AdPerformance[]),
  ]);

  const transcriptionsByVideo = new Map<number, { full_text: string; segments: TranscriptSegment[] }>();
  for (const t of transcriptions) {
    transcriptionsByVideo.set(t.video_id, { full_text: t.full_text, segments: t.segments ?? [] });
  }

  const conversionsByVideo = new Map<number, Record<string, number>>();
  for (const c of conversions) {
    if (!conversionsByVideo.has(c.video_id)) conversionsByVideo.set(c.video_id, {});
    conversionsByVideo.get(c.video_id)![c.metric_name] = c.metric_value;
  }

  const adPerfByCode = new Map<string, AdPerformance>();
  for (const ap of adPerfList) adPerfByCode.set(ap.code, ap);

  const result: LoadedVideoData[] = [];
  for (const v of videos) {
    if (v.status !== "transcribed" && v.status !== "archived") continue;
    const t = transcriptionsByVideo.get(v.id);
    if (!t) continue;
    const code = v.code ?? null;
    result.push({
      name: v.filename,
      videoId: v.id,
      transcript: t.full_text,
      segments: t.segments,
      conversions: conversionsByVideo.get(v.id) ?? {},
      ranking: v.ranking ?? null,
      ranking_notes: v.ranking_notes ?? null,
      code,
      adPerformance: code ? (adPerfByCode.get(code) ?? null) : null,
    });
  }
  return result;
}

async function saveAnalysis<TResult>(analysisType: string, scope: string, result: TResult, modelUsed?: string) {
  const id = generateId();
  await put(STORES.ANALYSES, {
    id,
    analysis_type: analysisType,
    scope,
    video_id: null,
    result_json: result,
    gemini_model_used: modelUsed ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function runKeywordAnalysis(platformTag?: string): Promise<KeywordAnalysisResult> {
  let videos = await loadVideosData();
  if (platformTag) {
    const allVideoRecords = await getAll<VideoRecord>(STORES.VIDEOS);
    const tagMap = new Map<number, string[]>();
    for (const v of allVideoRecords) tagMap.set(v.id, (v.tags ?? []) as string[]);
    videos = videos.filter((v) => (tagMap.get(v.videoId) ?? []).includes(platformTag));
  }
  if (videos.length === 0) throw new Error("書き起こし済みの動画がありません。先に動画を書き起こしてください。");

  const videoTexts = videos.map((v) => {
    const adStr = v.adPerformance ? `\n\n${buildAdBlock(v.adPerformance)}` : "";
    return `【${v.name}】\n${v.transcript}${adStr}`;
  }).join("\n\n---\n\n");

  const prompt = `以下の動画CMの書き起こしテキストから、キーワード頻度分析を行ってください。

${videoTexts}

上位50個のキーワードを抽出し、以下のJSON形式で返してください:
{
  "keywords": [
    {"keyword": "キーワード", "count": 10, "video_counts": {"動画名": 5}}
  ],
  "video_count": ${videos.length}
}

重要: 必ず有効なJSONのみを返してください。`;

  const result = await callGeminiJson<KeywordAnalysisResult>(prompt);
  const scope = platformTag ? `keyword_frequency:${platformTag}` : "keyword_frequency:all";
  await saveAnalysis("keyword_frequency", scope, result);
  return result;
}

export async function runCorrelationAnalysis(): Promise<CorrelationAnalysisResult> {
  const videos = await loadVideosData();
  const withData = videos.filter((v) => Object.keys(v.conversions).length > 0);
  if (withData.length < 2) {
    return { correlations: [], message: "分析には書き起こしとコンバージョンデータがある動画が2本以上必要です" };
  }

  const videoTexts = withData.map((v) => {
    const convStr = Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ");
    const adStr = v.adPerformance ? `\n${buildAdBlock(v.adPerformance)}` : "";
    return `【${v.name}】\nコンバージョン: ${convStr}\n書き起こし: ${v.transcript.slice(0, 500)}...${adStr}`;
  }).join("\n\n---\n\n");

  const prompt = `以下の動画CMのキーワードとコンバージョンデータの相関を分析してください。

${videoTexts}

各キーワードについて、そのキーワードを含む動画と含まない動画のコンバージョン平均を比較し、効果スコアを算出してください。

以下のJSON形式で返してください:
{
  "correlations": [
    {"keyword": "キーワード", "avg_conversion_with": 100, "avg_conversion_without": 50, "effectiveness_score": 2.0, "video_count": 3}
  ]
}

重要: 必ず有効なJSONのみを返してください。上位30個まで返してください。`;

  const result = await callGeminiJson<CorrelationAnalysisResult>(prompt);
  await saveAnalysis("correlation", "cross_video", result);
  return result;
}

export async function runMarketingReactionCategoryAnalysis(): Promise<MarketingReactionCategoryResult> {
  const videos = await loadVideosData();
  if (videos.length === 0) {
    throw new Error("書き起こし済みの動画がありません。先に文字起こしを完了してください。");
  }

  const videoResults: MarketingReactionCategoryResult["videos"] = videos.map((video) => {
    const categoryDetails = MARKETING_REACTION_CATEGORIES.map((category) => {
      const evidence = video.segments
        .map((segment) => {
          const markers = uniqueStrings(category.markers.filter((marker) => segment.text.includes(marker)));
          if (markers.length === 0) return null;
          return {
            start_time: segment.start_time,
            end_time: segment.end_time,
            text: segment.text.trim(),
            markers,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const markerHits = evidence.reduce((sum, item) => sum + item.markers.length, 0);
      const segmentHits = evidence.length;
      const matchedMarkers = uniqueStrings(evidence.flatMap((item) => item.markers));
      const score = Math.min(100, markerHits * 8 + segmentHits * 4);

      return {
        category_id: category.id,
        label: category.label,
        description: category.description,
        reaction_hypothesis: category.reactionHypothesis,
        stage: category.stage,
        score,
        segment_hits: segmentHits,
        marker_hits: markerHits,
        matched_markers: matchedMarkers,
        evidence: evidence.slice(0, 5),
      };
    })
      .filter((item) => item.marker_hits > 0)
      .sort((a, b) => b.score - a.score);

    const stageWeights = {
      awareness: 0,
      consideration: 0,
      decision: 0,
    };
    for (const detail of categoryDetails) stageWeights[detail.stage] += detail.score;
    const reactionStage = (Object.entries(stageWeights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "consideration") as "awareness" | "consideration" | "decision";

    return {
      video_id: video.videoId,
      video_name: video.name,
      code: video.code,
      media: video.adPerformance?.media ?? null,
      ad_score: video.adPerformance?.score ?? null,
      roi: video.adPerformance?.roi ?? null,
      contracts: video.adPerformance?.contracts ?? null,
      reaction_stage: reactionStage,
      top_categories: categoryDetails.slice(0, 3),
      category_details: categoryDetails,
    };
  });

  const categoryOverview = MARKETING_REACTION_CATEGORIES.map((category) => {
    const matchedVideos = videoResults
      .map((video) => ({
        video,
        detail: video.category_details.find((detail) => detail.category_id === category.id) ?? null,
      }))
      .filter((item): item is { video: MarketingReactionCategoryResult["videos"][number]; detail: MarketingReactionCategoryResult["videos"][number]["category_details"][number] } => item.detail !== null);

    const strongestMarkers = uniqueStrings(
      matchedVideos.flatMap((item) => item.detail.matched_markers),
    ).slice(0, 6);

    return {
      category_id: category.id,
      label: category.label,
      description: category.description,
      reaction_hypothesis: category.reactionHypothesis,
      stage: category.stage,
      matched_video_count: matchedVideos.length,
      total_marker_hits: matchedVideos.reduce((sum, item) => sum + item.detail.marker_hits, 0),
      avg_category_score: average(matchedVideos.map((item) => item.detail.score)) ?? 0,
      avg_ad_score: average(matchedVideos.map((item) => item.video.ad_score)),
      avg_roi: average(matchedVideos.map((item) => item.video.roi)),
      strongest_markers: strongestMarkers,
      top_videos: matchedVideos
        .sort((a, b) => {
          const scoreDiff = b.detail.score - a.detail.score;
          if (scoreDiff !== 0) return scoreDiff;
          return (b.video.ad_score ?? 0) - (a.video.ad_score ?? 0);
        })
        .slice(0, 3)
        .map((item) => ({
          video_name: item.video.video_name,
          score: item.detail.score,
          ad_score: item.video.ad_score,
          roi: item.video.roi,
        })),
    };
  })
    .filter((item) => item.matched_video_count > 0)
    .sort((a, b) => {
      const mentionDiff = b.total_marker_hits - a.total_marker_hits;
      if (mentionDiff !== 0) return mentionDiff;
      return b.avg_category_score - a.avg_category_score;
    });

  const result: MarketingReactionCategoryResult = {
    summary: buildReactionSummary(categoryOverview),
    analyzed_video_count: videoResults.length,
    category_overview: categoryOverview,
    videos: videoResults.sort((a, b) => {
      const scoreDiff = (b.ad_score ?? -Infinity) - (a.ad_score ?? -Infinity);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.top_categories[0]?.score ?? 0) - (a.top_categories[0]?.score ?? 0);
    }),
  };

  await saveAnalysis("marketing_reaction_category", "cross_video", result, "rule_based");
  return result;
}

export async function runAiRecommendations(customPrompt?: string): Promise<AiAnalysisResult> {
  const videos = await loadVideosData();
  if (videos.length === 0) throw new Error("書き起こし済みの動画がありません。");

  const videoSections = videos.map((v) => {
    const convStr = Object.keys(v.conversions).length > 0
      ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
      : "データなし";
    const adStr = v.adPerformance ? `\n\n${buildAdBlock(v.adPerformance)}` : "";
    return `### 動画: ${v.name}\n書き起こし:\n${v.transcript}\nコンバージョン: ${convStr}${adStr}`;
  }).join("\n\n");

  const customInstruction = customPrompt?.trim()
    ? `\n追加の分析指示:\n${customPrompt.trim()}\n\n上記の追加指示も考慮して分析してください。\n`
    : "";

  const prompt = `あなたは日本のCM（コマーシャル）分析の専門家です。
以下の動画CMの書き起こしテキストとコンバージョンデータを分析してください。

${videoSections}
${customInstruction}
以下の形式でJSON形式で分析結果を返してください:
{
  "summary": "全体的な分析サマリー（日本語）",
  "effective_keywords": [{"keyword": "キーワード", "reason": "効果的な理由", "appears_in": ["動画名"]}],
  "effective_phrases": [{"phrase": "フレーズ", "reason": "効果的な理由", "appears_in": ["動画名"]}],
  "correlation_insights": [{"insight": "発見内容", "confidence": "high/medium/low"}],
  "recommendations": [{"category": "カテゴリ", "recommendation": "具体的な提案", "priority": "high/medium/low"}],
  "funnel_suggestions": [{"stage": "ファネルステージ", "suggestion": "改善提案"}]
}

重要: 必ず有効なJSONのみを返してください。分析は日本語で行ってください。`;

  const result = await callGeminiJson<AiAnalysisResult>(prompt);
  await saveAnalysis("ai_recommendation", "cross_video", result, "gemini");
  return result;
}

export async function runRankingComparisonAnalysis(customPrompt?: string): Promise<RankingComparisonResult> {
  const videos = await loadVideosData();
  const ranked = videos.filter((v) => v.ranking !== null).sort((a, b) => (a.ranking ?? 99) - (b.ranking ?? 99));
  const topVideos = ranked.filter((v) => (v.ranking ?? 99) <= 3);
  const otherVideos = [...ranked.filter((v) => (v.ranking ?? 0) > 3), ...videos.filter((v) => v.ranking === null)].slice(0, 5);

  if (topVideos.length === 0) throw new Error("ランキング上位（1-3位）の動画がありません。");

  const topBlock = topVideos.map((v) => {
    const convStr = Object.keys(v.conversions).length > 0
      ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
      : "データなし";
    const adStr = v.adPerformance ? `\n\n${buildAdBlock(v.adPerformance)}` : "";
    return `### 【ランキング${v.ranking}位】 ${v.name}\n書き起こし:\n${v.transcript}\nコンバージョン: ${convStr}${adStr}`;
  }).join("\n\n");

  const otherBlock = otherVideos.length > 0
    ? otherVideos.map((v) => {
        const convStr = Object.keys(v.conversions).length > 0
          ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
          : "データなし";
        const rankStr = v.ranking ? `ランキング${v.ranking}位` : "ランキング未設定";
        const adStr = v.adPerformance ? `\n\n${buildAdBlock(v.adPerformance)}` : "";
        return `### 【${rankStr}】 ${v.name}\n書き起こし:\n${v.transcript}\nコンバージョン: ${convStr}${adStr}`;
      }).join("\n\n")
    : "（比較対象の動画がありません）";

  const customInstruction = customPrompt?.trim()
    ? `\n追加の分析指示:\n${customPrompt.trim()}\n\n上記の追加指示も考慮して分析してください。\n`
    : "";

  const prompt = `あなたは心理学とストーリーテリングの専門家で、CM（コマーシャル）の効果分析に精通しています。

## ランキング上位の動画
${topBlock}

## 比較対象の動画
${otherBlock}
${customInstruction}
ランキング上位の動画がなぜ優れているのかを、心理学的分析、ストーリーテリング分析、言語・表現分析の観点から詳細に分析してください。

以下の形式でJSON形式で分析結果を返してください:
{
  "summary": "全体的な分析サマリー",
  "psychological_analysis": [{"technique": "テクニック名", "description": "説明", "examples": ["具体例"], "effectiveness": "効果の説明"}],
  "storytelling_analysis": [{"element": "要素名", "description": "説明", "examples": ["具体例"], "impact": "影響"}],
  "linguistic_analysis": [{"technique": "テクニック名", "description": "説明", "examples": ["具体例"]}],
  "key_differences": [{"aspect": "比較観点", "top_videos": "上位の特徴", "other_videos": "他の特徴", "insight": "インサイト"}],
  "recommendations": [{"category": "カテゴリ", "recommendation": "提案", "priority": "high/medium/low"}]
}

重要: 必ず有効なJSONのみを返してください。分析は日本語で行ってください。`;

  const result = await callGeminiJson<RankingComparisonResult>(prompt);
  await saveAnalysis("ranking_comparison", "cross_video", result, "gemini");
  return result;
}

export async function runPsychologicalContentAnalysis(customPrompt?: string): Promise<PsychologicalContentResult & { nlp_preanalysis: unknown[] }> {
  const videos = await loadVideosData();
  if (videos.length === 0) throw new Error("書き起こし済みの動画がありません。");

  const nlpPreanalysis = [];
  const videoSections = [];

  for (const v of videos) {
    const emotionSegments = analyzeSegmentEmotions(v.segments);
    const volatility = calculateEmotionVolatility(emotionSegments);
    const persuasionTechniques = detectPersuasionTechniques(v.transcript);

    nlpPreanalysis.push({
      video_name: v.name,
      volatility,
      persuasion_techniques: persuasionTechniques,
      emotion_segments: emotionSegments.map((s) => ({
        start_time: s.start_time,
        end_time: s.end_time,
        emotion_score: s.emotion_score,
      })),
    });

    const convStr = Object.keys(v.conversions).length > 0
      ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
      : "データなし";

    const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
    const emotionTimeline = emotionSegments.map((s) => {
      const indicator = s.emotion_score > 0 ? "+" : s.emotion_score < 0 ? "-" : "=";
      let detail = "";
      if (s.positive_words.length) detail += ` ポジ:[${s.positive_words.join(",")}]`;
      if (s.negative_words.length) detail += ` ネガ:[${s.negative_words.join(",")}]`;
      return `  [${fmtTime(s.start_time)}-${fmtTime(s.end_time)}] スコア:${s.emotion_score > 0 ? "+" : ""}${s.emotion_score.toFixed(2)} (${indicator})${detail}`;
    }).join("\n");

    const volStr = `標準偏差: ${volatility.volatility_std}, 方向転換: ${volatility.direction_changes}回, 最大振幅: ${volatility.max_amplitude}`;
    const techStr = persuasionTechniques.map((t) => `  - ${t.technique}: ${t.matches.join(", ")}`).join("\n") || "  検出なし";

    const adStr = v.adPerformance ? `\n\n${buildAdBlock(v.adPerformance)}` : "";
    videoSections.push(
      `### 動画: ${v.name}\n書き起こし:\n${v.transcript}\n\nコンバージョン: ${convStr}${adStr}\n\n【NLP感情分析タイムライン】\n${emotionTimeline}\n\n【感情ボラティリティ指標】\n  ${volStr}\n\n【検出された説得技法】\n${techStr}`
    );
  }

  const customInstruction = customPrompt?.trim()
    ? `\n追加の分析指示:\n${customPrompt.trim()}\n\n上記の追加指示も考慮して分析してください。\n`
    : "";

  const prompt = `あなたは心理学、行動経済学、ストーリーテリングの専門家であり、動画広告のコンバージョン最適化に精通しています。
心理学的分析手法に基づき、以下の動画コンテンツを3つの軸で詳細に分析してください。

分析の目的: ネット広告の動画企画において、リンクからの登録（コンバージョン）を促す上で最も効果的な動画コンテンツの要素を特定すること。

## 分析対象の動画データ

${videoSections.join("\n\n---\n\n")}
${customInstruction}
## 分析フレームワーク
軸1: 感情ボラティリティ分析、軸2: 実用性・ストーリーテリング分析、軸3: コンバージョン導線・説得力分析

以下の形式でJSON形式で分析結果を返してください:
{
  "overall_summary": "全体的な分析サマリー",
  "emotion_volatility_analysis": {
    "summary": "感情ボラティリティの総合評価",
    "videos": [{"video_name": "動画名", "volatility_score": 8.5, "emotion_arc": "感情曲線の説明", "peak_moments": [{"timestamp_range": "0:30-0:45", "emotion": "驚き→期待", "description": "説明"}], "emotional_hooks": ["フックの説明"], "evaluation": "評価"}],
    "best_practices": ["ベストプラクティス"]
  },
  "storytelling_analysis": {
    "summary": "ストーリーテリングの総合評価",
    "videos": [{"video_name": "動画名", "story_structure": "物語構造", "practical_value_score": 7.0, "memorability_score": 8.0, "shareability_score": 6.5, "narrative_elements": [{"element": "要素名", "description": "説明", "example": "具体例"}], "hooks": ["フック"], "evaluation": "評価"}],
    "story_patterns": ["パターン分析"]
  },
  "conversion_pipeline_analysis": {
    "summary": "コンバージョン導線の総合評価",
    "videos": [{"video_name": "動画名", "persuasion_score": 8.0, "cta_analysis": {"cta_moments": [{"timestamp_range": "3:00-3:15", "technique": "希少性", "text": "テキスト", "effectiveness": "高"}], "flow_naturalness": "自然さの評価"}, "persuasion_techniques": [{"technique": "技法名", "description": "説明", "example": "具体例"}], "evaluation": "評価"}],
    "optimization_suggestions": ["提案"]
  },
  "metrics_correlation": {"completion_rate_factors": ["要因"], "ctr_factors": ["要因"], "conversion_rate_factors": ["要因"], "engagement_factors": ["要因"]},
  "cross_video_insights": [{"insight": "発見", "confidence": "high/medium/low", "actionable": "アクション"}],
  "recommendations": [{"category": "カテゴリ", "recommendation": "提案", "priority": "high/medium/low", "expected_impact": "効果"}]
}

重要: 必ず有効なJSONのみを返してください。分析は日本語で行ってください。スコアは1.0〜10.0の範囲で。`;

  const result = await callGeminiJson<PsychologicalContentResult & { nlp_preanalysis?: unknown[] }>(prompt);
  result.nlp_preanalysis = nlpPreanalysis;
  await saveAnalysis("psychological_content", "cross_video", result, "gemini");
  return result;
}

export async function runMarketingReport(customPrompt?: string): Promise<MarketingReportResult> {
  const videos = await loadVideosData();
  if (videos.length === 0) throw new Error("書き起こし済みの動画がありません。");

  // Collect NLP pre-analysis for each video
  const nlpSummaries: string[] = [];
  for (const v of videos) {
    const emotions = analyzeSegmentEmotions(v.segments);
    const volatility = calculateEmotionVolatility(emotions);
    const persuasion = detectPersuasionTechniques(v.transcript);
    const techList = persuasion.map((t) => `${t.technique}(${t.matches.length}件)`).join(", ") || "なし";
    nlpSummaries.push(
      `【${v.name}】ボラティリティ: 標準偏差${volatility.volatility_std.toFixed(2)}, 方向転換${volatility.direction_changes}回 / 説得技法: ${techList}`
    );
  }

  const videoSections = videos.map((v) => {
    const convStr = Object.keys(v.conversions).length > 0
      ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
      : "データなし";
    const adStr = v.adPerformance ? `\n\n${buildAdBlock(v.adPerformance)}` : "";
    return `### ${v.name}${v.ranking ? ` (ランキング${v.ranking}位)` : ""}\n書き起こし:\n${v.transcript.slice(0, 800)}\nコンバージョン: ${convStr}${adStr}`;
  }).join("\n\n---\n\n");

  const customInstruction = customPrompt?.trim()
    ? `\n追加の分析指示:\n${customPrompt.trim()}\n`
    : "";

  const prompt = `あなたはマーケティング戦略コンサルタントです。以下の動画CM分析データに基づいて、包括的なマーケティングレポートを作成してください。

## 動画データ
${videoSections}

## NLP分析サマリー
${nlpSummaries.join("\n")}
${customInstruction}
以下のJSON形式で返してください:
{
  "executive_summary": "経営層向けの要約（3-5文）",
  "target_audience_analysis": [{"segment": "ターゲット層", "description": "特徴", "effective_videos": ["効果的な動画名"], "key_messages": ["刺さるメッセージ"]}],
  "competitive_advantages": [{"advantage": "強み", "evidence": "根拠", "leverage_suggestion": "活用方法"}],
  "content_performance_matrix": [{"video_name": "動画名", "strengths": ["強み"], "weaknesses": ["弱み"], "overall_score": 8.0}],
  "improvement_priorities": [{"area": "改善領域", "current_state": "現状", "recommended_action": "推奨アクション", "expected_impact": "期待効果", "priority": "high/medium/low"}],
  "next_video_direction": {"theme": "次回テーマ", "key_messages": ["メッセージ"], "recommended_structure": "推奨構成", "target_emotion_arc": "目標感情曲線", "estimated_effectiveness": "予想効果"}
}

重要: 必ず有効なJSONのみを返してください。分析は日本語で行ってください。スコアは1.0〜10.0の範囲で。`;

  const result = await callGeminiJson<MarketingReportResult>(prompt);
  await saveAnalysis("marketing_report", "cross_video", result, "gemini");
  return result;
}

export async function runContentSuggestion(customPrompt?: string): Promise<ContentSuggestion> {
  const videos = await loadVideosData();
  if (videos.length === 0) throw new Error("書き起こし済みの動画がありません。");

  const ranked = [...videos].sort((a, b) => (a.ranking ?? 99) - (b.ranking ?? 99));
  const topVideos = ranked.filter((v) => v.ranking !== null).slice(0, 5);
  const reference = topVideos.length > 0 ? topVideos : videos.slice(0, 3);

  const videoSections = reference.map((v) => {
    const convStr = Object.keys(v.conversions).length > 0
      ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
      : "データなし";
    const emotions = analyzeSegmentEmotions(v.segments);
    const volatility = calculateEmotionVolatility(emotions);
    const persuasion = detectPersuasionTechniques(v.transcript);
    const techList = persuasion.map((t) => t.technique).join(", ") || "なし";
    const adStr = v.adPerformance ? `\n${buildAdBlock(v.adPerformance)}` : "";
    return `### ${v.name}${v.ranking ? ` (${v.ranking}位)` : ""}\n書き起こし:\n${v.transcript.slice(0, 600)}\nCV: ${convStr}\nボラティリティ: ${volatility.volatility_std.toFixed(2)} / 説得技法: ${techList}${adStr}`;
  }).join("\n\n---\n\n");

  const customInstruction = customPrompt?.trim()
    ? `\n追加指示:\n${customPrompt.trim()}\n`
    : "";

  const prompt = `あなたは動画CMの企画・脚本のプロフェッショナルです。
以下の高パフォーマンス動画データを分析し、次に制作すべき動画の具体的な台本素案を生成してください。

## 参考動画データ
${videoSections}
${customInstruction}
以下のJSON形式で返してください:
{
  "script_outline": "台本の概要（300-500文字）。冒頭・展開・CTA の流れを記述",
  "key_messages": ["メッセージ1", "メッセージ2", "メッセージ3"],
  "recommended_structure": "推奨構成（秒数付き）。例: 0-5秒フック→5-20秒問題提起→...",
  "timing_guide": "全体尺の目安と各パートの秒数配分",
  "target_emotion_arc": "狙う感情曲線の説明。例: 驚き→共感→期待→行動",
  "reference_videos": ["参考にした動画名1", "動画名2"]
}

重要: 必ず有効なJSONのみを返してください。日本語で記述してください。`;

  const result = await callGeminiJson<ContentSuggestion>(prompt);
  await saveAnalysis("content_suggestion", "cross_video", result, "gemini");
  return result;
}

export async function runPlatformAnalysis(managedTags?: string[]): Promise<CrossPlatformAnalysisResult> {
  const videos = await getAll<VideoRecord>(STORES.VIDEOS);
  const transcriptions = await getAll<TranscriptionRecord>(STORES.TRANSCRIPTIONS);
  const conversions = await getAll<ConversionRecord>(STORES.CONVERSIONS);

  const transcriptionsByVideo = new Map<number, { full_text: string; segments: TranscriptSegment[] }>();
  for (const t of transcriptions) {
    transcriptionsByVideo.set(t.video_id, { full_text: t.full_text, segments: t.segments ?? [] });
  }
  const conversionsByVideo = new Map<number, Record<string, number>>();
  for (const c of conversions) {
    if (!conversionsByVideo.has(c.video_id)) conversionsByVideo.set(c.video_id, {});
    conversionsByVideo.get(c.video_id)![c.metric_name] = c.metric_value;
  }

  const adPerfList = await getAllAdPerformance().catch(() => [] as AdPerformance[]);
  const adPerfByCode = new Map<string, AdPerformance>();
  for (const ap of adPerfList) adPerfByCode.set(ap.code, ap);

  const tags = managedTags ?? await getManagedTags();
  const platformSet = new Set(tags);
  const platformGroups = new Map<string, Array<{ name: string; transcript: string; conversions: Record<string, number>; duration: number | null; adPerformance: AdPerformance | null }>>();

  for (const v of videos) {
    if (v.status !== "transcribed" && v.status !== "archived") continue;
    const t = transcriptionsByVideo.get(v.id);
    if (!t) continue;
    const tags = (v.tags ?? []) as string[];
    const platforms = tags.filter((tag) => platformSet.has(tag));
    if (platforms.length === 0) continue;
    const adPerf = v.code ? (adPerfByCode.get(v.code) ?? null) : null;
    for (const p of platforms) {
      if (!platformGroups.has(p)) platformGroups.set(p, []);
      platformGroups.get(p)!.push({
        name: v.filename,
        transcript: t.full_text.slice(0, 500),
        conversions: conversionsByVideo.get(v.id) ?? {},
        duration: v.duration_seconds ?? null,
        adPerformance: adPerf,
      });
    }
  }

  if (platformGroups.size === 0) {
    throw new Error("媒体タグ（YouTube, TikTok等）が付いた書き起こし済み動画がありません。動画にタグを追加してください。");
  }

  const platformSections = Array.from(platformGroups.entries()).map(([platform, vids]) => {
    const vidDetails = vids.map((v) => {
      const convStr = Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ");
      const adStr = v.adPerformance ? `\n    ${buildAdBlock(v.adPerformance).replace(/\n/g, "\n    ")}` : "";
      return `  - ${v.name}（${v.duration ? Math.round(v.duration) + "秒" : "不明"}）\n    書き起こし抜粋: ${v.transcript.slice(0, 200)}...\n    指標: ${convStr || "なし"}${adStr}`;
    }).join("\n");
    return `### ${platform}（${vids.length}本）\n${vidDetails}`;
  }).join("\n\n");

  const prompt = `あなたは広告媒体の専門アナリストです。以下の動画データを媒体別に分析し、各プラットフォームでどのような動画コンテンツ・文章・ストーリーが効果的かを分析してください。

## 媒体別の特性（分析の参考にしてください）
- YouTube: 長尺OK（2-10分）、SEO重要、サムネイル/冒頭5秒のフック重視、教育・エンタメ・レビュー系が強い
- TikTok: 15-60秒が最適、最初1秒が勝負、トレンド活用、縦型、カジュアルな語り口、テンポ重視
- Instagram: ビジュアル重視、リール15-30秒、ストーリーズ連動、ハッシュタグ戦略、ブランド世界観
- Facebook: 30代以上がメイン、シェア誘導、コミュニティ感、テキスト補足重要、感情に訴える
- LINE: 短尺（15秒以下）、直接的CTA、クーポン/プロモ連動、親近感、日常的トーン
- X(Twitter): 15-45秒、強いメッセージ、RT誘導、時事性、テキスト連動、議論を生む内容

## 動画データ
${platformSections}

以下のJSON形式で返してください:
{
  "summary": "全体分析サマリー（200-300文字）",
  "platform_analyses": [
    {
      "platform": "媒体名",
      "video_count": 数値,
      "avg_metrics": {"指標名": 平均値, ...},
      "best_video": {"name": "動画名", "reason": "選定理由"} または null,
      "content_characteristics": {
        "optimal_duration": "この媒体での最適な尺",
        "effective_hooks": ["効果的な冒頭のつかみ方1", "つかみ方2"],
        "storytelling_pattern": "効果的なストーリー構成パターン",
        "tone_and_style": "推奨トーン・スタイル",
        "cta_strategy": "効果的なCTA戦略"
      },
      "platform_specific_insights": ["この媒体固有の気づき1", "気づき2"],
      "recommendations": [
        {"area": "改善領域", "suggestion": "具体的提案", "priority": "high/medium/low"}
      ]
    }
  ],
  "cross_platform_insights": [
    {"insight": "媒体横断の気づき", "actionable": "具体的アクション"}
  ],
  "content_repurposing_suggestions": [
    {"from_platform": "転用元", "to_platform": "転用先", "adaptation_needed": "必要な調整"}
  ]
}

重要: 必ず有効なJSONのみを返してください。日本語で記述してください。`;

  const result = await callGeminiJson<CrossPlatformAnalysisResult>(prompt);
  await saveAnalysis("platform_analysis", "cross_platform", result, "gemini");
  return result;
}

export async function runABDeepComparison(videoIdA: number, videoIdB: number): Promise<ABDeepComparisonResult> {
  const allVideos = await loadVideosData();
  const videoA = allVideos.find((v) => v.videoId === videoIdA);
  const videoB = allVideos.find((v) => v.videoId === videoIdB);
  if (!videoA || !videoB) throw new Error("選択した動画の書き起こしデータが見つかりません。");

  // NLP pre-analysis for both
  const buildNlpContext = (v: typeof videoA) => {
    const emotions = analyzeSegmentEmotions(v.segments);
    const volatility = calculateEmotionVolatility(emotions);
    const persuasion = detectPersuasionTechniques(v.transcript);
    const techList = persuasion.map((t) => `${t.technique}(${t.matches.slice(0, 3).join(",")})`).join(", ") || "検出なし";
    return `ボラティリティ: 標準偏差${volatility.volatility_std.toFixed(2)}, 方向転換${volatility.direction_changes}回, 最大振幅${volatility.max_amplitude.toFixed(2)} / 説得技法: ${techList}`;
  };

  const buildVideoBlock = (v: typeof videoA, label: string) => {
    const convStr = Object.keys(v.conversions).length > 0
      ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
      : "データなし";
    const rankStr = v.ranking ? `ランキング${v.ranking}位` : "ランキング未設定";
    const adStr = v.adPerformance ? `\n\n${buildAdBlock(v.adPerformance)}` : "";
    return `### 動画${label}: ${v.name}（${rankStr}）\n書き起こし:\n${v.transcript}\nコンバージョン: ${convStr}\nNLP分析: ${buildNlpContext(v)}${adStr}`;
  };

  const prompt = `あなたは心理学・マーケティング・ストーリーテリングの専門家です。
以下の2つの動画CMを詳細に比較分析してください。各動画のターゲットペルソナ（年齢層・性別・興味・ペインポイント）を推定し、訴求力・構成・感情設計の観点から優劣を判定してください。

${buildVideoBlock(videoA, "A")}

---

${buildVideoBlock(videoB, "B")}

以下のJSON形式で返してください:
{
  "summary": "比較分析の総合サマリー（200-300文字）",
  "video_a_profile": {
    "name": "${videoA.name}",
    "strengths": ["強み1", "強み2", "強み3"],
    "weaknesses": ["弱み1", "弱み2"],
    "target_persona": {"age_range": "25-34歳", "gender": "男女", "interests": ["興味1"], "pain_points": ["悩み1"]},
    "persuasion_score": 7.5,
    "storytelling_score": 8.0
  },
  "video_b_profile": {
    "name": "${videoB.name}",
    "strengths": ["強み1", "強み2"],
    "weaknesses": ["弱み1", "弱み2"],
    "target_persona": {"age_range": "18-24歳", "gender": "女性", "interests": ["興味1"], "pain_points": ["悩み1"]},
    "persuasion_score": 6.0,
    "storytelling_score": 7.0
  },
  "key_differences": [
    {"aspect": "比較観点", "video_a": "Aの特徴", "video_b": "Bの特徴", "winner": "A or B or 引き分け", "reason": "判定理由"}
  ],
  "persona_fit_analysis": {
    "better_for_young": "A or B",
    "better_for_older": "A or B",
    "better_for_action": "A or B",
    "explanation": "ペルソナ適合の詳細説明"
  },
  "recommendations": [
    {"target": "A or B or 両方", "suggestion": "改善提案", "priority": "high/medium/low"}
  ]
}

重要: 必ず有効なJSONのみを返してください。分析は日本語で行ってください。スコアは1.0〜10.0の範囲で。
比較観点は最低5つ以上（冒頭の掴み、ストーリー構成、感情設計、CTA、ペルソナ適合度、言語表現など）含めてください。`;

  const result = await callGeminiJson<ABDeepComparisonResult>(prompt);
  await saveAnalysis("ab_deep_comparison", `${videoA.name} vs ${videoB.name}`, result, "gemini");
  return result;
}

export async function runRankingPlatformInsight(managedTags?: string[]): Promise<RankingPlatformInsightResult> {
  const allVideos = await loadVideosData();
  if (allVideos.length === 0) throw new Error("書き起こし済みの動画がありません。");

  const tags = managedTags ?? await getManagedTags();
  const allVideoRecords = await getAll<VideoRecord>(STORES.VIDEOS);
  const videoTagMap = new Map<number, string[]>();
  for (const v of allVideoRecords) videoTagMap.set(v.id, (v.tags ?? []) as string[]);

  // Build platform × ranking grouping
  const platformGroups = new Map<string, { top: typeof allVideos; low: typeof allVideos }>();
  for (const tag of tags) platformGroups.set(tag, { top: [], low: [] });

  for (const v of allVideos) {
    const vTags = videoTagMap.get(v.videoId) ?? [];
    for (const tag of vTags) {
      if (!platformGroups.has(tag)) continue;
      const group = platformGroups.get(tag)!;
      if (v.ranking !== null && v.ranking <= 3) {
        group.top.push(v);
      } else {
        group.low.push(v);
      }
    }
  }

  // Filter out platforms with no videos
  const activePlatforms = Array.from(platformGroups.entries()).filter(([, g]) => g.top.length + g.low.length > 0);
  if (activePlatforms.length === 0) {
    throw new Error("媒体タグが付いた書き起こし済み動画がありません。動画にタグを追加してください。");
  }

  // Build NLP summaries
  const nlpForVideo = (v: typeof allVideos[0]) => {
    const emotions = analyzeSegmentEmotions(v.segments);
    const volatility = calculateEmotionVolatility(emotions);
    const persuasion = detectPersuasionTechniques(v.transcript);
    const techList = persuasion.map((t) => t.technique).join(", ") || "なし";
    return `ボラティリティ${volatility.volatility_std.toFixed(2)} / 技法:${techList}`;
  };

  const platformSections = activePlatforms.map(([platform, { top, low }]) => {
    const topBlock = top.length > 0
      ? top.map((v) => {
          const convStr = Object.entries(v.conversions).map(([k, val]) => `${k}:${val}`).join(", ") || "なし";
          const adStr = v.adPerformance ? `\n      ${buildAdBlock(v.adPerformance).replace(/\n/g, "\n      ")}` : "";
          return `    [${v.ranking}位] ${v.name}\n      書き起こし: ${v.transcript.slice(0, 300)}...\n      CV: ${convStr}\n      NLP: ${nlpForVideo(v)}${adStr}`;
        }).join("\n")
      : "    （上位動画なし）";

    const lowBlock = low.length > 0
      ? low.slice(0, 3).map((v) => {
          const convStr = Object.entries(v.conversions).map(([k, val]) => `${k}:${val}`).join(", ") || "なし";
          const rankStr = v.ranking ? `${v.ranking}位` : "未設定";
          const adStr = v.adPerformance ? `\n      ${buildAdBlock(v.adPerformance).replace(/\n/g, "\n      ")}` : "";
          return `    [${rankStr}] ${v.name}\n      書き起こし: ${v.transcript.slice(0, 300)}...\n      CV: ${convStr}\n      NLP: ${nlpForVideo(v)}${adStr}`;
        }).join("\n")
      : "    （比較対象なし）";

    return `### ${platform}（上位${top.length}本 / その他${low.length}本）\n  ■ ランキング上位:\n${topBlock}\n  ■ その他:\n${lowBlock}`;
  }).join("\n\n");

  const prompt = `あなたはマーケティング戦略・消費者心理・広告クリエイティブの専門家です。
以下のデータは、ネット広告動画のランキング（人が評価した優劣順位）と配信先SNS媒体別のグルーピングです。

## 分析の目的
1. 各媒体において、ランキング上位の動画がなぜヒットしているのかを特定する
2. 各媒体のターゲットペルソナ（年齢・性別・ライフスタイル・購入トリガー）を推定する
3. 上位と下位の決定的な違い（ヒット要因）を抽出する
4. 媒体別の具体的なコンテンツ戦略を提案する

## データ
${platformSections}

以下のJSON形式で返してください:
{
  "overall_summary": "全体分析サマリー（300-500文字）",
  "platform_ranking_matrix": [
    {
      "platform": "媒体名",
      "top_videos": [{"name": "動画名", "ranking": 1, "hit_factors": ["ヒット要因1", "要因2"]}],
      "low_videos": [{"name": "動画名", "ranking": null, "weak_points": ["弱点1"]}],
      "platform_success_formula": "この媒体での成功方程式"
    }
  ],
  "persona_profiles": [
    {
      "platform": "媒体名",
      "primary_persona": {
        "age_range": "25-34歳",
        "gender": "男性中心",
        "lifestyle": "ライフスタイル記述",
        "media_consumption": "メディア接触パターン",
        "purchase_triggers": ["トリガー1", "トリガー2"],
        "content_preferences": ["好むコンテンツ形式1"]
      },
      "secondary_persona": {"age_range": "35-44歳", "gender": "女性", "lifestyle": "記述"} or null
    }
  ],
  "hit_factor_analysis": [
    {
      "factor": "要因名",
      "importance": "critical/high/medium",
      "top_video_usage": "上位動画での使われ方",
      "low_video_gap": "下位動画に足りないもの",
      "platforms_where_effective": ["YouTube", "TikTok"]
    }
  ],
  "cross_platform_persona_insights": [
    {"insight": "媒体横断の気づき", "actionable": "具体的アクション"}
  ],
  "content_strategy_by_platform": [
    {
      "platform": "媒体名",
      "ideal_length": "推奨尺",
      "hook_strategy": "冒頭のフック戦略",
      "persona_messaging": "ペルソナに刺さるメッセージング戦略",
      "cta_approach": "CTA設計",
      "sample_script_outline": "台本概要（100-200文字）"
    }
  ]
}

重要: 必ず有効なJSONのみを返してください。分析は日本語で行ってください。
hit_factor_analysisは最低5つ以上の要因を含めてください。
ペルソナは具体的に（「20代女性」ではなく「22-28歳、都市在住、SNSでトレンドをチェック、美容・健康に関心が高い」のように）記述してください。`;

  const result = await callGeminiJson<RankingPlatformInsightResult>(prompt);
  await saveAnalysis("ranking_platform_insight", "cross_platform_ranking", result, "gemini");
  return result;
}

export async function getAnalysisResults(type?: string): Promise<Array<{
  id: number;
  analysis_type: string;
  scope: string;
  video_id: number | null;
  result: unknown;
  gemini_model_used: string | null;
  created_at: string;
}>> {
  let query = supabase
    .from("analyses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (type) {
    query = query.eq("analysis_type", type);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as AnalysisRecord[]).map((d) => ({
    id: d.id,
    analysis_type: d.analysis_type,
    scope: d.scope,
    video_id: d.video_id,
    result: d.result_json ?? {},
    gemini_model_used: d.gemini_model_used,
    created_at: d.created_at,
  }));
}

export async function getDashboard(): Promise<DashboardData> {
  const allVideos = await getAll<VideoRecord>(STORES.VIDEOS);
  const allConversions = await getAll<ConversionRecord>(STORES.CONVERSIONS);

  let totalVideos = 0, transcribed = 0, processing = 0, errorCount = 0;
  const durations: number[] = [];
  const videoSummaries: DashboardData["video_summaries"] = [];

  const convByVideo = new Map<number, Record<string, number>>();
  for (const c of allConversions) {
    if (!convByVideo.has(c.video_id)) convByVideo.set(c.video_id, {});
    convByVideo.get(c.video_id)![c.metric_name] = c.metric_value;
  }

  for (const v of allVideos) {
    totalVideos++;
    if (v.status === "transcribed") transcribed++;
    else if (v.status === "uploaded" || v.status === "transcribing") processing++;
    else if (v.status === "error") errorCount++;
    if (v.duration_seconds) durations.push(v.duration_seconds);
    videoSummaries.push({
      id: v.id,
      filename: v.filename,
      status: v.status,
      duration_seconds: v.duration_seconds,
      conversions: convByVideo.get(v.id) ?? {},
    });
  }

  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length * 10) / 10 : null;
  const totalDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) * 10) / 10 : null;

  let topKeywords: KeywordItem[] = [];
  const { data: kwData } = await supabase
    .from("analyses")
    .select("result_json")
    .eq("analysis_type", "keyword_frequency")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (kwData) {
    topKeywords = (kwData.result_json?.keywords ?? []).slice(0, 20);
  }

  let latestAi: AiAnalysisResult | null = null;
  const { data: aiData } = await supabase
    .from("analyses")
    .select("result_json")
    .eq("analysis_type", "ai_recommendation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (aiData) {
    latestAi = aiData.result_json;
  }

  return {
    total_videos: totalVideos,
    transcribed_videos: transcribed,
    processing_videos: processing,
    error_videos: errorCount,
    avg_duration_seconds: avgDuration,
    total_duration_seconds: totalDuration,
    total_conversions: allConversions.length,
    top_keywords: topKeywords,
    video_summaries: videoSummaries,
    latest_ai_recommendations: latestAi,
  };
}

export async function getAnalysisHistory(
  limit = 20,
  offset = 0,
): Promise<{ results: AnalysisRecord[]; total: number }> {
  const { data, error, count } = await supabase
    .from("analyses")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    results: (data ?? []) as AnalysisRecord[],
    total: count ?? 0,
  };
}
