// ExportService — client-side exporters. Kept isomorphic-ish: jsPDF is
// only imported inside its exporter so server code isn't affected.
import type {
  FlashcardRow,
  QuizAttemptRow,
  QuizQuestionRow,
  QuizRow,
} from "./types";
import type { StudyStats } from "./stats";

function download(filename: string, mime: string, body: BlobPart) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safe(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paper";
}

function csvCell(v: string | number | boolean | null | undefined) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportFlashcardsCSV(input: {
  paperTitle: string;
  flashcards: FlashcardRow[];
}) {
  const header = [
    "front",
    "back",
    "difficulty",
    "section",
    "page_start",
    "page_end",
    "favorite",
    "mastery",
    "review_count",
  ];
  const rows = input.flashcards.map((c) =>
    [
      c.front,
      c.back,
      c.difficulty,
      c.section ?? "",
      c.page_start ?? "",
      c.page_end ?? "",
      c.favorite,
      c.mastery.toFixed(2),
      c.review_count,
    ]
      .map(csvCell)
      .join(","),
  );
  const body = [header.join(","), ...rows].join("\n");
  download(`${safe(input.paperTitle)}-flashcards.csv`, "text/csv;charset=utf-8", body);
}

export async function exportQuizPDF(input: {
  paperTitle: string;
  quiz: QuizRow;
  questions: QuizQuestionRow[];
  includeAnswers?: boolean;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 54;
  const W = doc.internal.pageSize.getWidth() - M * 2;
  let y = M;

  const writeWrapped = (text: string, size: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, W);
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - M) {
        doc.addPage();
        y = M;
      }
      doc.text(line, M, y);
      y += size * 1.35;
    }
  };

  writeWrapped(input.paperTitle, 18, true);
  writeWrapped(input.quiz.title || "Quiz", 12);
  y += 8;

  input.questions.forEach((q, i) => {
    y += 6;
    writeWrapped(`${i + 1}. ${q.question}`, 12, true);
    if (q.type === "mcq" && Array.isArray(q.options)) {
      q.options.forEach((opt, idx) => {
        writeWrapped(`   ${String.fromCharCode(65 + idx)}. ${opt}`, 11);
      });
    } else if (q.type === "tf") {
      writeWrapped("   ○ True    ○ False", 11);
    } else {
      writeWrapped("   _______________________________________", 11);
    }
    if (input.includeAnswers) {
      writeWrapped(`   Answer: ${q.correct_answer}`, 11);
      if (q.explanation) writeWrapped(`   Why: ${q.explanation}`, 10);
    }
  });

  doc.save(`${safe(input.paperTitle)}-quiz.pdf`);
}

export function exportStudyNotesMarkdown(input: {
  paperTitle: string;
  flashcards: FlashcardRow[];
  attempts: QuizAttemptRow[];
  stats: StudyStats;
}) {
  const { paperTitle, flashcards, attempts, stats } = input;
  const lines: string[] = [];
  lines.push(`# Study Notes — ${paperTitle}`, "");
  lines.push(`_Generated ${new Date().toLocaleString()}_`, "");
  lines.push(`## Progress`, "");
  lines.push(`- Mastery: ${(stats.masteryScore * 100).toFixed(0)}%`);
  lines.push(`- Cards mastered: ${stats.cardsMastered} / ${stats.cardsTotal}`);
  lines.push(`- Questions answered: ${stats.questionsAnswered}`);
  lines.push(`- Accuracy: ${(stats.correctPct * 100).toFixed(0)}%`);
  lines.push(`- Study time: ${stats.studyMinutes} min`);
  lines.push(`- Streak: ${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"}`);
  lines.push("", `## Flashcards`, "");
  flashcards.forEach((c, i) => {
    lines.push(`### ${i + 1}. ${c.front}`);
    lines.push("");
    lines.push(c.back);
    const meta = [
      c.section ? `Section: ${c.section}` : null,
      c.page_start
        ? `Pages: ${c.page_start}${c.page_end && c.page_end !== c.page_start ? `–${c.page_end}` : ""}`
        : null,
      `Difficulty: ${c.difficulty}`,
    ]
      .filter(Boolean)
      .join(" · ");
    if (meta) lines.push(`\n_${meta}_`);
    lines.push("");
  });
  if (attempts.length) {
    lines.push(`## Recent Quiz Attempts`, "");
    attempts.slice(0, 10).forEach((a) => {
      lines.push(
        `- ${new Date(a.completed_at).toLocaleString()} — ${a.score}/${a.total} (${Math.round(
          (a.score / Math.max(1, a.total)) * 100,
        )}%), ${Math.round(a.duration_sec / 60)} min`,
      );
    });
  }
  download(
    `${safe(paperTitle)}-study-notes.md`,
    "text/markdown;charset=utf-8",
    lines.join("\n"),
  );
}