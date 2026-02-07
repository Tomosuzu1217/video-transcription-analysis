import json
import logging
import threading
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 120  # seconds

_key_index = 0
_key_lock = threading.Lock()


def _get_keys_and_model() -> tuple[list[str], str]:
    """Load API keys and model from DB, fallback to config."""
    from app.database import SessionLocal
    from app.routers.settings import get_api_keys, get_selected_model

    db = SessionLocal()
    try:
        keys = get_api_keys(db)
        model = get_selected_model(db)
        return keys, model
    finally:
        db.close()


def _next_key(keys: list[str]) -> str:
    """Round-robin key selection (thread-safe)."""
    global _key_index
    if not keys:
        raise RuntimeError("APIキーが設定されていません")
    with _key_lock:
        idx = _key_index % len(keys)
        _key_index += 1
    return keys[idx]


def analyze_cm_effectiveness(videos_data: list[dict], custom_prompt: str = None) -> dict:
    """
    Send video transcripts and conversion data to Gemini for analysis.
    Rotates through API keys, retrying with the next key on rate-limit errors.
    """
    keys, model = _get_keys_and_model()
    if not keys:
        raise RuntimeError("Gemini APIキーが設定されていません。設定画面からAPIキーを追加してください。")

    prompt = _build_analysis_prompt(videos_data, custom_prompt=custom_prompt)
    last_error = None

    for attempt in range(len(keys)):
        key = _next_key(keys)
        try:
            client = genai.Client(api_key=key)
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT * 1000),
                ),
            )
            return _parse_response(response.text)
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            # Retry with next key on rate limit / quota errors
            if "429" in err_str or "quota" in err_str or "rate" in err_str or "resource_exhausted" in err_str:
                logger.warning(f"API key {attempt + 1}/{len(keys)} rate limited, trying next key...")
                continue
            # Non-rate-limit error: raise immediately
            raise

    raise RuntimeError(f"全てのAPIキーがレート制限に達しました: {last_error}")


def _build_analysis_prompt(videos_data: list[dict], custom_prompt: str = None) -> str:
    video_sections = []
    for v in videos_data:
        conv_str = ", ".join(f"{k}: {val}" for k, val in v["conversions"].items()) if v["conversions"] else "データなし"
        video_sections.append(
            f"### 動画: {v['name']}\n"
            f"書き起こし:\n{v['transcript']}\n"
            f"コンバージョン: {conv_str}\n"
        )

    videos_block = "\n".join(video_sections)

    # カスタムプロンプトが指定されている場合は追加
    custom_instruction = ""
    if custom_prompt and custom_prompt.strip():
        custom_instruction = f"""
追加の分析指示:
{custom_prompt.strip()}

上記の追加指示も考慮して分析してください。
"""

    return f"""あなたは日本のCM（コマーシャル）分析の専門家です。
以下の動画CMの書き起こしテキストとコンバージョンデータを分析してください。

{videos_block}
{custom_instruction}
以下の形式でJSON形式で分析結果を返してください:
{{
  "summary": "全体的な分析サマリー（日本語）",
  "effective_keywords": [
    {{"keyword": "キーワード", "reason": "効果的な理由", "appears_in": ["動画名"]}}
  ],
  "effective_phrases": [
    {{"phrase": "フレーズ", "reason": "効果的な理由", "appears_in": ["動画名"]}}
  ],
  "correlation_insights": [
    {{"insight": "発見内容", "confidence": "high/medium/low"}}
  ],
  "recommendations": [
    {{"category": "カテゴリ", "recommendation": "具体的な提案", "priority": "high/medium/low"}}
  ],
  "funnel_suggestions": [
    {{"stage": "ファネルステージ", "suggestion": "改善提案"}}
  ]
}}

重要: 必ず有効なJSONのみを返してください（説明文やマークダウンは不要）。分析は日本語で行ってください。"""


def analyze_ranking_comparison(
    top_videos_data: list[dict],
    other_videos_data: list[dict],
    custom_prompt: str = None
) -> dict:
    """
    Compare top-ranked videos with other videos using psychological and storytelling analysis.
    """
    keys, model = _get_keys_and_model()
    if not keys:
        raise RuntimeError("Gemini APIキーが設定されていません。設定画面からAPIキーを追加してください。")

    prompt = _build_ranking_comparison_prompt(top_videos_data, other_videos_data, custom_prompt)
    last_error = None

    for attempt in range(len(keys)):
        key = _next_key(keys)
        try:
            client = genai.Client(api_key=key)
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT * 1000),
                ),
            )
            return _parse_response(response.text)
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            if "429" in err_str or "quota" in err_str or "rate" in err_str or "resource_exhausted" in err_str:
                logger.warning(f"API key {attempt + 1}/{len(keys)} rate limited, trying next key...")
                continue
            raise

    raise RuntimeError(f"全てのAPIキーがレート制限に達しました: {last_error}")


def _build_ranking_comparison_prompt(
    top_videos_data: list[dict],
    other_videos_data: list[dict],
    custom_prompt: str = None
) -> str:
    """Build prompt for ranking comparison analysis."""
    top_sections = []
    for v in top_videos_data:
        conv_str = ", ".join(f"{k}: {val}" for k, val in v["conversions"].items()) if v["conversions"] else "データなし"
        notes = f"\nユーザーメモ: {v['ranking_notes']}" if v.get("ranking_notes") else ""
        top_sections.append(
            f"### 【ランキング{v['ranking']}位】 {v['name']}{notes}\n"
            f"書き起こし:\n{v['transcript']}\n"
            f"コンバージョン: {conv_str}\n"
        )

    other_sections = []
    for v in other_videos_data:
        conv_str = ", ".join(f"{k}: {val}" for k, val in v["conversions"].items()) if v["conversions"] else "データなし"
        rank_str = f"ランキング{v['ranking']}位" if v.get("ranking") else "ランキング未設定"
        other_sections.append(
            f"### 【{rank_str}】 {v['name']}\n"
            f"書き起こし:\n{v['transcript']}\n"
            f"コンバージョン: {conv_str}\n"
        )

    top_block = "\n".join(top_sections)
    other_block = "\n".join(other_sections) if other_sections else "（比較対象の動画がありません）"

    custom_instruction = ""
    if custom_prompt and custom_prompt.strip():
        custom_instruction = f"""
追加の分析指示:
{custom_prompt.strip()}

上記の追加指示も考慮して分析してください。
"""

    return f"""あなたは心理学とストーリーテリングの専門家で、CM（コマーシャル）の効果分析に精通しています。

以下のデータを分析してください：
- ユーザーが高く評価した動画（ランキング上位）
- その他の動画（比較対象）

## ランキング上位の動画（ユーザー評価が高い）
{top_block}

## 比較対象の動画
{other_block}
{custom_instruction}
ランキング上位の動画がなぜ優れているのかを、以下の観点から詳細に分析してください：

1. **心理学的分析**:
   - 認知バイアスの活用（アンカリング、社会的証明、希少性など）
   - 感情的アピール（恐怖、喜び、驚き、共感など）
   - 説得の原理（返報性、一貫性、好意、権威など）

2. **ストーリーテリング分析**:
   - 物語構造（起承転結、問題解決、変化の旅など）
   - キャラクター/主人公の設定
   - 感情の起伏（テンション曲線）
   - フック（注目を引く要素）

3. **言語・表現分析**:
   - 印象的なフレーズや言い回し
   - 韻、リズム、反復などの修辞技法
   - 専門用語 vs 日常語のバランス

以下の形式でJSON形式で分析結果を返してください:
{{
  "summary": "全体的な分析サマリー（なぜ上位動画が優れているか）",
  "psychological_analysis": [
    {{
      "technique": "使用されている心理学的テクニック名",
      "description": "具体的な説明",
      "examples": ["上位動画での具体例"],
      "effectiveness": "なぜ効果的か"
    }}
  ],
  "storytelling_analysis": [
    {{
      "element": "ストーリーテリング要素名",
      "description": "具体的な説明",
      "examples": ["上位動画での具体例"],
      "impact": "視聴者への影響"
    }}
  ],
  "linguistic_analysis": [
    {{
      "technique": "言語テクニック名",
      "description": "具体的な説明",
      "examples": ["具体的なフレーズ例"]
    }}
  ],
  "key_differences": [
    {{
      "aspect": "比較観点",
      "top_videos": "上位動画の特徴",
      "other_videos": "他の動画の特徴",
      "insight": "この差が示唆すること"
    }}
  ],
  "recommendations": [
    {{
      "category": "改善カテゴリ",
      "recommendation": "他の動画を改善するための具体的な提案",
      "priority": "high/medium/low"
    }}
  ]
}}

重要: 必ず有効なJSONのみを返してください（説明文やマークダウンは不要）。分析は日本語で行ってください。"""


def analyze_psychological_content(
    videos_data: list[dict],
    custom_prompt: str = None,
) -> dict:
    """
    Analyze video content using psychological framework:
    emotional volatility, storytelling effectiveness, conversion pipeline.
    """
    keys, model = _get_keys_and_model()
    if not keys:
        raise RuntimeError("Gemini APIキーが設定されていません。設定画面からAPIキーを追加してください。")

    prompt = _build_psychological_content_prompt(videos_data, custom_prompt=custom_prompt)
    last_error = None

    for attempt in range(len(keys)):
        key = _next_key(keys)
        try:
            client = genai.Client(api_key=key)
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT * 1000),
                ),
            )
            return _parse_response(response.text)
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            if "429" in err_str or "quota" in err_str or "rate" in err_str or "resource_exhausted" in err_str:
                logger.warning(f"API key {attempt + 1}/{len(keys)} rate limited, trying next key...")
                continue
            raise

    raise RuntimeError(f"全てのAPIキーがレート制限に達しました: {last_error}")


def _build_psychological_content_prompt(
    videos_data: list[dict],
    custom_prompt: str = None,
) -> str:
    """Build prompt for psychological content analysis."""
    video_sections = []
    for v in videos_data:
        conv_str = (
            ", ".join(f"{k}: {val}" for k, val in v["conversions"].items())
            if v.get("conversions")
            else "データなし"
        )

        # Format emotion timeline
        emotion_lines = []
        for seg in v.get("emotion_segments", []):
            score = seg.get("emotion_score", 0)
            indicator = "+" if score > 0 else ("-" if score < 0 else "=")
            pos_words = ", ".join(seg.get("positive_words", []))
            neg_words = ", ".join(seg.get("negative_words", []))
            time_range = f"{_fmt_time(seg.get('start_time', 0))}-{_fmt_time(seg.get('end_time', 0))}"
            word_detail = ""
            if pos_words:
                word_detail += f" ポジ:[{pos_words}]"
            if neg_words:
                word_detail += f" ネガ:[{neg_words}]"
            emotion_lines.append(f"  [{time_range}] スコア:{score:+.2f} ({indicator}){word_detail}")

        emotion_timeline = "\n".join(emotion_lines) if emotion_lines else "  感情データなし"

        # Format volatility
        vol = v.get("volatility", {})
        vol_str = (
            f"標準偏差: {vol.get('volatility_std', 0)}, "
            f"方向転換: {vol.get('direction_changes', 0)}回, "
            f"最大振幅: {vol.get('max_amplitude', 0)}, "
            f"平均スコア: {vol.get('avg_score', 0)}"
        ) if vol else "データなし"

        # Format persuasion techniques detected by NLP
        persuasion_lines = []
        for tech in v.get("persuasion_techniques", []):
            persuasion_lines.append(
                f"  - {tech['technique']}: {', '.join(tech['matches'])}"
            )
        persuasion_str = "\n".join(persuasion_lines) if persuasion_lines else "  検出なし"

        video_sections.append(
            f"### 動画: {v['name']}\n"
            f"書き起こし:\n{v['transcript']}\n\n"
            f"コンバージョン: {conv_str}\n\n"
            f"【NLP感情分析タイムライン】\n{emotion_timeline}\n\n"
            f"【感情ボラティリティ指標】\n  {vol_str}\n\n"
            f"【検出された説得技法】\n{persuasion_str}\n"
        )

    videos_block = "\n---\n".join(video_sections)

    custom_instruction = ""
    if custom_prompt and custom_prompt.strip():
        custom_instruction = f"""
追加の分析指示:
{custom_prompt.strip()}

上記の追加指示も考慮して分析してください。
"""

    return f"""あなたは心理学、行動経済学、ストーリーテリングの専門家であり、動画広告のコンバージョン最適化に精通しています。
Dラボ（メンタリストDaiGo）のメソッドに基づき、以下の動画コンテンツを3つの軸で詳細に分析してください。

分析の目的: ネット広告の動画企画において、リンクからの登録（コンバージョン）を促す上で最も効果的な動画コンテンツの要素を特定すること。

## 分析対象の動画データ

{videos_block}
{custom_instruction}
## 分析フレームワーク

以下の3軸で各動画を詳細に分析し、動画間の比較も行ってください：

### 軸1: 感情ボラティリティ分析
- NLPで算出した感情スコアタイムラインを参考に、コンテンツが視聴者の感情をどれだけ揺さぶっているかを評価
- ポジティブとネガティブの感情が交互に入れ替わるパターン（感情の起伏）を分析
- 感情のピークモーメント（驚き、期待、不安、喜びなど）を特定
- 「もっと見たい」「続きが気になる」欲求を生み出す感情的フックを評価
- 感情ボラティリティと視聴完了率・登録行動の関連性を考察

### 軸2: 実用性・ストーリーテリング分析
- 物語構造の型（問題提起→解決策→成功体験、困難→克服→変化など）を特定
- 「へー！」と思わせる実用的情報・価値の有無を評価
- オフラインでも人に話したくなる「共有したくなる度」を評価
- 記憶に残りやすいストーリー要素（予想外の展開、具体的エピソードなど）を分析
- ストーリーが情報を運ぶ「船」として機能しているかを評価

### 軸3: コンバージョン導線・説得力分析
- NLPで検出した説得技法（希少性、社会的証明、権威性、緊急性）の使用パターンを評価
- CTAの配置タイミング、表現方法、ストーリーからの自然な接続を分析
- 視聴者の「行動しない理由」を取り除く心理的アプローチを特定
- 再生数よりもコンバージョンレートを重視する観点で評価

以下の形式でJSON形式で分析結果を返してください:
{{
  "overall_summary": "全体的な分析サマリー（最も効果的な動画とその理由を含む）",

  "emotion_volatility_analysis": {{
    "summary": "感情ボラティリティの総合評価",
    "videos": [
      {{
        "video_name": "動画名",
        "volatility_score": 8.5,
        "emotion_arc": "感情曲線の説明（起伏のパターンを詳述）",
        "peak_moments": [
          {{"timestamp_range": "0:30-0:45", "emotion": "驚き→期待", "description": "具体的な説明"}}
        ],
        "emotional_hooks": ["感情的フックの説明"],
        "evaluation": "この動画の感情ボラティリティが登録行動に与える影響の評価"
      }}
    ],
    "best_practices": ["全動画を通じた感情ボラティリティのベストプラクティス"]
  }},

  "storytelling_analysis": {{
    "summary": "ストーリーテリングの総合評価",
    "videos": [
      {{
        "video_name": "動画名",
        "story_structure": "物語構造の型名と説明",
        "practical_value_score": 7.0,
        "memorability_score": 8.0,
        "shareability_score": 6.5,
        "narrative_elements": [
          {{"element": "要素名", "description": "説明", "example": "動画内の具体例"}}
        ],
        "hooks": ["注目を引く要素の説明"],
        "evaluation": "登録行動へのストーリーテリングの貢献度評価"
      }}
    ],
    "story_patterns": ["効果的なストーリーパターンの分析・考察"]
  }},

  "conversion_pipeline_analysis": {{
    "summary": "コンバージョン導線の総合評価",
    "videos": [
      {{
        "video_name": "動画名",
        "persuasion_score": 8.0,
        "cta_analysis": {{
          "cta_moments": [
            {{"timestamp_range": "3:00-3:15", "technique": "希少性", "text": "該当テキスト", "effectiveness": "高/中/低"}}
          ],
          "flow_naturalness": "ストーリーからCTAへの自然さの評価"
        }},
        "persuasion_techniques": [
          {{"technique": "技法名", "description": "説明", "example": "動画内の具体例"}}
        ],
        "evaluation": "コンバージョン導線の総合評価"
      }}
    ],
    "optimization_suggestions": ["CTA最適化の具体的な提案"]
  }},

  "metrics_correlation": {{
    "completion_rate_factors": ["視聴完了率に影響する要因の分析"],
    "ctr_factors": ["CTRに影響する要因の分析"],
    "conversion_rate_factors": ["登録率に影響する要因の分析"],
    "engagement_factors": ["エンゲージメント率に影響する要因の分析"]
  }},

  "cross_video_insights": [
    {{"insight": "動画横断的な発見・パターン", "confidence": "high/medium/low", "actionable": "具体的なアクション提案"}}
  ],

  "recommendations": [
    {{"category": "改善カテゴリ", "recommendation": "具体的な提案", "priority": "high/medium/low", "expected_impact": "期待される効果"}}
  ]
}}

重要: 必ず有効なJSONのみを返してください（説明文やマークダウンは不要）。分析は日本語で行ってください。スコアは1.0〜10.0の範囲で評価してください。"""


def _fmt_time(seconds: float) -> str:
    """Format seconds as M:SS."""
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m}:{s:02d}"


def _parse_response(text: str) -> dict:
    """Parse Gemini response, handling potential markdown code blocks."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = lines[1:]  # remove opening ```json
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse Gemini response as JSON: {cleaned[:200]}")
        return {
            "summary": cleaned,
            "effective_keywords": [],
            "effective_phrases": [],
            "correlation_insights": [],
            "recommendations": [],
            "funnel_suggestions": [],
        }
