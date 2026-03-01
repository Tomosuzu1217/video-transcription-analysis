export interface VideoThumbnail {
  time: number;
  storage_path: string;
}

export interface Video {
  id: number;
  filename: string;
  file_size: number | null;
  duration_seconds: number | null;
  status: "uploaded" | "transcribing" | "transcribed" | "error" | "archived";
  error_message: string | null;
  ranking: number | null;
  ranking_notes: string | null;
  code: string | null;
  storage_path: string;
  tags: string[];
  thumbnails: VideoThumbnail[];
  created_at: string;
  updated_at: string;
}

export interface TranscriptionSegment {
  id: number;
  start_time: number;
  end_time: number;
  text: string;
}

export interface Transcription {
  id: number;
  video_id: number;
  full_text: string;
  language: string;
  model_used: string | null;
  processing_time_seconds: number | null;
  edited: boolean;
  edited_at: string | null;
  created_at: string;
  segments: TranscriptionSegment[];
}

export interface TranscriptionStatus {
  video_id: number;
  status: "pending" | "transcribing" | "completed" | "error";
  transcription: Transcription | null;
}

export interface Conversion {
  id: number;
  video_id: number;
  metric_name: string;
  metric_value: number;
  date_recorded: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversionSummary {
  video_id: number;
  video_filename: string;
  metrics: Record<string, number>;
}

export interface KeywordItem {
  keyword: string;
  count: number;
  video_counts: Record<string, number>;
}

export interface CorrelationItem {
  keyword: string;
  avg_conversion_with: number;
  avg_conversion_without: number;
  effectiveness_score: number;
  video_count: number;
}

export interface AiAnalysisResult {
  summary: string;
  effective_keywords: Array<{ keyword: string; reason: string; appears_in: string[] }>;
  effective_phrases: Array<{ phrase: string; reason: string; appears_in: string[] }>;
  correlation_insights: Array<{ insight: string; confidence: string }>;
  recommendations: Array<{ category: string; recommendation: string; priority: string }>;
  funnel_suggestions: Array<{ stage: string; suggestion: string }>;
}

export interface RankingComparisonResult {
  summary: string;
  psychological_analysis: Array<{
    technique: string;
    description: string;
    examples: string[];
    effectiveness: string;
  }>;
  storytelling_analysis: Array<{
    element: string;
    description: string;
    examples: string[];
    impact: string;
  }>;
  linguistic_analysis: Array<{
    technique: string;
    description: string;
    examples: string[];
  }>;
  key_differences: Array<{
    aspect: string;
    top_videos: string;
    other_videos: string;
    insight: string;
  }>;
  recommendations: Array<{
    category: string;
    recommendation: string;
    priority: string;
  }>;
}

export interface PsychologicalContentResult {
  overall_summary: string;
  emotion_volatility_analysis: {
    summary: string;
    videos: Array<{
      video_name: string;
      volatility_score: number;
      emotion_arc: string;
      peak_moments: Array<{
        timestamp_range: string;
        emotion: string;
        description: string;
      }>;
      emotional_hooks: string[];
      evaluation: string;
    }>;
    best_practices: string[];
  };
  storytelling_analysis: {
    summary: string;
    videos: Array<{
      video_name: string;
      story_structure: string;
      practical_value_score: number;
      memorability_score: number;
      shareability_score: number;
      narrative_elements: Array<{
        element: string;
        description: string;
        example: string;
      }>;
      hooks: string[];
      evaluation: string;
    }>;
    story_patterns: string[];
  };
  conversion_pipeline_analysis: {
    summary: string;
    videos: Array<{
      video_name: string;
      persuasion_score: number;
      cta_analysis: {
        cta_moments: Array<{
          timestamp_range: string;
          technique: string;
          text: string;
          effectiveness: string;
        }>;
        flow_naturalness: string;
      };
      persuasion_techniques: Array<{
        technique: string;
        description: string;
        example: string;
      }>;
      evaluation: string;
    }>;
    optimization_suggestions: string[];
  };
  metrics_correlation: {
    completion_rate_factors: string[];
    ctr_factors: string[];
    conversion_rate_factors: string[];
    engagement_factors: string[];
  };
  cross_video_insights: Array<{
    insight: string;
    confidence: string;
    actionable: string;
  }>;
  recommendations: Array<{
    category: string;
    recommendation: string;
    priority: string;
    expected_impact: string;
  }>;
  nlp_preanalysis: Array<{
    video_name: string;
    volatility: {
      volatility_std: number;
      direction_changes: number;
      max_amplitude: number;
      avg_score: number;
      score_range: number;
    };
    persuasion_techniques: Array<{
      technique: string;
      category: string;
      matches: string[];
    }>;
    emotion_segments: Array<{
      start_time: number;
      end_time: number;
      emotion_score: number;
    }>;
  }>;
}

export interface MarketingReportResult {
  executive_summary: string;
  target_audience_analysis: Array<{
    segment: string;
    description: string;
    effective_videos: string[];
    key_messages: string[];
  }>;
  competitive_advantages: Array<{
    advantage: string;
    evidence: string;
    leverage_suggestion: string;
  }>;
  content_performance_matrix: Array<{
    video_name: string;
    strengths: string[];
    weaknesses: string[];
    overall_score: number;
  }>;
  improvement_priorities: Array<{
    area: string;
    current_state: string;
    recommended_action: string;
    expected_impact: string;
    priority: string;
  }>;
  next_video_direction: {
    theme: string;
    key_messages: string[];
    recommended_structure: string;
    target_emotion_arc: string;
    estimated_effectiveness: string;
  };
}

// ---- A/B Test, Competitor, Alert Types ----

export interface ABTest {
  id: number;
  name: string;
  video_a_id: number;
  video_b_id: number;
  target_metric: string;
  status: "draft" | "running" | "completed";
  notes: string | null;
  created_at: string;
}

export interface ABTestResult {
  test: ABTest;
  video_a_name: string;
  video_b_name: string;
  value_a: number | null;
  value_b: number | null;
  lift_percent: number | null;
  z_score: number | null;
  significant: boolean;
}

export interface Competitor {
  id: number;
  name: string;
  metrics: Record<string, number>;
  notes: string | null;
  created_at: string;
}

export interface Alert {
  id: number;
  metric_name: string;
  condition: "above" | "below";
  threshold: number;
  video_id: number | null;
  enabled: boolean;
  created_at: string;
}

export interface TriggeredAlert extends Alert {
  current_value: number;
  video_filename: string;
}

export interface FunnelStage {
  name: string;
  value: number;
  rate: number | null;
}

export interface ContentSuggestion {
  script_outline: string;
  key_messages: string[];
  recommended_structure: string;
  timing_guide: string;
  target_emotion_arc: string;
  reference_videos: string[];
}

// ---- Ad Performance Types ----

export const AD_MEDIA_TYPES = [
  "Meta広告", "Tik広告", "Go広告", "SEO", "ASP", "公式Insta",
] as const;
export type AdMediaType = (typeof AD_MEDIA_TYPES)[number];

export interface AdPerformance {
  id: number;
  code: string;
  media: string;
  rank: number | null;
  spend: number | null;
  line_adds: number | null;
  answers: number | null;
  answer_rate: number | null;
  answer_cpa: number | null;
  customers: number | null;
  contracts: number | null;
  revenue: number | null;
  roi: number | null;
  score: number | null;
  imported_at: string;
}

export interface AdPerformanceImportRow {
  code: string;
  media: string;
  rank: number | null;
  spend: number | null;
  line_adds: number | null;
  answers: number | null;
  answer_rate: number | null;
  answer_cpa: number | null;
  customers: number | null;
  contracts: number | null;
  revenue: number | null;
  roi: number | null;
  score: number | null;
}

// ---- Ad Platform Analysis Types ----

export const AD_PLATFORMS = [
  "YouTube", "TikTok", "Instagram", "Facebook", "LINE", "X(Twitter)",
] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export interface PlatformAnalysisResult {
  platform: string;
  video_count: number;
  avg_metrics: Record<string, number>;
  best_video: { name: string; reason: string } | null;
  content_characteristics: {
    optimal_duration: string;
    effective_hooks: string[];
    storytelling_pattern: string;
    tone_and_style: string;
    cta_strategy: string;
  };
  platform_specific_insights: string[];
  recommendations: Array<{
    area: string;
    suggestion: string;
    priority: string;
  }>;
}

export interface CrossPlatformAnalysisResult {
  summary: string;
  platform_analyses: PlatformAnalysisResult[];
  cross_platform_insights: Array<{
    insight: string;
    actionable: string;
  }>;
  content_repurposing_suggestions: Array<{
    from_platform: string;
    to_platform: string;
    adaptation_needed: string;
  }>;
}

// ---- Shared DB Record Types (used across API files) ----

export interface VideoRecord {
  id: number;
  filename: string;
  file_size: number | null;
  duration_seconds: number | null;
  status: string;
  error_message: string | null;
  ranking: number | null;
  ranking_notes: string | null;
  code: string | null;
  storage_path: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TranscriptionRecord {
  id: number;
  video_id: number;
  full_text: string;
  language: string;
  model_used: string | null;
  processing_time_seconds: number | null;
  edited: boolean;
  edited_at: string | null;
  segments: { start_time: number; end_time: number; text: string }[];
  created_at: string;
}

export interface ConversionRecord {
  id: number;
  video_id: number;
  metric_name: string;
  metric_value: number;
  date_recorded: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisRecord {
  id: number;
  analysis_type: string;
  scope: string;
  video_id: number | null;
  result_json: unknown;
  gemini_model_used: string | null;
  created_at: string;
}

export interface SettingsRecord {
  key: string;
  api_keys: string[];
  selected_model: string;
  managed_tags: string[];
}

// ---- Batch Transcription Types ----

export type VideoTranscriptionStage =
  | "queued"
  | "downloading"
  | "preparing"
  | "transcribing"
  | "saving"
  | "completed"
  | "error";

export interface VideoProgress {
  videoId: number;
  filename: string;
  stage: VideoTranscriptionStage;
  detail?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  apiKeyIndex?: number;
}

export interface ApiKeyStatus {
  index: number;
  state: "available" | "working" | "rate_limited" | "error";
  rateLimitedUntil?: number;
  currentVideoId?: number;
  completedCount: number;
}

export interface BatchProgress {
  totalVideos: number;
  completedVideos: number;
  errorVideos: number;
  activeWorkers: number;
  totalWorkers: number;
  videoProgress: Map<number, VideoProgress>;
  keyStatuses: ApiKeyStatus[];
  startedAt: number;
  avgSecondsPerVideo: number | null;
  estimatedSecondsRemaining: number | null;
  isRunning: boolean;
  isCancelled: boolean;
}

export interface DashboardData {
  total_videos: number;
  transcribed_videos: number;
  processing_videos: number;
  error_videos: number;
  avg_duration_seconds: number | null;
  total_duration_seconds: number | null;
  total_conversions: number;
  top_keywords: KeywordItem[];
  video_summaries: Array<{
    id: number;
    filename: string;
    status: string;
    duration_seconds: number | null;
    conversions: Record<string, number>;
  }>;
  latest_ai_recommendations: AiAnalysisResult | null;
}

// ---- A/B Deep Comparison Types ----

export interface ABDeepComparisonResult {
  summary: string;
  video_a_profile: {
    name: string;
    strengths: string[];
    weaknesses: string[];
    target_persona: { age_range: string; gender: string; interests: string[]; pain_points: string[] };
    persuasion_score: number;
    storytelling_score: number;
  };
  video_b_profile: {
    name: string;
    strengths: string[];
    weaknesses: string[];
    target_persona: { age_range: string; gender: string; interests: string[]; pain_points: string[] };
    persuasion_score: number;
    storytelling_score: number;
  };
  key_differences: Array<{
    aspect: string;
    video_a: string;
    video_b: string;
    winner: "A" | "B" | "引き分け";
    reason: string;
  }>;
  persona_fit_analysis: {
    better_for_young: "A" | "B";
    better_for_older: "A" | "B";
    better_for_action: "A" | "B";
    explanation: string;
  };
  recommendations: Array<{
    target: "A" | "B" | "両方";
    suggestion: string;
    priority: string;
  }>;
}

// ---- Ranking × Platform Insight Types ----

export interface RankingPlatformInsightResult {
  overall_summary: string;
  platform_ranking_matrix: Array<{
    platform: string;
    top_videos: Array<{ name: string; ranking: number; hit_factors: string[] }>;
    low_videos: Array<{ name: string; ranking: number | null; weak_points: string[] }>;
    platform_success_formula: string;
  }>;
  persona_profiles: Array<{
    platform: string;
    primary_persona: {
      age_range: string;
      gender: string;
      lifestyle: string;
      media_consumption: string;
      purchase_triggers: string[];
      content_preferences: string[];
    };
    secondary_persona: {
      age_range: string;
      gender: string;
      lifestyle: string;
    } | null;
  }>;
  hit_factor_analysis: Array<{
    factor: string;
    importance: "critical" | "high" | "medium";
    top_video_usage: string;
    low_video_gap: string;
    platforms_where_effective: string[];
  }>;
  cross_platform_persona_insights: Array<{
    insight: string;
    actionable: string;
  }>;
  content_strategy_by_platform: Array<{
    platform: string;
    ideal_length: string;
    hook_strategy: string;
    persona_messaging: string;
    cta_approach: string;
    sample_script_outline: string;
  }>;
}
