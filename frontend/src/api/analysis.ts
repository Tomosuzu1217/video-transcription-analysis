import { db } from "../firebase";
import {
  collection, doc, getDocs, setDoc, query, where, orderBy, limit as firestoreLimit,
} from "firebase/firestore";
import { callGeminiJson } from "../services/gemini";
import { analyzeSegmentEmotions, calculateEmotionVolatility, detectPersuasionTechniques } from "../services/nlp";
import type { DashboardData } from "../types";

function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

// ─── Helper: load all transcribed videos with conversions ───
async function loadVideosData(): Promise<Array<{
  name: string;
  videoId: number;
  transcript: string;
  segments: { start_time: number; end_time: number; text: string }[];
  conversions: Record<string, number>;
  ranking: number | null;
  ranking_notes: string | null;
}>> {
  const vSnap = await getDocs(collection(db, "videos"));
  const tSnap = await getDocs(collection(db, "transcriptions"));
  const cSnap = await getDocs(collection(db, "conversions"));

  const transcriptionsByVideo = new Map<number, { full_text: string; segments: any[] }>();
  for (const d of tSnap.docs) {
    const data = d.data();
    transcriptionsByVideo.set(data.videoId, { full_text: data.full_text, segments: data.segments ?? [] });
  }

  const conversionsByVideo = new Map<number, Record<string, number>>();
  for (const d of cSnap.docs) {
    const data = d.data();
    if (!conversionsByVideo.has(data.video_id)) conversionsByVideo.set(data.video_id, {});
    conversionsByVideo.get(data.video_id)![data.metric_name] = data.metric_value;
  }

  const result = [];
  for (const vDoc of vSnap.docs) {
    const v = vDoc.data();
    if (v.status !== "transcribed") continue;
    const t = transcriptionsByVideo.get(v.id);
    if (!t) continue;
    result.push({
      name: v.filename,
      videoId: v.id,
      transcript: t.full_text,
      segments: t.segments,
      conversions: conversionsByVideo.get(v.id) ?? {},
      ranking: v.ranking ?? null,
      ranking_notes: v.ranking_notes ?? null,
    });
  }
  return result;
}

async function saveAnalysis(analysisType: string, scope: string, result: any, modelUsed?: string) {
  const id = generateId();
  await setDoc(doc(db, "analyses", String(id)), {
    id,
    analysis_type: analysisType,
    scope,
    video_id: null,
    result_json: result,
    gemini_model_used: modelUsed ?? null,
    created_at: new Date().toISOString(),
  });
}

// ─── Keyword Analysis (via Gemini) ───
export async function runKeywordAnalysis(): Promise<any> {
  const videos = await loadVideosData();
  if (videos.length === 0) return { keywords: [], video_count: 0 };

  const videoTexts = videos.map((v) => `【${v.name}】\n${v.transcript}`).join("\n\n---\n\n");

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

  const result = await callGeminiJson(prompt);
  await saveAnalysis("keyword_frequency", "cross_video", result);
  return result;
}

export async function runVideoKeywordAnalysis(videoId: number): Promise<any> {
  const videos = await loadVideosData();
  const video = videos.find((v) => v.videoId === videoId);
  if (!video) throw new Error("動画が見つかりません");

  const prompt = `以下の動画CMの書き起こしテキストからキーワードとフレーズを抽出してください。

${video.transcript}

以下のJSON形式で返してください:
{
  "video_id": ${videoId},
  "video_filename": "${video.name}",
  "keywords": [{"keyword": "キーワード", "count": 5}],
  "phrases": [{"phrase": "2語フレーズ", "count": 3}]
}

重要: 必ず有効なJSONのみを返してください。`;

  const result = await callGeminiJson(prompt);
  await saveAnalysis("keyword_frequency", "single_video", result);
  return result;
}

// ─── Correlation Analysis (via Gemini) ───
export async function runCorrelationAnalysis(): Promise<any> {
  const videos = await loadVideosData();
  const withData = videos.filter((v) => Object.keys(v.conversions).length > 0);
  if (withData.length < 2) {
    return { correlations: [], message: "分析には書き起こしとコンバージョンデータがある動画が2本以上必要です" };
  }

  const videoTexts = withData.map((v) => {
    const convStr = Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ");
    return `【${v.name}】\nコンバージョン: ${convStr}\n書き起こし: ${v.transcript.slice(0, 500)}...`;
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

  const result = await callGeminiJson(prompt);
  await saveAnalysis("correlation", "cross_video", result);
  return result;
}

// ─── AI Recommendations ───
export async function runAiRecommendations(customPrompt?: string): Promise<any> {
  const videos = await loadVideosData();
  if (videos.length === 0) throw new Error("書き起こし済みの動画がありません。");

  const videoSections = videos.map((v) => {
    const convStr = Object.keys(v.conversions).length > 0
      ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
      : "データなし";
    return `### 動画: ${v.name}\n書き起こし:\n${v.transcript}\nコンバージョン: ${convStr}`;
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

  const result = await callGeminiJson(prompt);
  await saveAnalysis("ai_recommendation", "cross_video", result, "gemini");
  return result;
}

// ─── Ranking Comparison ───
export async function runRankingComparisonAnalysis(customPrompt?: string): Promise<any> {
  const videos = await loadVideosData();
  const ranked = videos.filter((v) => v.ranking !== null).sort((a, b) => (a.ranking ?? 99) - (b.ranking ?? 99));
  const topVideos = ranked.filter((v) => (v.ranking ?? 99) <= 3);
  const otherVideos = [...ranked.filter((v) => (v.ranking ?? 0) > 3), ...videos.filter((v) => v.ranking === null)].slice(0, 5);

  if (topVideos.length === 0) throw new Error("ランキング上位（1-3位）の動画がありません。");

  const topBlock = topVideos.map((v) => {
    const convStr = Object.keys(v.conversions).length > 0
      ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
      : "データなし";
    return `### 【ランキング${v.ranking}位】 ${v.name}\n書き起こし:\n${v.transcript}\nコンバージョン: ${convStr}`;
  }).join("\n\n");

  const otherBlock = otherVideos.length > 0
    ? otherVideos.map((v) => {
        const convStr = Object.keys(v.conversions).length > 0
          ? Object.entries(v.conversions).map(([k, val]) => `${k}: ${val}`).join(", ")
          : "データなし";
        const rankStr = v.ranking ? `ランキング${v.ranking}位` : "ランキング未設定";
        return `### 【${rankStr}】 ${v.name}\n書き起こし:\n${v.transcript}\nコンバージョン: ${convStr}`;
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

  const result = await callGeminiJson(prompt);
  await saveAnalysis("ranking_comparison", "cross_video", result, "gemini");
  return result;
}

// ─── Psychological Content Analysis ───
export async function runPsychologicalContentAnalysis(customPrompt?: string): Promise<any> {
  const videos = await loadVideosData();
  if (videos.length === 0) throw new Error("書き起こし済みの動画がありません。");

  // NLP pre-analysis
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

    videoSections.push(
      `### 動画: ${v.name}\n書き起こし:\n${v.transcript}\n\nコンバージョン: ${convStr}\n\n【NLP感情分析タイムライン】\n${emotionTimeline}\n\n【感情ボラティリティ指標】\n  ${volStr}\n\n【検出された説得技法】\n${techStr}`
    );
  }

  const customInstruction = customPrompt?.trim()
    ? `\n追加の分析指示:\n${customPrompt.trim()}\n\n上記の追加指示も考慮して分析してください。\n`
    : "";

  const prompt = `あなたは心理学、行動経済学、ストーリーテリングの専門家であり、動画広告のコンバージョン最適化に精通しています。
Dラボ（メンタリストDaiGo）のメソッドに基づき、以下の動画コンテンツを3つの軸で詳細に分析してください。

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

  const result = await callGeminiJson(prompt) as any;
  // Attach NLP pre-analysis data
  result.nlp_preanalysis = nlpPreanalysis;
  await saveAnalysis("psychological_content", "cross_video", result, "gemini");
  return result;
}

// ─── Analysis Results History ───
export async function getAnalysisResults(type?: string): Promise<any[]> {
  let q;
  if (type) {
    q = query(collection(db, "analyses"), where("analysis_type", "==", type), orderBy("created_at", "desc"));
  } else {
    q = query(collection(db, "analyses"), orderBy("created_at", "desc"));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: data.id,
      analysis_type: data.analysis_type,
      scope: data.scope,
      video_id: data.video_id,
      result: data.result_json ?? {},
      gemini_model_used: data.gemini_model_used,
      created_at: data.created_at,
    };
  });
}

// ─── Dashboard ───
export async function getDashboard(): Promise<DashboardData> {
  const vSnap = await getDocs(collection(db, "videos"));
  const cSnap = await getDocs(collection(db, "conversions"));

  let totalVideos = 0, transcribed = 0, processing = 0, errorCount = 0;
  const durations: number[] = [];
  const videoSummaries: any[] = [];

  const convByVideo = new Map<number, Record<string, number>>();
  for (const d of cSnap.docs) {
    const data = d.data();
    if (!convByVideo.has(data.video_id)) convByVideo.set(data.video_id, {});
    convByVideo.get(data.video_id)![data.metric_name] = data.metric_value;
  }

  for (const vDoc of vSnap.docs) {
    const v = vDoc.data();
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

  // Get latest keyword analysis
  let topKeywords: any[] = [];
  const kwQ = query(collection(db, "analyses"), where("analysis_type", "==", "keyword_frequency"), orderBy("created_at", "desc"), firestoreLimit(1));
  const kwSnap = await getDocs(kwQ);
  if (!kwSnap.empty) {
    const kwData = kwSnap.docs[0].data().result_json;
    topKeywords = (kwData?.keywords ?? []).slice(0, 20);
  }

  // Get latest AI recommendations
  let latestAi = null;
  const aiQ = query(collection(db, "analyses"), where("analysis_type", "==", "ai_recommendation"), orderBy("created_at", "desc"), firestoreLimit(1));
  const aiSnap = await getDocs(aiQ);
  if (!aiSnap.empty) {
    latestAi = aiSnap.docs[0].data().result_json;
  }

  return {
    total_videos: totalVideos,
    transcribed_videos: transcribed,
    processing_videos: processing,
    error_videos: errorCount,
    avg_duration_seconds: avgDuration,
    total_duration_seconds: totalDuration,
    total_conversions: cSnap.size,
    top_keywords: topKeywords,
    video_summaries: videoSummaries,
    latest_ai_recommendations: latestAi,
  };
}
