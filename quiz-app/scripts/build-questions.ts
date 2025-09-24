/*
  Build questions.json by extracting questions and options from the PDF and
  merging with answers/notes from the solution text file.

  Usage:
    ts-node scripts/build-questions.ts \
      --pdf "../../AWS Certified Solutions Architect Associate SAA-C03.pdf" \
      --solutions "../../AWS SAA-03 Solution.txt" \
      --output "./public/questions.json"
*/

/// <reference types="node" />
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

type QuizItem = {
  id: number;
  question: string;
  answer?: string;
  notes?: string;
  options?: string[];
  correct?: number[];
  type?: "single" | "multi";
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!key?.startsWith("--")) continue;
    out[key.slice(2)] = val;
  }
  return out as { pdf?: string; solutions?: string; output?: string };
}

function normalizeSpaces(t: string): string {
  return t
    .replace(/\u00A0/g, " ")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function normalizeTextBlock(t: string): string {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function isOptionLine(line: string): boolean {
  return /^([A-J])[\.)]\s+/.test(line.trim());
}

function extractOptionLabel(line: string): string | null {
  const m = line.trim().match(/^([A-J])[\.)]\s+/);
  return m ? m[1] : null;
}

function splitPdfIntoQuestions(pdfText: string): QuizItem[] {
  const text = pdfText.replace(/\r\n?/g, "\n");
  const lines = text.split("\n").map((l) => normalizeSpaces(l));
  const blocks: { id: number; lines: string[] }[] = [];
  let current: { id: number; lines: string[] } | null = null;

  // Pattern 1: "Topic 1Question #123" (with inconsistent spacing)
  const topicRe = /^\s*Topic\s+\d+\s*Question\s*#\s*(\d{1,4})\s*$/i;
  // Pattern 2: "1." or "1)" or "1]" at start (non-zero id)
  const startRe = /^\s*([1-9]\d{0,3})\s*[\]\)\.]\s*(.*)$/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let matched = false;
    const mt = line.match(topicRe);
    if (mt) {
      if (current) blocks.push(current);
      current = { id: Number(mt[1]), lines: [] };
      matched = true;
    }
    if (!matched) {
      const mn = line.match(startRe);
      if (mn) {
        if (current) blocks.push(current);
        current = { id: Number(mn[1]), lines: [mn[2]] };
        matched = true;
      }
    }
    if (!matched && current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);

  const items: QuizItem[] = [];
  for (const { id, lines } of blocks) {
    const optionStartIdx = lines.findIndex((l) => isOptionLine(l));
    const headerLines =
      optionStartIdx >= 0 ? lines.slice(0, optionStartIdx) : lines;
    const rest = optionStartIdx >= 0 ? lines.slice(optionStartIdx) : [];

    const question = normalizeTextBlock(headerLines.join(" "));
    const options: string[] = [];
    if (rest.length > 0) {
      // Accumulate multi-line option text until the next option label
      let buf: string[] = [];
      let lastLabel: string | null = null;
      const flush = () => {
        if (lastLabel != null) {
          options.push(normalizeTextBlock(buf.join(" ")));
        }
        buf = [];
      };
      for (const l of rest) {
        const label = extractOptionLabel(l);
        if (label) {
          // new option starts
          flush();
          lastLabel = label;
          // Support options up to J
          buf.push(l.replace(/^([A-J])[\.)]\s+/, ""));
        } else {
          buf.push(l);
        }
      }
      flush();
    }

    const type: "single" | "multi" =
      /choose\s+(two|three|all that apply)/i.test(question)
        ? "multi"
        : "single";
    items.push({
      id,
      question,
      options: options.length ? options : undefined,
      type,
    });
  }
  return items.sort((a, b) => a.id - b.id);
}

function splitSolutions(raw: string): { id: number; lines: string[] }[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const out: { id: number; lines: string[] }[] = [];
  let current: { id: number; lines: string[] } | null = null;
  const startRe = /^([1-9]\d{0,3})\]\s*/;
  for (const rawLine of lines) {
    const m = rawLine.match(startRe);
    if (m) {
      if (current) out.push(current);
      current = {
        id: Number(m[1]),
        lines: [rawLine.replace(startRe, "").trim()],
      };
    } else if (current) {
      current.lines.push(rawLine);
    }
  }
  if (current) out.push(current);
  return out;
}

function extractAnswerInfo(lines: string[]): {
  answer?: string;
  notes?: string;
  letters?: string[];
} {
  // Accept a variety of answer indicator lines
  const indicator = /^(ans|answer|answers|correct\s+answer(?:s)?|correct\s+option(?:s)?)\s*[-:]/i;
  const ansIdx = lines.findIndex((l) => indicator.test(l.trim()));

  let answer: string | undefined;
  let notes: string | undefined;
  let letters: string[] = [];

  if (ansIdx >= 0) {
    const ansLine = lines[ansIdx].replace(indicator, "").trim();
    answer = normalizeTextBlock(ansLine);
    notes = normalizeTextBlock(lines.slice(ansIdx + 1).join("\n")) || undefined;
  } else {
    // fallback: try any inline pattern like "Correct answer: X"
    const inlineIdx = lines.findIndex((l) => /answer\s*[:\-]/i.test(l));
    if (inlineIdx >= 0) {
      const m = lines[inlineIdx].split(/[:\-]/, 2)[1] ?? "";
      answer = normalizeTextBlock(m);
      notes = normalizeTextBlock(lines.slice(inlineIdx + 1).join("\n")) || undefined;
    } else {
      // final fallback: take first non-empty line as answer candidate
      const first = lines.find((l) => l.trim().length > 0);
      if (first) answer = normalizeTextBlock(first);
      notes = normalizeTextBlock(lines.slice(1).join("\n")) || undefined;
    }
  }

  // Extract explicit letters from any answer-related line
  const letterRe = /\b([A-J])\b/g;
  const related = /correct|ans|answer/i;
  const candidates: Set<string> = new Set();
  for (const l of lines) {
    if (related.test(l)) {
      let m: RegExpExecArray | null;
      const s = l.toUpperCase();
      while ((m = letterRe.exec(s))) {
        candidates.add(m[1]);
      }
    }
  }
  // Also, if notes contain lines like "A. ..." collect those letters
  if (notes) {
    const startLetters = notes
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[A-J][\.)]\s+/.test(l))
      .map((l) => l[0]);
    for (const c of startLetters) candidates.add(c);
  }

  letters = Array.from(candidates);
  return { answer, notes, letters: letters.length ? letters : undefined };
}

function mapLettersToIndexes(
  letters: string[] | undefined,
  options: string[] | undefined
): number[] | undefined {
  if (!letters || !options || options.length === 0) return undefined;
  const idxs = letters
    .map((l) => l.toUpperCase().charCodeAt(0) - "A".charCodeAt(0))
    .filter((i) => i >= 0 && i < options.length);
  return idxs.length
    ? Array.from(new Set(idxs)).sort((a, b) => a - b)
    : undefined;
}

function fuzzyMatchAnswerToOptions(
  answer: string | undefined,
  options: string[] | undefined
): number[] | undefined {
  if (!answer || !options || options.length === 0) return undefined;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const ans = norm(answer);
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < options.length; i++) {
    const o = norm(options[i]);
    if (!o) continue;
    const aTokens = new Set(ans.split(" "));
    const oTokens = new Set(o.split(" "));
    let inter = 0;
    for (const t of oTokens) if (aTokens.has(t)) inter++;
    const score = inter / Math.max(1, oTokens.size);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore >= 0.35 && bestIdx >= 0 ? [bestIdx] : undefined;
}

async function parsePdfText(pdfPath: string): Promise<string> {
  const buf = readFileSync(pdfPath);
  const require = createRequire(import.meta.url);
  const pdfParse: (
    b: Buffer
  ) => Promise<{ text: string }> = require("pdf-parse");
  const data = await pdfParse(buf);
  return data.text;
}

async function main() {
  const { pdf, solutions, output } = parseArgs();
  if (!pdf || !solutions || !output) {
    console.error(
      "Usage: ts-node scripts/build-questions.ts --pdf <path> --solutions <path> --output <path>"
    );
    process.exit(1);
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const pdfPath = resolve(__dirname, pdf);
  const solPath = resolve(__dirname, solutions);
  // resolve output relative to current working directory (project root when run via npm)
  const outPath = resolve(process.cwd(), output);

  console.log("Reading PDF…");
  const pdfText = await parsePdfText(pdfPath);
  if (process.env.DEBUG_PDF) {
    const debugOut = resolve(__dirname, "tmp/pdf.txt");
    mkdirSync(dirname(debugOut), { recursive: true });
    writeFileSync(debugOut, pdfText, "utf8");
    console.log(`Wrote raw PDF text to ${debugOut}`);
  }
  const pdfItems = splitPdfIntoQuestions(pdfText);

  console.log(`Extracted ${pdfItems.length} questions from PDF`);

  const solRaw = readFileSync(solPath, "utf8");
  const solBlocks = splitSolutions(solRaw);
  const solMap = new Map<
    number,
    { answer?: string; notes?: string; letters?: string[] }
  >();
  for (const b of solBlocks) solMap.set(b.id, extractAnswerInfo(b.lines));

  const merged: QuizItem[] = pdfItems.map((it) => {
    const s = solMap.get(it.id);
    const answer = s?.answer;
    const notes = s?.notes;
    const letters = s?.letters;
    let correct = mapLettersToIndexes(letters, it.options);
    if (!correct) correct = fuzzyMatchAnswerToOptions(answer, it.options);
    const type: "single" | "multi" =
      it.type ?? (correct && correct.length > 1 ? "multi" : "single");
    // Fallback: derive human-readable answer text from correct option(s)
    let answerText = answer;
    if ((!answerText || answerText.length < 2) && correct && it.options && correct.length > 0) {
      answerText = correct
        .map((i) => `${String.fromCharCode(65 + i)}. ${it.options![i]}`)
        .join("\n");
    }
    return {
      id: it.id,
      question: it.question,
      options: it.options,
      answer: answerText,
      notes,
      correct,
      type,
    };
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");
  console.log(`Wrote ${merged.length} questions -> ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
