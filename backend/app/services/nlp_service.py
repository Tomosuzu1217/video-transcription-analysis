import logging
import math
import fugashi
from collections import Counter
from typing import Optional

logger = logging.getLogger(__name__)

_tagger: Optional[fugashi.Tagger] = None
_tagger_init_error: Optional[str] = None


def get_tagger() -> fugashi.Tagger:
    global _tagger, _tagger_init_error
    if _tagger is None:
        try:
            _tagger = fugashi.Tagger()
            _tagger_init_error = None
        except Exception as e:
            _tagger_init_error = str(e)
            logger.error(f"Fugashi tagger initialization failed: {e}. "
                         "Ensure unidic dictionary is installed (pip install unidic-lite).")
            raise RuntimeError(
                f"形態素解析エンジンの初期化に失敗しました: {e}. "
                "unidic-lite がインストールされているか確認してください。"
            ) from e
    return _tagger


def extract_keywords(text: str, top_n: int = 50) -> list[dict]:
    """Tokenize Japanese text and return top keywords with frequencies."""
    if not text or not text.strip():
        return []
    tagger = get_tagger()
    words = tagger(text)

    meaningful_pos = {"名詞", "動詞", "形容詞", "副詞"}
    keyword_counter: Counter = Counter()

    for word in words:
        pos1 = word.feature.pos1 if hasattr(word.feature, 'pos1') else ""
        if pos1 in meaningful_pos:
            lemma = word.feature.lemma if hasattr(word.feature, 'lemma') and word.feature.lemma else str(word)
            if len(lemma) > 1:
                keyword_counter[lemma] += 1

    return [{"keyword": kw, "count": count} for kw, count in keyword_counter.most_common(top_n)]


def extract_phrases(text: str, n: int = 2, top_n: int = 30) -> list[dict]:
    """Extract N-gram phrases from text."""
    if not text or not text.strip():
        return []
    tagger = get_tagger()
    words = tagger(text)
    tokens = [str(w) for w in words if hasattr(w.feature, 'pos1') and w.feature.pos1 not in {"記号", "空白", "補助記号"}]

    phrase_counter: Counter = Counter()
    for i in range(len(tokens) - n + 1):
        phrase = "".join(tokens[i : i + n])
        if len(phrase) > 2:
            phrase_counter[phrase] += 1

    return [{"phrase": phrase, "count": count} for phrase, count in phrase_counter.most_common(top_n)]


# ──────────────────────────────────────────────────────────────
# 感情語辞書（日本語）
# ──────────────────────────────────────────────────────────────

POSITIVE_WORDS = {
    "嬉しい", "楽しい", "素晴らしい", "最高", "成功", "幸せ", "安心", "希望", "感動",
    "自由", "効果", "簡単", "得", "実証", "科学", "証明", "改善", "向上", "達成",
    "可能", "解決", "メリット", "チャンス", "秘密", "発見", "驚き", "新しい", "画期的",
    "革命", "最新", "特別", "優れる", "凄い", "面白い", "魅力", "感謝", "豊か",
    "快適", "理想", "満足", "信頼", "実現", "成長", "上がる", "増える", "高まる",
    "喜び", "笑顔", "元気", "健康", "美しい", "輝く", "夢", "好き", "愛",
    "勝つ", "強い", "賢い", "正しい", "良い", "素敵", "最強", "完璧", "究極",
}

NEGATIVE_WORDS = {
    "不安", "怖い", "失敗", "危険", "損", "後悔", "問題", "困難", "辛い", "悲しい",
    "心配", "リスク", "地獄", "最悪", "罠", "間違い", "嘘", "騙す", "無駄",
    "苦しい", "痛い", "ストレス", "疲れる", "嫌", "ダメ", "悪い", "弱い", "落ちる",
    "減る", "下がる", "壊れる", "消える", "負ける", "病気", "老化", "衰える",
    "孤独", "絶望", "恐怖", "悩み", "困る", "焦る", "怒り", "イライラ", "退屈",
    "つまらない", "惨め", "劣る", "遅い", "難しい", "複雑", "面倒", "障害",
    "崩壊", "破綻", "限界", "暴落", "低下", "悪化", "深刻", "致命的",
}

URGENCY_WORDS = {
    "今すぐ", "限定", "残り", "急いで", "本日", "特別", "無料", "チャンス",
    "期間限定", "数量限定", "先着", "早い者勝ち", "今だけ", "今回だけ",
    "最後", "ラスト", "締め切り", "間に合う", "急ぐ", "見逃す",
}

SOCIAL_PROOF_WORDS = {
    "万人", "人気", "話題", "注目", "評価", "研究", "論文", "データ", "実験",
    "科学的", "エビデンス", "証拠", "統計", "調査", "結果", "ハーバード",
    "スタンフォード", "大学", "教授", "専門家", "世界的", "有名",
    "ベストセラー", "売れる", "選ばれる", "支持", "推薦", "口コミ",
}

AUTHORITY_WORDS = {
    "専門家", "教授", "博士", "研究者", "科学者", "医師", "プロ",
    "権威", "第一人者", "実績", "経験", "資格", "認定", "公式",
    "論文", "学術", "査読", "発表", "受賞", "著書",
}

SCARCITY_WORDS = {
    "限定", "残り", "在庫", "品切れ", "売り切れ", "数量",
    "先着", "今だけ", "特別", "独占", "唯一", "希少", "レア",
}


def analyze_segment_emotions(segments: list[dict]) -> list[dict]:
    """各セグメントの感情スコア（-1〜+1）を計算しタイムライン化する。

    Args:
        segments: [{"start_time": float, "end_time": float, "text": str}, ...]

    Returns:
        [{"start_time": ..., "end_time": ..., "text": ..., "emotion_score": float,
          "positive_words": [...], "negative_words": [...]}, ...]
    """
    if not segments:
        return []

    tagger = get_tagger()
    results = []

    for seg in segments:
        text = seg.get("text", "")
        if not text.strip():
            results.append({
                **seg,
                "emotion_score": 0.0,
                "positive_words": [],
                "negative_words": [],
            })
            continue

        words = tagger(text)
        pos_found = []
        neg_found = []

        for word in words:
            surface = str(word)
            lemma = word.feature.lemma if hasattr(word.feature, 'lemma') and word.feature.lemma else surface
            # Check both surface form and lemma
            for form in {surface, lemma}:
                if form in POSITIVE_WORDS:
                    pos_found.append(form)
                if form in NEGATIVE_WORDS:
                    neg_found.append(form)

        # Also check for multi-char compound matches in the raw text
        for pw in POSITIVE_WORDS:
            if len(pw) >= 3 and pw in text and pw not in pos_found:
                pos_found.append(pw)
        for nw in NEGATIVE_WORDS:
            if len(nw) >= 3 and nw in text and nw not in neg_found:
                neg_found.append(nw)

        total = len(pos_found) + len(neg_found)
        if total == 0:
            score = 0.0
        else:
            score = (len(pos_found) - len(neg_found)) / total

        results.append({
            "start_time": seg.get("start_time", 0),
            "end_time": seg.get("end_time", 0),
            "text": text,
            "emotion_score": round(score, 3),
            "positive_words": list(set(pos_found)),
            "negative_words": list(set(neg_found)),
        })

    return results


def calculate_emotion_volatility(emotion_segments: list[dict]) -> dict:
    """感情ボラティリティ指標を算出する。

    Args:
        emotion_segments: analyze_segment_emotions() の出力

    Returns:
        {"volatility_std": float, "direction_changes": int, "max_amplitude": float,
         "avg_score": float, "score_range": float}
    """
    scores = [s["emotion_score"] for s in emotion_segments]
    if not scores:
        return {
            "volatility_std": 0.0,
            "direction_changes": 0,
            "max_amplitude": 0.0,
            "avg_score": 0.0,
            "score_range": 0.0,
        }

    n = len(scores)
    avg = sum(scores) / n
    variance = sum((s - avg) ** 2 for s in scores) / n if n > 0 else 0
    std = math.sqrt(variance)

    # Count direction changes (sign flips between consecutive non-zero scores)
    direction_changes = 0
    prev_nonzero = None
    for s in scores:
        if s != 0:
            if prev_nonzero is not None and (s > 0) != (prev_nonzero > 0):
                direction_changes += 1
            prev_nonzero = s

    # Maximum amplitude between consecutive segments
    max_amp = 0.0
    for i in range(1, n):
        amp = abs(scores[i] - scores[i - 1])
        if amp > max_amp:
            max_amp = amp

    return {
        "volatility_std": round(std, 4),
        "direction_changes": direction_changes,
        "max_amplitude": round(max_amp, 4),
        "avg_score": round(avg, 4),
        "score_range": round(max(scores) - min(scores), 4),
    }


def detect_persuasion_techniques(text: str) -> list[dict]:
    """テキスト中の説得技法キーワードを検出する。

    Returns:
        [{"technique": str, "category": str, "matches": [str]}, ...]
    """
    if not text or not text.strip():
        return []

    technique_map = {
        "緊急性・限定性": URGENCY_WORDS,
        "社会的証明": SOCIAL_PROOF_WORDS,
        "権威性": AUTHORITY_WORDS,
        "希少性": SCARCITY_WORDS,
    }

    results = []
    for category, word_set in technique_map.items():
        matches = []
        for w in word_set:
            if w in text:
                matches.append(w)
        if matches:
            results.append({
                "technique": category,
                "category": category,
                "matches": sorted(set(matches)),
            })

    return results
