import React, { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, X, XCircle } from "lucide-react";
import { WeeklyLearningStep } from "../types";

interface Quiz {
  passMark: number;
  questions: { id: string; skill: string; question: string; options: string[] }[];
}

interface Marked {
  score: number;
  passMark: number;
  passed: boolean;
  results: { id: string; correct: boolean; answer: string; explanation: string }[];
}

/**
 * The knowledge check of one learning step. The questions and the marking come from the
 * server. (Every step used to show the same question, whose first answer scored 92 and
 * any other 65.)
 */
export const KnowledgeCheck: React.FC<{
  step: WeeklyLearningStep;
  onClose: () => void;
  onPlan: (plan: WeeklyLearningStep[]) => void;
  onMarkDone: () => void;
}> = ({ step, onClose, onPlan, onMarkDone }) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState("");
  const [marked, setMarked] = useState<Marked | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/learning-plan/step/${encodeURIComponent(step.id)}/quiz`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
        if (!cancelled) setQuiz(data);
      })
      .catch(err => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [step.id]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/learning-plan/step/${encodeURIComponent(step.id)}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, timeSpentMins: Number(minutes) || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
      setMarked(data);
      onPlan(data.plan);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const answered = quiz ? quiz.questions.filter(q => answers[q.id]).length : 0;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-label="Knowledge check" className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 animate-scale-up">
        <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
          <div>
            <span className="text-[10px] font-mono text-[#10B981] uppercase font-bold tracking-wider">Knowledge check</span>
            <h3 className="text-sm font-bold text-[#F0F4FF]">{step.title}</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[#94A3B8] hover:text-[#F0F4FF] cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
        {!quiz && !error && <div className="skeleton h-32" />}

        {quiz && quiz.questions.length === 0 && (
          <div className="space-y-3 text-xs text-[#94A3B8]">
            <p>There is no knowledge check for <strong className="text-[#F0F4FF]">{step.skillFocus}</strong>, so no score is recorded for this step.</p>
            <button onClick={onMarkDone} className="px-4 py-2 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] font-mono font-bold rounded-md cursor-pointer">
              Mark this step done
            </button>
          </div>
        )}

        {marked && (
          <p role="status" className="text-sm font-bold" style={{ color: marked.passed ? "var(--ok)" : "var(--warn)" }}>
            {marked.score}% - {marked.passed
              ? "passed. The step is complete."
              : `not passed yet; you need ${marked.passMark}%. Read the explanations, then try again.`}
          </p>
        )}

        {quiz?.questions.map((q, i) => {
          const result = marked?.results.find(r => r.id === q.id);
          return (
            <fieldset key={q.id} className="space-y-2">
              <legend className="text-xs font-bold text-[#F0F4FF] leading-relaxed">
                {i + 1}. {q.question} <span className="text-[10px] font-mono font-normal text-[#94A3B8]">({q.skill})</span>
              </legend>
              {q.options.map(option => (
                <label
                  key={option}
                  className={`flex items-center gap-2.5 p-2.5 rounded-md text-xs border ${result ? "" : "cursor-pointer"} ${
                    answers[q.id] === option ? "bg-[#4F8EF7]/15 border-[#4F8EF7] text-[#F0F4FF]" : "bg-[#0F1724] border-[#2A384C] text-[#94A3B8]"
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={option}
                    checked={answers[q.id] === option}
                    disabled={!!marked}
                    onChange={() => setAnswers(prev => ({ ...prev, [q.id]: option }))}
                  />
                  <span>{option}</span>
                </label>
              ))}
              {result && (
                <p className="text-[11px] text-[#94A3B8] flex items-start gap-1.5">
                  {result.correct
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981] shrink-0 mt-0.5" />
                    : <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />}
                  <span>{!result.correct && <strong className="text-[#F0F4FF]">Right answer: {result.answer}. </strong>}{result.explanation}</span>
                </p>
              )}
            </fieldset>
          );
        })}

        {quiz && quiz.questions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#2A384C]">
            <span className="text-[10px] font-mono text-[#94A3B8]">
              Pass mark {quiz.passMark}% - {answered} of {quiz.questions.length} answered
            </span>
            {marked ? (
              marked.passed ? (
                <button onClick={onClose} className="px-4 py-1.5 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] text-xs font-mono font-bold rounded-md cursor-pointer">Close</button>
              ) : (
                <button
                  onClick={() => { setMarked(null); setAnswers({}); }}
                  className="px-4 py-1.5 bg-[#4F8EF7] text-[#0F1724] text-xs font-mono font-bold rounded-md cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </button>
              )
            ) : (
              <div className="flex items-center gap-3">
                <label className="text-[10px] font-mono text-[#94A3B8] flex items-center gap-1.5">
                  Minutes studied (optional)
                  <input
                    type="number" min={1} max={1000} value={minutes} onChange={e => setMinutes(e.target.value)}
                    className="w-16 bg-[#0F1724] text-[#F0F4FF] text-xs p-1.5 rounded border border-[#2A384C]"
                  />
                </label>
                <button
                  id="submit-knowledge-check"
                  onClick={submit}
                  disabled={busy || answered < quiz.questions.length}
                  className="px-4 py-1.5 text-xs font-mono font-bold rounded-md bg-[#10B981] hover:bg-[#059669] text-[#0F1724] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? "Marking..." : "Submit answers"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
