export interface QuizItem {
  id: number;
  question: string;
  answer?: string;
  notes?: string;
  options?: string[];
  correct?: number[];
  type?: "single" | "multi";
}
