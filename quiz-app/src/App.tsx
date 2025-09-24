import { useEffect, useMemo, useState } from "react";
import "./App.css";
import type { QuizItem } from "./types";
import { auth, signInWithGoogle, signOut } from "./lib/firebase";

function useQuestions() {
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/questions.json")
      .then((r) => r.json())
      .then(setItems)
      .catch((e) => setError(String(e)));
  }, []);
  return { items, error };
}

function App() {
  const { items, error } = useQuestions();
  const [index, setIndex] = useState(0);
  const [show, setShow] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!items) return [] as QuizItem[];
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => {
      const inQ = it.question.toLowerCase().includes(term);
      const inA = (it.answer?.toLowerCase().includes(term) ?? false);
      return inQ || inA;
    });
  }, [items, q]);

  useEffect(() => {
    setIndex(0);
    setShow(false);
    setSelected([]);
  }, [q]);

  if (error) return <div style={{ padding: 24 }}>Failed to load: {error}</div>;
  if (!items) return <div style={{ padding: 24 }}>Loading questions…</div>;
  if (filtered.length === 0)
    return (
      <div style={{ padding: 24 }}>
        <Controls
          q={q}
          setQ={setQ}
          count={items.length}
          shown={filtered.length}
        />
        <p>No results.</p>
      </div>
    );

  const current = filtered[Math.max(0, Math.min(index, filtered.length - 1))];
  const answerText =
    current.answer ??
    (current.correct && current.options
      ? current.correct
          .map((i) => `${String.fromCharCode(65 + i)}. ${current.options![i]}`)
          .join("\n")
      : "(not available)");

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1>AWS SAA-C03 Quiz</h1>
      <AuthPanel />
      <Controls
        q={q}
        setQ={setQ}
        count={items.length}
        shown={filtered.length}
      />
      <nav style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button
          onClick={() => {
            setIndex((i) => {
              const ni = Math.max(0, i - 1);
              setSelected([]);
              return ni;
            });
            setShow(false);
          }}
        >
          Prev
        </button>
        <button
          onClick={() => {
            setShow((s) => !s);
          }}
        >
          {show ? "Hide" : "Show"} Answer
        </button>
        <button
          onClick={() => {
            setIndex((i) => {
              const ni = Math.min(filtered.length - 1, i + 1);
              setSelected([]);
              return ni;
            });
            setShow(false);
          }}
        >
          Next
        </button>
        <span style={{ marginLeft: "auto" }}>
          Question {index + 1} of {filtered.length} (id {current.id})
        </span>
      </nav>
      <section>
        <h3 style={{ marginTop: 8 }}>Question</h3>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {current.question}
        </p>
      </section>
      {current.options && (
        <Options
          options={current.options}
          selected={selected}
          setSelected={setSelected}
          type={current.type ?? "single"}
          correct={current.correct}
          revealed={show}
        />
      )}
      {show && (
        <section style={{ marginTop: 16 }}>
          <h3>Answer</h3>
          <p
            style={{
              whiteSpace: "pre-wrap",
              background: "#2b2b2b",
              color: "#fff",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #444",
            }}
          >
            {answerText}
          </p>
          {current.options && current.correct && (
            <p style={{ marginTop: 8 }}>
              Correct option{current.correct.length > 1 ? "s" : ""}:{" "}
              {current.correct
                .map((i) => String.fromCharCode(65 + i))
                .join(", ")}
            </p>
          )}
          {current.notes && (
            <details style={{ marginTop: 8 }}>
              <summary>Notes</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  background: "#1f1f1f",
                  color: "#fff",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid #444",
                }}
              >
                {current.notes}
              </pre>
            </details>
          )}
        </section>
      )}
      <section style={{ marginTop: 24 }}>
        <h3>Jump to</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
            gap: 8,
          }}
        >
          {filtered.map((it, idx) => (
            <button
              key={it.id}
              onClick={() => {
                setIndex(idx);
                setShow(false);
              }}
              style={{ padding: "6px 8px" }}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Controls({
  q,
  setQ,
  count,
  shown,
}: {
  q: string;
  setQ: (s: string) => void;
  count: number;
  shown: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        margin: "8px 0",
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search in questions/answers"
        style={{ flex: 1, padding: 8 }}
      />
      <span style={{ opacity: 0.7 }}>
        {shown} of {count}
      </span>
    </div>
  );
}

export default App;

function AuthPanel() {
  const [user, setUser] = useState(() => auth?.currentUser ?? null);
  useEffect(() => {
    if (!auth) return;
    return auth.onAuthStateChanged((u) => setUser(u));
  }, []);
  if (!auth) return null;
  return (
    <div
      style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}
    >
      {user ? (
        <>
          <img
            src={user.photoURL ?? ""}
            alt=""
            style={{ width: 28, height: 28, borderRadius: "50%" }}
          />
          <span>{user.displayName ?? user.email}</span>
          <button onClick={() => signOut()}>Sign out</button>
        </>
      ) : (
        <button onClick={() => signInWithGoogle()}>Sign in with Google</button>
      )}
    </div>
  );
}

function Options({
  options,
  selected,
  setSelected,
  type,
  correct,
  revealed,
}: {
  options: string[];
  selected: number[];
  setSelected: (s: number[]) => void;
  type: "single" | "multi";
  correct?: number[];
  revealed: boolean;
}) {
  const isSelected = (i: number) => selected.includes(i);
  const toggle = (i: number) => {
    if (type === "single") {
      setSelected(isSelected(i) ? [] : [i]);
    } else {
      setSelected(
        isSelected(i) ? selected.filter((x) => x !== i) : [...selected, i]
      );
    }
  };
  const hasCorrect = Array.isArray(correct) && correct.length > 0;
  const isCorrect = (i: number) =>
    revealed && hasCorrect && correct!.includes(i);
  const isWrong = (i: number) =>
    revealed && hasCorrect && selected.includes(i) && !isCorrect(i);
  return (
    <section style={{ marginTop: 16 }}>
      <h3>Options {type === "multi" ? "(Select all that apply)" : ""}</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {options.map((opt, i) => {
          const bg = isCorrect(i)
            ? "#154a2a" // dark green for correct
            : isWrong(i)
            ? "#5a1a1a" // dark red for wrong
            : "#2b2b2b"; // dark neutral for default
          const border = isSelected(i) ? "2px solid #90caf9" : "1px solid #444";
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                background: bg,
                border,
                borderRadius: 8,
                color: "#fff",
              }}
            >
              <strong style={{ marginRight: 8 }}>
                {String.fromCharCode(65 + i)}.
              </strong>
              <span style={{ whiteSpace: "pre-wrap" }}>{opt}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
