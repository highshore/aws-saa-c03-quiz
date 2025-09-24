/*
  Node script to parse `AWS SAA-03 Solution.txt` into JSON quiz items.
  Usage: ts-node scripts/parse-solutions.ts \
    --input "../AWS SAA-03 Solution.txt" \
    --output "../quiz-app/src/data/questions.json"
*/

/// <reference types="node" />
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

interface QuizItem {
  id: number;
  question: string;
  answer: string;
  notes?: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!key?.startsWith('--')) continue;
    out[key.slice(2)] = val;
  }
  return out as { input?: string; output?: string };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function splitIntoItems(raw: string): QuizItem[] {
  // Items begin with lines like: `1]` or `1] ` and question text continues until a blank line before `ans-` or next number.
  // We'll detect blocks by number anchors.
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const items: { id: number; lines: string[] }[] = [];

  let current: { id: number; lines: string[] } | null = null;
  const startRe = /^([1-9]\d{0,3})\]\s*/; // up to 4-digit non-zero question numbers

  for (const line of lines) {
    const m = line.match(startRe);
    if (m) {
      if (current) items.push(current);
      current = { id: Number(m[1]), lines: [line.replace(startRe, '').trim()] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) items.push(current);

  const quiz: QuizItem[] = items.map(({ id, lines }) => {
    const text = lines.join('\n');
    // Find the first "ans-" line as answer, rest above as the question.
    const ansIdx = lines.findIndex(l => /^ans[-:]/i.test(l.trim()));
    let question = '';
    let answer = '';
    let notes = '';

    if (ansIdx >= 0) {
      question = normalizeWhitespace(lines.slice(0, ansIdx).join(' ').trim());
      // answer line may include content after ans-
      const ansLine = lines[ansIdx].trim();
      const ans = ansLine.replace(/^ans[-:]/i, '').trim();
      // collect notes until a clear separator line of dashes or next numbered question (already split) 
      const rest = lines.slice(ansIdx + 1).join('\n');
      const noteStop = rest.search(/\n[-=]{5,}\n/i);
      notes = normalizeWhitespace(noteStop >= 0 ? rest.slice(0, noteStop) : rest);
      answer = ans || '(answer text missing)';
    } else {
      // Try alternate pattern where options A./B./C. exist and a line like `Which solution ...` precedes.
      const whichIdx = lines.findIndex(l => /Which .*\?$/i.test(l.trim()));
      if (whichIdx >= 0) {
        question = normalizeWhitespace(lines.slice(0, whichIdx + 1).join(' '));
        // Find the first line starting with letter option and the chosen letter annotated later
        const choiceIdx = lines.findIndex(l => /^([A-D])\./.test(l.trim()));
        if (choiceIdx >= 0) {
          // Some entries immediately mark the correct letter on the next line or in commentary; we take that first option line as answer text
          answer = normalizeWhitespace(lines[choiceIdx].replace(/^([A-D])\./, '').trim());
          notes = normalizeWhitespace(lines.slice(choiceIdx + 1).join('\n'));
        } else {
          answer = '(answer not found)';
          notes = normalizeWhitespace(lines.join('\n'));
        }
      } else {
        question = normalizeWhitespace(text);
        answer = '(answer not found)';
      }
    }

    return { id, question, answer, notes: notes || undefined };
  });

  return quiz.sort((a, b) => a.id - b.id);
}

function main() {
  const { input, output } = parseArgs();
  if (!input || !output) {
    console.error('Usage: ts-node scripts/parse-solutions.ts --input <path> --output <path>');
    process.exit(1);
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const inPath = resolve(__dirname, input);
  const outPath = resolve(__dirname, output);
  const raw = readFileSync(inPath, 'utf8');
  const items = splitIntoItems(raw);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf8');
  console.log(`Parsed ${items.length} items -> ${outPath}`);
}

main();


