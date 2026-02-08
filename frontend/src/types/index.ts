export interface Video {
  id: number;
  filename: string;
  file_size: number | null;
  duration_seconds: number | null;
  status: "uploaded" | "transcribing" | "transcribed" | "error";
  error_message: string | null;
  ranking: number | null;
  ranking_notes: string | null;
  storage_path: string;
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
  storage_path: string;
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
  result_json: any;
  gemini_model_used: string | null;
  created_at: string;
}

export interface SettingsRecord {
  key: string;
  api_keys: string[];
  selected_model: string;
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
