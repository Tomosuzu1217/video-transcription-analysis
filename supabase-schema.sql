-- ============================================================
-- 動画書き起こしアプリ Supabase スキーマ
-- Supabase SQLエディタで実行してください
-- ============================================================

-- videos テーブル
CREATE TABLE videos (
  id              BIGINT PRIMARY KEY,
  filename        TEXT NOT NULL,
  file_size       BIGINT,
  duration_seconds DOUBLE PRECISION,
  status          TEXT NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'transcribing', 'transcribed', 'error')),
  error_message   TEXT,
  ranking         INTEGER,
  ranking_notes   TEXT,
  storage_path    TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_ranking ON videos(ranking) WHERE ranking IS NOT NULL;
CREATE INDEX idx_videos_created_at ON videos(created_at DESC);

-- transcriptions テーブル
CREATE TABLE transcriptions (
  id                      BIGINT PRIMARY KEY,
  video_id                BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  full_text               TEXT NOT NULL DEFAULT '',
  language                TEXT NOT NULL DEFAULT 'ja',
  model_used              TEXT,
  processing_time_seconds DOUBLE PRECISION,
  segments                JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcriptions_video_id ON transcriptions(video_id);

-- settings テーブル（シングルトン行）
CREATE TABLE settings (
  key             TEXT PRIMARY KEY DEFAULT 'app',
  api_keys        JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_model  TEXT NOT NULL DEFAULT 'gemini-2.5-flash'
);

INSERT INTO settings (key) VALUES ('app') ON CONFLICT DO NOTHING;

-- analyses テーブル
CREATE TABLE analyses (
  id                BIGINT PRIMARY KEY,
  analysis_type     TEXT NOT NULL,
  scope             TEXT NOT NULL,
  video_id          BIGINT REFERENCES videos(id) ON DELETE SET NULL,
  result_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  gemini_model_used TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyses_type ON analyses(analysis_type);
CREATE INDEX idx_analyses_created_at ON analyses(created_at DESC);

-- conversions テーブル
CREATE TABLE conversions (
  id             BIGINT PRIMARY KEY,
  video_id       BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  metric_name    TEXT NOT NULL,
  metric_value   DOUBLE PRECISION NOT NULL,
  date_recorded  TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversions_video_id ON conversions(video_id);

-- transcription_logs テーブル
CREATE TABLE transcription_logs (
  id         TEXT PRIMARY KEY,
  video_id   BIGINT NOT NULL,
  operation  TEXT NOT NULL,
  status     TEXT NOT NULL,
  details    JSONB,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcription_logs_video_id ON transcription_logs(video_id);
CREATE INDEX idx_transcription_logs_timestamp ON transcription_logs(timestamp DESC);

-- ============================================================
-- RLSポリシー（全テーブルでanon roleに全操作を許可）
-- ============================================================
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON videos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON transcriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON analyses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON conversions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON transcription_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Storage バケット用RLS（Supabase Dashboard > Storage > Policies で設定）
-- または以下のSQLで設定:
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow all storage for anon" ON storage.objects
  FOR ALL USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');
