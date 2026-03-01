import type { MarketingReportResult, ConversionSummary } from "../types";

type PptxTableCell = string | {
  text: string;
  options: {
    bold?: boolean;
    color?: string;
    fill?: { color: string };
  };
};

export async function generateMarketingPptx(
  report: MarketingReportResult,
  convSummaries: ConversionSummary[],
): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  const BLUE = "1e40af";
  const DARK = "1f2937";
  const GRAY = "6b7280";
  const WHITE = "ffffff";

  // --- Slide 1: Title ---
  const s1 = pptx.addSlide();
  s1.addText("マーケティング総合レポート", {
    x: 0.5, y: 1.5, w: 9, h: 1.2,
    fontSize: 36, fontFace: "Yu Gothic", color: BLUE, bold: true,
  });
  s1.addText(`作成日: ${new Date().toLocaleDateString("ja-JP")}`, {
    x: 0.5, y: 2.8, w: 9, h: 0.6,
    fontSize: 16, fontFace: "Yu Gothic", color: GRAY,
  });

  // --- Slide 2: Executive Summary ---
  const s2 = pptx.addSlide();
  s2.addText("エグゼクティブサマリー", {
    x: 0.5, y: 0.3, w: 9, h: 0.7,
    fontSize: 24, fontFace: "Yu Gothic", color: BLUE, bold: true,
  });
  s2.addText(report.executive_summary || "", {
    x: 0.5, y: 1.2, w: 9, h: 3.5,
    fontSize: 14, fontFace: "Yu Gothic", color: DARK, valign: "top",
  });

  // --- Slide 3: Content Performance Matrix ---
  if (report.content_performance_matrix?.length > 0) {
    const s3 = pptx.addSlide();
    s3.addText("コンテンツ評価マトリクス", {
      x: 0.5, y: 0.3, w: 9, h: 0.7,
      fontSize: 24, fontFace: "Yu Gothic", color: BLUE, bold: true,
    });
    const rows: PptxTableCell[][] = [
      [
        { text: "動画名", options: { bold: true, color: WHITE, fill: { color: BLUE } } },
        { text: "スコア", options: { bold: true, color: WHITE, fill: { color: BLUE } } },
        { text: "強み", options: { bold: true, color: WHITE, fill: { color: BLUE } } },
        { text: "弱み", options: { bold: true, color: WHITE, fill: { color: BLUE } } },
      ],
    ];
    for (const item of report.content_performance_matrix) {
      rows.push([
        item.video_name,
        `${item.overall_score}/10`,
        (item.strengths ?? []).join(", "),
        (item.weaknesses ?? []).join(", "),
      ]);
    }
    s3.addTable(rows as never, {
      x: 0.5, y: 1.2, w: 9,
      fontSize: 10, fontFace: "Yu Gothic",
      border: { type: "solid", pt: 0.5, color: "d1d5db" },
      colW: [2.5, 1, 2.75, 2.75],
    });
  }

  // --- Slide 4: Conversion Comparison ---
  if (convSummaries.length > 0) {
    const s4 = pptx.addSlide();
    s4.addText("コンバージョン比較", {
      x: 0.5, y: 0.3, w: 9, h: 0.7,
      fontSize: 24, fontFace: "Yu Gothic", color: BLUE, bold: true,
    });
    const metrics = new Set<string>();
    convSummaries.forEach((s) => Object.keys(s.metrics).forEach((k) => metrics.add(k)));
    const metricList = Array.from(metrics);

    const rows: PptxTableCell[][] = [
      [
        { text: "動画", options: { bold: true, color: WHITE, fill: { color: BLUE } } },
        ...metricList.map((m) => ({
          text: m,
          options: { bold: true, color: WHITE, fill: { color: BLUE } },
        })),
      ],
    ];
    for (const s of convSummaries) {
      rows.push([
        s.video_filename.length > 20 ? s.video_filename.slice(0, 20) + "..." : s.video_filename,
        ...metricList.map((m) => String(s.metrics[m] ?? "-")),
      ]);
    }
    const colCount = 1 + metricList.length;
    s4.addTable(rows as never, {
      x: 0.5, y: 1.2, w: 9,
      fontSize: 10, fontFace: "Yu Gothic",
      border: { type: "solid", pt: 0.5, color: "d1d5db" },
      colW: Array(colCount).fill(9 / colCount),
    });
  }

  // --- Slide 5: Improvement Priorities ---
  if (report.improvement_priorities?.length > 0) {
    const s5 = pptx.addSlide();
    s5.addText("改善優先度", {
      x: 0.5, y: 0.3, w: 9, h: 0.7,
      fontSize: 24, fontFace: "Yu Gothic", color: BLUE, bold: true,
    });
    const items = report.improvement_priorities.map((ip, i) => {
      const badge = ip.priority === "high" ? "[高]" : ip.priority === "medium" ? "[中]" : "[低]";
      return `${i + 1}. ${badge} ${ip.area}\n   ${ip.recommended_action}\n   期待効果: ${ip.expected_impact}`;
    }).join("\n\n");
    s5.addText(items, {
      x: 0.5, y: 1.2, w: 9, h: 3.8,
      fontSize: 12, fontFace: "Yu Gothic", color: DARK, valign: "top",
    });
  }

  // --- Slide 6: Next Video Direction ---
  if (report.next_video_direction) {
    const nd = report.next_video_direction;
    const s6 = pptx.addSlide();
    s6.addText("次回動画の方向性", {
      x: 0.5, y: 0.3, w: 9, h: 0.7,
      fontSize: 24, fontFace: "Yu Gothic", color: BLUE, bold: true,
    });
    const content = [
      `テーマ: ${nd.theme}`,
      `推奨構成: ${nd.recommended_structure}`,
      `感情曲線: ${nd.target_emotion_arc}`,
      `メッセージ: ${(nd.key_messages ?? []).join(" / ")}`,
    ].join("\n\n");
    s6.addText(content, {
      x: 0.5, y: 1.2, w: 9, h: 3.8,
      fontSize: 14, fontFace: "Yu Gothic", color: DARK, valign: "top",
    });
  }

  // --- Download ---
  await pptx.writeFile({ fileName: `マーケティングレポート_${new Date().toISOString().slice(0, 10)}.pptx` });
}
