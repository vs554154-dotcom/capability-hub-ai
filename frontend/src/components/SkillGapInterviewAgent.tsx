import React, { useState, useRef, useEffect } from "react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Cpu,
  FileText,
  Award,
  ArrowRight,
  RefreshCw,
  BookOpen,
  Play,
  Square,
  BarChart2,
  Compass,
  Brain,
  Zap,
  Target,
  Heart,
  UserCheck,
  Sliders,
  ChevronRight,
  Upload,
  UploadCloud,
  FileCode,
  FileCheck,
  Trash2,
  Eye,
  EyeOff,
  Paperclip,
  Check,
  X,
  Code,
  Layers,
  ShieldCheck,
  HelpCircle,
  Terminal,
  FileSpreadsheet,
  Briefcase,
  TrendingUp,
  Plus
} from "lucide-react";
import { ActiveProject, CapabilityGap, SkillGapAssessment, User } from "../types";
import { parseUploadedFile, ParsedFileInfo } from "../utils/fileParser";

// The right option and its explanation arrive only once a question has been answered:
// the server keeps the key and scores the answers.
interface MCQ {
  id: string;
  question: string;
  options: string[];
  skillArea?: string;
}

interface McqOutcome {
  correct: boolean;
  correctIndex: number;
  explanation: string;
}

interface VideoQuestion {
  id: string;
  title: string;
  question: string;
  keyRubrics: string[];
  maxDurationSeconds: number;
}

export interface RoleWeightage {
  requirementsAnalysis: number;
  design: number;
  coding: number;
  architecture: number;
  problemSolving: number;
  communication: number;
}

export interface AssessmentTypeWeightage {
  mcqsWeight: number;
  scenariosWeight: number;
  practicalWeight: number;
}

export interface PracticalExercise {
  type: "coding" | "architecture" | "functional";
  title: string;
  problemStatement: string;
  requirements: string[];
  starterTemplate?: string;
  evaluationRubrics: string[];
  testCases?: string[];
  tradeoffDimensions?: string[];
}

interface Assessment {
  id: string;
  assessmentMode?: "project_hiring" | "self_upskilling";
  currentDesignation?: string;
  targetRole?: string;
  targetSkillsToUpgrade?: string;
  roleCategory?: "SSA" | "SSE" | "TA" | "OTHER";
  roleTitle: string;
  weightage?: RoleWeightage;
  assessmentTypeWeightage?: AssessmentTypeWeightage;
  mcqs: MCQ[];
  videoQuestions: VideoQuestion[];
  practicalExercise?: PracticalExercise;
  /** Set when no model was reachable: the questions come from the question bank. */
  _fallback?: boolean;
}

const postJson = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
  return data;
};

const WILL_SECTIONS = [
  ["sec1_intent", 30], ["sec2_behavior", 25], ["sec3_adaptability", 20],
  ["sec4_commitment", 15], ["sec5_engagement", 10],
] as const;
type WillKey = (typeof WILL_SECTIONS)[number][0];
const NO_WILL: Record<WillKey, number | null> = {
  sec1_intent: null, sec2_behavior: null, sec3_adaptability: null, sec4_commitment: null, sec5_engagement: null,
};

interface AnswerEvaluation {
  overallScore: number;
  technicalScore: number;
  problemSolvingScore: number;
  communicationScore: number;
  speechFluencyScore?: number;
  grammarScore?: number;
  pronunciationScore?: number;
  bodyLanguageScore?: number;
  strengths: string[];
  missingConcepts: string[];
  technicalGaps?: string[];
  communicationGaps?: string[];
  technicalCourses?: string[];
  softSkillCourses?: string[];
  feedback: string;
  recommendedLearning: string[];
  /** Set when no model was reachable and the score is a length-based placeholder. */
  _fallback?: boolean;
}

interface SkillGapInterviewAgentProps {
  currentUser: User;
  /** The project this person was handed off to, with the skills it still misses. */
  project?: ActiveProject | null;
  onNavigateToDashboard?: () => void;
  onRedirectToConcierge?: (identifiedGaps: string[], targetRole?: string) => void;
}

const PRESET_JDS = [
  {
    title: "Senior Systems Analyst (SSA)",
    category: "SSA",
    jd: `Role Purpose: Acts as the bridge between business stakeholders and engineering teams by translating business problems into implementable technical requirements.
Primary Responsibilities:
- Requirements Management: Gather and analyze business requirements, create BRD & FRD, write User Stories with acceptance criteria, maintain Requirement Traceability Matrix (RTM).
- Solution Analysis: Conduct feasibility analysis, evaluate alternative technical solutions, perform gap analysis.
- Stakeholder Management: Facilitate requirement clarification workshops, resolve requirement ambiguities, drive stakeholder consensus.
- Delivery Support: Assist QA and UAT teams, validate delivered features against original business expectations.`
  },
  {
    title: "Senior Software Engineer (SSE)",
    category: "SSE",
    jd: `Role Purpose: Designs, develops, tests, and maintains enterprise-grade software solutions while driving engineering excellence and high code quality.
Primary Responsibilities:
- Solution Development: Build scalable web applications, microservices, APIs, reusable components, and perform complex database queries.
- Technical Ownership: Lead code reviews, drive refactoring of technical debt, optimize application performance and latency.
- Quality Engineering: Write unit/integration test suites, enforce design patterns, adhere to enterprise CI/CD standards.
- Team Mentorship: Guide junior developers, promote engineering best practices.`
  },
  {
    title: "Technical Architect (TA)",
    category: "TA",
    jd: `Role Purpose: Defines and governs enterprise solution architecture while ensuring scalability, security, reliability, maintainability, and business alignment.
Primary Responsibilities:
- Architecture Design: End-to-end Application Architecture, Integration Patterns, Cloud Infrastructure, and Security Frameworks.
- Technology Leadership: Lead technology selection, establish architecture guardrails, conduct architecture review boards (ARB).
- Risk Mitigation: Identify technical risks, evaluate trade-offs in scalability, zero-trust security, and Disaster Recovery (DR/HA).
- Strategic Planning: Formulate long-term technology roadmaps and drive legacy system modernization.`
  },
  {
    title: "Senior GenAI Solutions Architect",
    category: "TA",
    jd: `We are looking for a Senior GenAI Architect to design, deploy, and scale production LLM applications.
Key Requirements:
- Deep experience with Gemini API, RAG (Retrieval-Augmented Generation), vector databases, and prompt engineering.
- Ability to architect server-side secure guardrails, function calling, and multi-agent workflows.
- Strong knowledge of evaluation metrics (MRR, NDCG), latency optimization, and cost governance.
- Excellent executive technical communication and team mentorship.`
  }
];

export const SkillGapInterviewAgent: React.FC<SkillGapInterviewAgentProps> = ({
  currentUser,
  project,
  onNavigateToDashboard,
  onRedirectToConcierge
}) => {
  // Mode / Step State
  const [step, setStep] = useState<"input" | "assessment" | "results">("input");
  
  // Assessment Intent & Context State (Project Hiring vs Self-Upskilling)
  const [assessmentMode, setAssessmentMode] = useState<"project_hiring" | "self_upskilling">(
    project ? "project_hiring" : "self_upskilling"
  );
  // Whether the assessment is for the project handed to this person, not another JD.
  const [forProject, setForProject] = useState(!!project);
  const [currentDesignation, setCurrentDesignation] = useState<string>(
    currentUser.title || "Senior Software Engineer"
  );
  // Starts as this person's own largest gaps, once they are loaded.
  const [targetSkillsToUpgrade, setTargetSkillsToUpgrade] = useState<string>("");
  const [knownGaps, setKnownGaps] = useState<CapabilityGap[]>([]);
  const [lastAssessment, setLastAssessment] = useState<SkillGapAssessment | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${currentUser.id}/skillgap-assessment`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        setKnownGaps(data.gaps);
        setLastAssessment(data.assessment);
        const names = data.gaps.filter((g: CapabilityGap) => g.skillId).slice(0, 4).map((g: CapabilityGap) => g.skillName);
        setTargetSkillsToUpgrade(prev => prev || names.join(", "));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentUser.id]);

  // Input State
  // Starts as the project handed to this person, else their own target role by title.
  const [targetRole, setTargetRole] = useState(project?.demand.projectName || "");
  useEffect(() => {
    if (project || !currentUser.targetRoleId) return;
    let cancelled = false;
    fetch("/api/roles")
      .then(res => (res.ok ? res.json() : []))
      .then((roles: { id: string; title: string }[]) => {
        const title = roles.find(r => r.id === currentUser.targetRoleId)?.title;
        if (!cancelled && title) setTargetRole(prev => prev || title);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentUser.targetRoleId, project]);
  const [jobDescription, setJobDescription] = useState(project?.jobDescription || "");
  // The handoff is looked up after sign-in, so it can arrive after this screen opens.
  const applyProject = () => {
    if (!project) return;
    setAssessmentMode("project_hiring");
    setForProject(true);
    setTargetRole(project.demand.projectName);
    setJobDescription(project.jobDescription);
  };
  useEffect(applyProject, [project?.demand.id]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // File Upload State for Resumes & JD Documents
  const [uploadedResume, setUploadedResume] = useState<ParsedFileInfo | null>(null);
  const [uploadedJdFile, setUploadedJdFile] = useState<ParsedFileInfo | null>(null);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [isParsingJd, setIsParsingJd] = useState(false);
  const [fileParseError, setFileParseError] = useState<string | null>(null);
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [isDraggingResume, setIsDraggingResume] = useState(false);

  const resumeInputRef = useRef<HTMLInputElement | null>(null);
  const jdInputRef = useRef<HTMLInputElement | null>(null);

  // File Upload Handlers
  const handleResumeFileChange = async (file: File) => {
    if (!file) return;
    setIsParsingResume(true);
    setFileParseError(null);
    try {
      const parsed = await parseUploadedFile(file);
      setUploadedResume(parsed);
    } catch (err: any) {
      setFileParseError(err?.message || "Failed to parse resume document.");
    } finally {
      setIsParsingResume(false);
    }
  };

  const handleJdFileChange = async (file: File) => {
    if (!file) return;
    setIsParsingJd(true);
    setFileParseError(null);
    try {
      const parsed = await parseUploadedFile(file);
      setUploadedJdFile(parsed);
      if (parsed.extractedText.trim().length > 20) {
        setForProject(false);
        setJobDescription(parsed.extractedText);
      }
    } catch (err: any) {
      setFileParseError(err?.message || "Failed to parse JD file.");
    } finally {
      setIsParsingJd(false);
    }
  };

  // Assessment State
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [activeTab, setActiveTab] = useState<"framework" | "mcq" | "video" | "practical" | "will">("framework");

  // Practical Exercise State
  const [practicalCode, setPracticalCode] = useState("");
  const [practicalScore, setPracticalScore] = useState<number | null>(null);
  const [practicalFeedback, setPracticalFeedback] = useState<string | null>(null);
  const [practicalProvisional, setPracticalProvisional] = useState(false);
  const [practicalError, setPracticalError] = useState<string | null>(null);
  const [isEvaluatingPractical, setIsEvaluatingPractical] = useState(false);

  // MCQ State: the option chosen, and the server's verdict once it is checked.
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number>>({});
  const [mcqOutcomes, setMcqOutcomes] = useState<Record<string, McqOutcome>>({});
  const [mcqError, setMcqError] = useState<string | null>(null);
  const [checkingMcq, setCheckingMcq] = useState<string | null>(null);

  // The finished assessment, as scored and stored by the server.
  const [finished, setFinished] = useState<SkillGapAssessment | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Video / Audio Interview State
  const [currentVideoIdx, setCurrentVideoIdx] = useState(0);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  // Kept per question: one shared answer box carried the last question's answer into
  // the next one.
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const activeQuestionId = assessment?.videoQuestions[currentVideoIdx]?.id ?? "";
  const spokenTranscript = transcripts[activeQuestionId] ?? "";
  const setSpokenTranscript = (text: string) =>
    setTranscripts(prev => ({ ...prev, [activeQuestionId]: text }));
  // Shown when speech cannot be transcribed, so the candidate knows to type instead.
  const [transcriptHint, setTranscriptHint] = useState("");
  const [isSpeechSpeaking, setIsSpeechSpeaking] = useState(false);
  const [evaluations, setEvaluations] = useState<Record<string, AnswerEvaluation>>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Will & Behavioral Motivation State (5 Targeted Questions across 5 Sections)
  // Unanswered until chosen. (Every answer used to start at 100%.)
  const [willAnswers, setWillAnswers] = useState<Record<WillKey, number | null>>(NO_WILL);

  // Video and Speech References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Each stage starts at its top; the button that leads to it is at the bottom.
  useEffect(() => {
    if (step !== "input") {
      document.getElementById("skillgap-stage")?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [step, activeTab]);

  // Clean up media streams on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // Handle Camera Toggle
  const [cameraError, setCameraError] = useState<string | null>(null);
  const startCameraStream = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOn(true);
      setIsMicOn(true);

      // Start Audio Volume VU Level Meter
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateAudioMeter = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((average / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateAudioMeter);
        };
        updateAudioMeter();
      } catch (err) {
        console.warn("Audio meter setup error:", err);
      }

    } catch (err: any) {
      // Tell the candidate, and how to carry on, rather than only logging it.
      setIsCameraOn(false);
      setCameraError(
        err?.name === "NotAllowedError"
          ? "Camera and microphone access is blocked. Allow it in the browser's address bar, or type your answers instead."
          : err?.name === "NotFoundError"
          ? "No camera or microphone was found. You can type your answers instead."
          : "The camera or microphone could not be started. You can type your answers instead."
      );
    }
  };

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setAudioLevel(0);
  };

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCameraStream();
    } else {
      startCameraStream();
    }
  };

  // AI Voice Text-to-Speech
  const speakQuestion = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeechSpeaking(true);
      utterance.onend = () => setIsSpeechSpeaking(false);
      utterance.onerror = () => setIsSpeechSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeechSpeaking(false);
    }
  };

  // Speech-to-Text Recording logic
  const startRecording = () => {
    // What is already written is kept, and speech is added after it. (Starting to record
    // used to clear a typed answer, even when no microphone was available.)
    const written = spokenTranscript.trim();
    setTranscriptHint("");
    setIsRecording(true);

    if (!isCameraOn) {
      startCameraStream();
    }

    // Try Web Speech API if supported by browser
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let accumulated = "";
        recognition.onresult = (event: any) => {
          let currentResult = "";
          for (let i = 0; i < event.results.length; i++) {
            currentResult += event.results[i][0].transcript;
          }
          setSpokenTranscript([written, currentResult.trim()].filter(Boolean).join(" "));
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition notice:", event.error);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn("Speech recognition initialization fallback:", err);
      }
    }

    if (!SpeechRecognition) {
      setTranscriptHint("This browser cannot transcribe speech. Type your answer in the box below instead.");
    }
    // If recognition stays silent, the effect below says so. (This used to fill in a
    // ready-made expert answer as the candidate's transcript - and score it.)
  };

  useEffect(() => {
    if (spokenTranscript) {
      setTranscriptHint("");
      return;
    }
    if (!isRecording) return;
    const timer = setTimeout(
      () => setTranscriptHint("Nothing heard yet. Check that the microphone is allowed, or type your answer below."),
      6000,
    );
    return () => clearTimeout(timer);
  }, [isRecording, spokenTranscript]);

  const stopRecording = () => {
    setIsRecording(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
  };

  const resetAnswers = () => {
    setMcqAnswers({});
    setMcqOutcomes({});
    setMcqError(null);
    setTranscripts({});
    setEvaluations({});
    setEvalError(null);
    setCurrentVideoIdx(0);
    setPracticalCode("");
    setPracticalScore(null);
    setPracticalFeedback(null);
    setPracticalProvisional(false);
    setPracticalError(null);
    setWillAnswers(NO_WILL);
    setFinished(null);
    setFinishError(null);
  };

  // Generate Assessment from JD / Skill Gap Context via Backend
  const handleGenerateAssessment = async () => {
    if (!targetRole.trim()) {
      setGenerationError("A target role is required.");
      return;
    }
    if (assessmentMode === "project_hiring" && !jobDescription.trim()) {
      setGenerationError("Job Description is required for Project Hiring assessment mode.");
      return;
    }
    if (assessmentMode === "self_upskilling" && !targetSkillsToUpgrade.trim()) {
      setGenerationError("Target Skills to Upgrade are required for Self-Upskilling mode.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const projectMode = assessmentMode === "project_hiring";
      const data = await postJson("/api/agent/generate-jd-assessment", {
        assessmentMode,
        currentDesignation,
        targetRole,
        jobDescription: projectMode ? jobDescription : undefined,
        demandId: projectMode && forProject ? project?.demand.id : undefined,
        targetSkillsToUpgrade: projectMode ? undefined : targetSkillsToUpgrade,
        candidateResume: uploadedResume?.extractedText || undefined
      });
      resetAnswers();
      setAssessment(data.assessment);
      setStep("assessment");
      setActiveTab("mcq");
      // The camera starts when the candidate records an answer or turns it on -
      // not as soon as the questions appear.
    } catch (err: any) {
      setGenerationError(err?.message || "Error generating assessment.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Check one multiple-choice answer. The server records the first answer.
  const handleCheckMcq = async (q: MCQ) => {
    const optionIndex = mcqAnswers[q.id];
    if (!assessment || optionIndex === undefined) return;
    setCheckingMcq(q.id);
    setMcqError(null);
    try {
      const data = await postJson("/api/agent/assessment-answer", {
        assessmentId: assessment.id, questionId: q.id, optionIndex
      });
      setMcqOutcomes(prev => ({
        ...prev,
        [q.id]: { correct: data.correct, correctIndex: data.correctIndex, explanation: data.explanation }
      }));
    } catch (err: any) {
      setMcqError(err?.message || "The answer could not be checked.");
    } finally {
      setCheckingMcq(null);
    }
  };

  // Evaluate candidate's spoken answer via Backend
  const handleEvaluateAnswer = async (q: VideoQuestion) => {
    if (!assessment || !spokenTranscript.trim()) return;
    setIsEvaluating(true);
    setEvalError(null);

    try {
      const data = await postJson("/api/agent/evaluate-interview-answer", {
        assessmentId: assessment.id, questionId: q.id, candidateAnswer: spokenTranscript
      });
      setEvaluations(prev => ({ ...prev, [q.id]: data.evaluation }));
    } catch (err: any) {
      setEvalError(err?.message || "Failed to process evaluation.");
    } finally {
      setIsEvaluating(false);
    }
  };

  // Evaluate practical exercise solution. A failed request says so; it used to show a
  // made-up score of 85 or 82.
  const handleEvaluatePractical = async () => {
    if (!practicalCode.trim() || !assessment?.practicalExercise) return;
    setIsEvaluatingPractical(true);
    setPracticalError(null);
    try {
      const { evaluation } = await postJson("/api/agent/evaluate-interview-answer", {
        assessmentId: assessment.id, questionId: "practical", candidateAnswer: practicalCode
      });
      setPracticalScore(evaluation.overallScore);
      setPracticalFeedback(evaluation.feedback);
      setPracticalProvisional(!!evaluation._fallback);
    } catch (err: any) {
      setPracticalError(err?.message || "The solution could not be evaluated.");
    } finally {
      setIsEvaluatingPractical(false);
    }
  };

  // Self-reported Will, once all five questions are answered.
  const calculateWillScore = (): number | null =>
    WILL_SECTIONS.some(([key]) => willAnswers[key] === null)
      ? null
      : Math.round(WILL_SECTIONS.reduce((sum, [key, weight]) => sum + (willAnswers[key] as number) * weight, 0) / 100);

  const unansweredCount = assessment
    ? assessment.mcqs.filter(q => !mcqOutcomes[q.id]).length
      + assessment.videoQuestions.filter(q => !evaluations[q.id]).length
    : 0;

  // Finish: the server scores the stored answers and keeps the result, which the
  // Concierge, the manager and analytics then read.
  const handleFinish = async () => {
    if (!assessment) return;
    setIsFinishing(true);
    setFinishError(null);
    try {
      const data = await postJson("/api/agent/complete-skillgap-assessment", {
        assessmentId: assessment.id,
        willAnswers: calculateWillScore() === null ? undefined : willAnswers
      });
      stopCameraStream();
      setFinished(data.assessment);
      setLastAssessment(data.assessment);
      setStep("results");
    } catch (err: any) {
      setFinishError(err?.message || "The assessment could not be finished.");
    } finally {
      setIsFinishing(false);
    }
  };

  // --- STAGE 1: INPUT ASSESSMENT CONTEXT ---
  if (step === "input") {
    return (
      <div className="bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-xl max-w-5xl mx-auto space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#2A384C] pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#0F1724] border border-[#4F8EF7]/40 text-[#4F8EF7] rounded-lg shadow-sm">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#F0F4FF]">SkillGap-to-Growth Agent: 1st-Level Assessment (Video Q&A & MCQs)</h2>
                <span className="text-[10px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded uppercase">
                  Level-1 Skill Verification
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                Finds your capability gaps with multiple-choice and spoken questions, for a project or for your own growth. Your result is saved and passed to the Learning Concierge and your manager.
              </p>
            </div>
          </div>
        </div>

        {lastAssessment && (
          <p className="text-xs text-[#94A3B8]">
            Your last result: <strong className="text-[#F0F4FF]">{lastAssessment.roleTitle}</strong>{" "}
            {lastAssessment.result.overallScore !== null ? `${lastAssessment.result.overallScore}%` : "not graded"} on{" "}
            {new Date(lastAssessment.completedAt).toLocaleDateString()}. A new one replaces it.
          </p>
        )}

        {/* Assessment Purpose Mode Selector */}
        <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-4 space-y-3">
          <label className="text-[10px] font-mono font-bold text-[#4F8EF7] uppercase tracking-wider block">
            Select Assessment Mode & Purpose
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAssessmentMode("project_hiring")}
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex items-start gap-3 ${
                assessmentMode === "project_hiring"
                  ? "bg-[#141E30] border-[#4F8EF7] text-[#F0F4FF] shadow-md shadow-[#4F8EF7]/10 ring-1 ring-[#4F8EF7]"
                  : "bg-[#141E30]/40 border-[#2A384C] text-[#94A3B8] hover:border-[#4F8EF7]/50"
              }`}
            >
              <div className={`p-2 rounded ${assessmentMode === "project_hiring" ? "bg-[#4F8EF7]/20 text-[#4F8EF7]" : "bg-[#0F1724] text-[#94A3B8]"}`}>
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold block text-[#F0F4FF]">1. Project Hiring / Lateral Placement Mode</span>
                <span className="text-[11px] text-[#94A3B8] mt-1 block leading-relaxed">
                  Generates questions based on candidate designation and specific Project Job Description (JD) asks.
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAssessmentMode("self_upskilling")}
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex items-start gap-3 ${
                assessmentMode === "self_upskilling"
                  ? "bg-[#141E30] border-purple-500 text-[#F0F4FF] shadow-md shadow-purple-500/10 ring-1 ring-purple-500"
                  : "bg-[#141E30]/40 border-[#2A384C] text-[#94A3B8] hover:border-purple-500/50"
              }`}
            >
              <div className={`p-2 rounded ${assessmentMode === "self_upskilling" ? "bg-purple-500/20 text-purple-400" : "bg-[#0F1724] text-[#94A3B8]"}`}>
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold block text-[#F0F4FF]">2. Self-Upskilling & Career Transition Mode</span>
                <span className="text-[11px] text-[#94A3B8] mt-1 block leading-relaxed">
                  Generates questions based on current role, targeted role, and specific technical skills the employee wants to upgrade on.
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Employee Current Designation Field */}
        <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-4 space-y-2">
          <label className="text-xs font-mono font-bold text-[#F0F4FF] block">
            Employee Current Designation / Present Role
          </label>
          <input
            type="text"
            value={currentDesignation}
            onChange={(e) => setCurrentDesignation(e.target.value)}
            placeholder="e.g. Senior Software Engineer / Senior Systems Analyst"
            className="w-full bg-[#141E30] text-[#F0F4FF] text-xs py-2.5 px-4 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] font-mono"
          />
          <span className="text-[10px] text-[#94A3B8] font-mono block">
            The candidate's official current title, used by the Agent to evaluate background fitment.
          </span>
        </div>

        {/* MODE 1: PROJECT HIRING FIELDS */}
        {assessmentMode === "project_hiring" && (
          <div className="space-y-4">
            {/* Preset Role Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block">
                Select Preset Role or Provide Custom Job Description
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {project && (
                  <button
                    id="assess-for-project"
                    type="button"
                    onClick={applyProject}
                    className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer md:col-span-3 ${
                      forProject
                        ? "bg-[#0F1724] border-[#10B981] text-[#F0F4FF] shadow-md shadow-[#10B981]/10"
                        : "bg-[#0F1724]/40 border-[#2A384C] text-[#94A3B8] hover:border-[#10B981]/50"
                    }`}
                  >
                    <span className="text-xs font-bold block text-[#F0F4FF]">
                      Your project: {project.demand.projectName} ({project.demand.customerName})
                    </span>
                    <span className="text-[10px] text-[#94A3B8] mt-1 block font-mono">
                      {project.missingSkills.length > 0
                        ? `Asks first about the skills you are missing: ${project.missingSkills.join(", ")}`
                        : "You meet every required skill; the questions cover them all."}
                    </span>
                  </button>
                )}
                {PRESET_JDS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setForProject(false);
                      setTargetRole(preset.title);
                      setJobDescription(preset.jd);
                    }}
                    className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                      !forProject && targetRole === preset.title
                        ? "bg-[#0F1724] border-[#4F8EF7] text-[#F0F4FF] shadow-md shadow-[#4F8EF7]/10"
                        : "bg-[#0F1724]/40 border-[#2A384C] text-[#94A3B8] hover:border-[#4F8EF7]/50"
                    }`}
                  >
                    <span className="text-xs font-bold block text-[#F0F4FF]">{preset.title}</span>
                    <span className="text-[10px] text-[#94A3B8] line-clamp-2 mt-1 block font-mono">
                      {preset.jd.split('\n')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Role & JD Text */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono font-bold text-[#F0F4FF] block mb-1">
                  Project Target Role Title
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Senior Cloud Solutions Architect"
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs py-2.5 px-4 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-mono font-bold text-[#F0F4FF] block">
                    Job Description (JD) & Key Technical Requirements
                  </label>
                  <button
                    type="button"
                    onClick={() => jdInputRef.current?.click()}
                    className="text-[10px] font-mono font-bold text-[#4F8EF7] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span>Upload JD File (PDF/Word/TXT)</span>
                  </button>
                  <input
                    type="file"
                    ref={jdInputRef}
                    accept=".pdf,.docx,.txt,.rtf,.md,.json,.csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleJdFileChange(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </div>
                {uploadedJdFile && (
                  <div className="mb-2 p-2 bg-[#0F1724] border border-[#4F8EF7]/40 text-[#4F8EF7] rounded text-[11px] font-mono flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <FileCheck className="h-3.5 w-3.5 text-[#4F8EF7]" />
                      Loaded JD File: <strong>{uploadedJdFile.fileName}</strong> ({uploadedJdFile.wordCount} words)
                    </span>
                    <button
                      type="button"
                      onClick={() => setUploadedJdFile(null)}
                      className="text-[#94A3B8] hover:text-red-400 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <textarea
                  rows={6}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the full job description or key responsibilities here..."
                  className="w-full bg-[#0F1724] text-[#F0F4FF] text-xs p-4 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] font-sans leading-relaxed"
                />
              </div>
            </div>
          </div>
        )}

        {/* MODE 2: SELF-UPSKILLING FIELDS */}
        {assessmentMode === "self_upskilling" && (
          <div className="space-y-4 bg-[#0F1724] border border-purple-500/30 rounded-lg p-5">
            <div className="flex items-center gap-2 text-purple-400 mb-1">
              <TrendingUp className="h-4 w-4" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider">
                Self-Upskilling & Career Upgrade Configuration
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono font-bold text-[#F0F4FF] block mb-1">
                  Targeted Destination Role / Goal Position
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Technical Architect / Principal GenAI Engineer"
                  className="w-full bg-[#141E30] text-[#F0F4FF] text-xs py-2.5 px-4 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-[#F0F4FF] block mb-1">
                  Specific Skills to Upgrade On
                </label>
                <input
                  type="text"
                  value={targetSkillsToUpgrade}
                  onChange={(e) => setTargetSkillsToUpgrade(e.target.value)}
                  placeholder="e.g. Gemini API, RAG Architecture, Microservices, Event Sourcing"
                  className="w-full bg-[#141E30] text-[#F0F4FF] text-xs py-2.5 px-4 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono"
                />
                
                <div className="mt-2.5">
                  <span className="text-[10px] font-mono text-[#94A3B8] block mb-1.5">
                    Click to add one of your gaps:
                  </span>
                  {knownGaps.length === 0 && (
                    <span className="text-[10px] text-[#94A3B8]">No open gap is on record for you. Type any skill above.</span>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {knownGaps.map(g => g.skillName).map((skill, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (!targetSkillsToUpgrade.includes(skill)) {
                            setTargetSkillsToUpgrade(prev => prev ? `${prev}, ${skill}` : skill);
                          }
                        }}
                        className="text-[10px] font-mono bg-[#141E30] hover:bg-purple-950/40 text-purple-300 border border-purple-500/30 px-2 py-1 rounded transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="h-2.5 w-2.5" />
                        <span>{skill}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Candidate Resume / Profile Document Upload Dropzone */}
        <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-[#4F8EF7]" />
              <label className="text-xs font-mono font-bold text-[#F0F4FF] uppercase tracking-wider block">
                Candidate Resume / Profile Document Upload (PDF, DOCX, Word, TXT)
              </label>
            </div>
            {uploadedResume && (
              <span className="text-[10px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded flex items-center gap-1">
                <Check className="h-3 w-3" /> Resume Attached
              </span>
            )}
          </div>

          <p className="text-xs text-[#94A3B8]">
            Upload candidate resume or experience portfolio (PDF, DOCX, Word, TXT) to compare their actual background against the requirements and generate tailored SkillGap questions.
          </p>

          <input
            type="file"
            ref={resumeInputRef}
            accept=".pdf,.docx,.txt,.rtf,.md,.json,.csv"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleResumeFileChange(e.target.files[0]);
              }
            }}
            className="hidden"
          />

          {!uploadedResume ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingResume(true); }}
              onDragLeave={() => setIsDraggingResume(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingResume(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleResumeFileChange(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => resumeInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center transition-all cursor-pointer ${
                isDraggingResume
                  ? "border-[#4F8EF7] bg-[#4F8EF7]/10"
                  : "border-[#2A384C] bg-[#141E30]/60 hover:border-[#4F8EF7]/50 hover:bg-[#141E30]"
              }`}
            >
              {isParsingResume ? (
                <div className="flex flex-col items-center justify-center space-y-2 py-2">
                  <RefreshCw className="h-6 w-6 text-[#4F8EF7] animate-spin" />
                  <span className="text-xs font-mono text-[#F0F4FF]">Parsing & Extracting Resume Text...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="p-2.5 bg-[#0F1724] border border-[#2A384C] rounded-full text-[#4F8EF7]">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#F0F4FF] block">
                      Click to upload candidate resume or drag & drop file here
                    </span>
                    <span className="text-[10px] text-[#94A3B8] font-mono mt-0.5 block">
                      Supported Formats: PDF (.pdf), Word (.docx, .doc), Text (.txt, .rtf, .md) • Max 10MB
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#141E30] border border-[#10B981]/40 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] rounded">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#F0F4FF]">{uploadedResume.fileName}</span>
                      <span className="text-[9px] font-mono uppercase font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-1.5 py-0.5 rounded">
                        {uploadedResume.fileType.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[#94A3B8] block mt-0.5">
                      Size: {uploadedResume.fileSizeFormatted} • Words: {uploadedResume.wordCount.toLocaleString()} • Uploaded at {uploadedResume.uploadDate}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowResumePreview(!showResumePreview)}
                    className="p-1.5 text-xs font-mono font-bold bg-[#0F1724] hover:bg-[#2A384C] text-[#4F8EF7] border border-[#2A384C] rounded flex items-center gap-1 transition-all cursor-pointer"
                  >
                    {showResumePreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{showResumePreview ? "Hide Text" : "View Extracted Text"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUploadedResume(null);
                      setShowResumePreview(false);
                    }}
                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-red-900/40 rounded transition-all cursor-pointer"
                    title="Remove File"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Extracted Resume Text Drawer */}
              {showResumePreview && (
                <div className="mt-2 pt-2 border-t border-[#2A384C]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono font-bold text-[#4F8EF7] uppercase tracking-wider">
                      Extracted Resume Text Preview
                    </span>
                    <span className="text-[10px] font-mono text-[#94A3B8]">
                      {uploadedResume.extractedText.length} characters
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto bg-[#0F1724] p-3 rounded border border-[#2A384C] text-[11px] font-mono text-[#94A3B8] whitespace-pre-wrap leading-relaxed">
                    {uploadedResume.extractedText}
                  </div>
                </div>
              )}
            </div>
          )}

          {fileParseError && (
            <div className="p-2 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span>{fileParseError}</span>
            </div>
          )}
        </div>

        {generationError && (
          <div className="p-3 bg-red-950/40 border border-red-500/40 text-red-300 rounded-md text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{generationError}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={() => handleGenerateAssessment()}
            disabled={isGenerating || (assessmentMode === "project_hiring" && !jobDescription.trim()) || (assessmentMode === "self_upskilling" && !targetSkillsToUpgrade.trim())}
            className={`py-3 px-6 text-[#0F1724] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50 ${
              assessmentMode === "self_upskilling"
                ? "bg-purple-400 hover:bg-purple-300 shadow-purple-500/20"
                : "bg-[#4F8EF7] hover:bg-[#3B82F6] shadow-[#4F8EF7]/20"
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-[#0F1724]" />
                <span>Agent Constructing {assessmentMode === "self_upskilling" ? "Self-Upskilling" : "Project Hiring"} Assessment...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Generate {assessmentMode === "self_upskilling" ? "Self-Upskilling" : "Project Hiring"} Assessment</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // --- STAGE 2: INTERACTIVE ASSESSMENT & VIDEO INTERVIEW ---
  if (step === "assessment" && assessment) {
    const currentQuestion = assessment.videoQuestions[currentVideoIdx];
    const currentEval = evaluations[currentQuestion?.id];

    return (
      <div id="skillgap-stage" className="scroll-mt-32 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-xl max-w-6xl mx-auto space-y-6 animate-fade-in">
        
        {/* Top Header & Tab Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#2A384C] pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-mono font-bold border px-2 py-0.5 rounded uppercase flex items-center gap-1 ${
                assessment.assessmentMode === "self_upskilling"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              }`}>
                {assessment.assessmentMode === "self_upskilling" ? (
                  <>
                    <TrendingUp className="h-3 w-3" />
                    <span>Self-Upskilling Mode</span>
                  </>
                ) : (
                  <>
                    <Briefcase className="h-3 w-3" />
                    <span>Project Hiring Mode</span>
                  </>
                )}
              </span>

              <h2 className="text-sm font-bold text-[#F0F4FF]">{assessment.roleTitle}</h2>
            </div>

            {assessment._fallback && (
              <p role="status" className="mt-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                The AI model was unavailable. The multiple-choice questions come from the question bank
                for these skills and are scored as usual. Spoken answers can only be graded
                provisionally, so they are not counted.
              </p>
            )}
            
            <div className="flex items-center gap-2 mt-1 text-xs text-[#94A3B8] font-mono flex-wrap">
              <span>Current Role: <strong>{assessment.currentDesignation || currentDesignation}</strong></span>
              <span>➔</span>
              <span>Target Role: <strong>{assessment.targetRole || targetRole}</strong></span>
              {assessment.targetSkillsToUpgrade && (
                <span className="bg-[#0F1724] text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-[10px]">
                  Skills: {assessment.targetSkillsToUpgrade}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-[#0F1724] p-1 border border-[#2A384C] rounded-lg">
            <button
              onClick={() => setActiveTab("framework")}
              className={`py-1.5 px-3 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "framework"
                  ? "bg-[#4F8EF7] text-[#0F1724] shadow-sm"
                  : "text-[#94A3B8] hover:text-[#F0F4FF]"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Framework Matrix</span>
            </button>
            <button
              onClick={() => setActiveTab("mcq")}
              className={`py-1.5 px-3 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTab === "mcq"
                  ? "bg-[#4F8EF7] text-[#0F1724] shadow-sm"
                  : "text-[#94A3B8] hover:text-[#F0F4FF]"
              }`}
            >
              Part 1: MCQs ({assessment.mcqs.length})
            </button>
            <button
              onClick={() => setActiveTab("video")}
              className={`py-1.5 px-3 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "video"
                  ? "bg-[#4F8EF7] text-[#0F1724] shadow-sm"
                  : "text-[#94A3B8] hover:text-[#F0F4FF]"
              }`}
            >
              <Video className="h-3.5 w-3.5" />
              <span>Part 2: Video ({assessment.videoQuestions.length})</span>
            </button>
            {assessment.practicalExercise && (
              <button
                onClick={() => setActiveTab("practical")}
                className={`py-1.5 px-3 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === "practical"
                    ? "bg-[#10B981] text-[#0F1724] shadow-sm"
                    : "text-[#94A3B8] hover:text-[#F0F4FF]"
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                <span>Part 3: Practical</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab("will")}
              className={`py-1.5 px-3 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "will"
                  ? "bg-[#A855F7] text-[#0F1724] shadow-sm"
                  : "text-[#94A3B8] hover:text-[#F0F4FF]"
              }`}
            >
              <Heart className="h-3.5 w-3.5" />
              <span>Part 4: Will Survey</span>
            </button>
          </div>
        </div>

        {/* TAB 0: FRAMEWORK MATRIX */}
        {activeTab === "framework" && (
          <div className="space-y-6">
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-[#4F8EF7]" />
                  <div>
                    <h3 className="text-xs font-mono font-bold text-[#F0F4FF] uppercase tracking-wider">
                      Role Assessment Framework Matrix Strategy
                    </h3>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      How this assessment is scored, and the weighting each role is usually given.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-[#10B981] bg-[#10B981]/10 px-2.5 py-1 rounded border border-[#10B981]/30">
                  Role-Specific Assessment
                </span>
              </div>

              {/* Assessment Type Weightages */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#141E30] p-3.5 rounded-lg border border-[#2A384C]">
                  <span className="text-[10px] font-mono text-[#94A3B8] block">Part 1: Concept MCQs Weightage</span>
                  <span className="text-xl font-mono font-bold text-[#4F8EF7] block mt-1">
                    {assessment.assessmentTypeWeightage?.mcqsWeight}%
                  </span>
                  <span className="text-[10px] text-[#64748B] block mt-1">{assessment.mcqs.length} Domain & Competency MCQs</span>
                </div>
                <div className="bg-[#141E30] p-3.5 rounded-lg border border-[#2A384C]">
                  <span className="text-[10px] font-mono text-[#94A3B8] block">Part 2: Spoken Scenario Video Weightage</span>
                  <span className="text-xl font-mono font-bold text-[#4F8EF7] block mt-1">
                    {assessment.assessmentTypeWeightage?.scenariosWeight}%
                  </span>
                  <span className="text-[10px] text-[#64748B] block mt-1">{assessment.videoQuestions.length} Spoken JD Situation & Risk Qs</span>
                </div>
                <div className="bg-[#141E30] p-3.5 rounded-lg border border-[#2A384C]">
                  <span className="text-[10px] font-mono text-[#94A3B8] block">Part 3: Practical Exercise Weightage</span>
                  <span className="text-xl font-mono font-bold text-[#10B981] block mt-1">
                    {assessment.assessmentTypeWeightage?.practicalWeight}%
                  </span>
                  <span className="text-[10px] text-[#64748B] block mt-1">
                    {assessment.practicalExercise ? `${assessment.practicalExercise.type.toUpperCase()} Practical Challenge` : "N/A"}
                  </span>
                </div>
              </div>

              {/* Role Weightages Matrix Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono font-bold text-[#F0F4FF] uppercase tracking-wider">
                  Recommended Evaluation Weightage Matrix Across Framework Roles
                </h4>
                <div className="overflow-x-auto border border-[#2A384C] rounded-lg">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-[#141E30] border-b border-[#2A384C] text-[#94A3B8] font-mono uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Assessment Area</th>
                        <th className="p-3">SSA (Systems Analyst)</th>
                        <th className="p-3">SSE (Software Engineer)</th>
                        <th className="p-3">TA (Technical Architect)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2A384C]/60 text-[#F0F4FF]">
                      <tr className={assessment.roleCategory === "SSA" ? "bg-[#4F8EF7]/10 font-bold" : ""}>
                        <td className="p-3 font-mono">Requirements Analysis</td>
                        <td className="p-3 text-[#4F8EF7] font-mono">40%</td>
                        <td className="p-3 text-[#94A3B8] font-mono">10%</td>
                        <td className="p-3 text-[#94A3B8] font-mono">10%</td>
                      </tr>
                      <tr className={assessment.roleCategory === "SSE" ? "bg-[#4F8EF7]/10 font-bold" : ""}>
                        <td className="p-3 font-mono">Design</td>
                        <td className="p-3 text-[#94A3B8] font-mono">20%</td>
                        <td className="p-3 text-[#4F8EF7] font-mono">25%</td>
                        <td className="p-3 text-[#4F8EF7] font-mono">35%</td>
                      </tr>
                      <tr className={assessment.roleCategory === "SSE" ? "bg-[#4F8EF7]/10 font-bold" : ""}>
                        <td className="p-3 font-mono">Coding</td>
                        <td className="p-3 text-[#94A3B8] font-mono">5%</td>
                        <td className="p-3 text-[#4F8EF7] font-mono">35%</td>
                        <td className="p-3 text-[#94A3B8] font-mono">10%</td>
                      </tr>
                      <tr className={assessment.roleCategory === "TA" ? "bg-[#4F8EF7]/10 font-bold" : ""}>
                        <td className="p-3 font-mono">Architecture</td>
                        <td className="p-3 text-[#94A3B8] font-mono">5%</td>
                        <td className="p-3 text-[#94A3B8] font-mono">15%</td>
                        <td className="p-3 text-[#4F8EF7] font-mono">30%</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono">Problem Solving</td>
                        <td className="p-3 text-[#94A3B8] font-mono">15%</td>
                        <td className="p-3 text-[#94A3B8] font-mono">10%</td>
                        <td className="p-3 text-[#94A3B8] font-mono">10%</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono">Communication</td>
                        <td className="p-3 text-[#94A3B8] font-mono">15%</td>
                        <td className="p-3 text-[#94A3B8] font-mono">5%</td>
                        <td className="p-3 text-[#94A3B8] font-mono">5%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setActiveTab("mcq")}
                  className="py-2.5 px-5 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>Begin Part 1: Technical MCQs</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: MCQs */}
        {activeTab === "mcq" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-[#4F8EF7] uppercase tracking-wider">
                Part 1 — Core Concept Multiple Choice Validation
              </h3>
              <span className="text-xs text-[#94A3B8] font-mono">
                {Object.keys(mcqOutcomes).length} of {assessment.mcqs.length} Answered
              </span>
            </div>
            <p className="text-[11px] text-[#94A3B8]">Your first checked answer to each question is the one that counts.</p>
            {assessment.mcqs.length === 0 && (
              <p className="text-xs text-[#94A3B8]">There are no multiple-choice questions for these skills. Continue with the interview.</p>
            )}
            {mcqError && (
              <div role="alert" className="p-2.5 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs">{mcqError}</div>
            )}

            <div className="space-y-5">
              {assessment.mcqs.map((q, qIdx) => {
                const selected = mcqAnswers[q.id];
                const outcome = mcqOutcomes[q.id];
                const isSubmitted = !!outcome;
                const isCorrect = !!outcome?.correct;

                return (
                  <div key={q.id} className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-xs font-bold text-[#F0F4FF] leading-relaxed">
                        <span className="text-[#4F8EF7] font-mono mr-2">Q{qIdx + 1}.</span>
                        {q.question}
                      </h4>
                      {isSubmitted && (
                        isCorrect ? (
                          <span className="text-[10px] font-mono font-bold text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/30 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Correct
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/30 border border-red-500/30 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                            <XCircle className="h-3 w-3" /> Incorrect
                          </span>
                        )
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {q.options.map((opt, optIdx) => {
                        const isThisOptionSelected = selected === optIdx;
                        let optionStyle = "bg-[#141E30]/60 border-[#2A384C] text-[#94A3B8] hover:border-[#4F8EF7]/40";

                        if (isSubmitted) {
                          if (optIdx === outcome.correctIndex) {
                            optionStyle = "bg-[#10B981]/20 border-[#10B981] text-[#F0F4FF]";
                          } else if (isThisOptionSelected) {
                            optionStyle = "bg-red-950/40 border-red-500 text-red-300";
                          }
                        } else if (isThisOptionSelected) {
                          optionStyle = "bg-[#4F8EF7]/20 border-[#4F8EF7] text-[#F0F4FF]";
                        }

                        return (
                          <button
                            key={optIdx}
                            onClick={() => {
                              if (isSubmitted) return;
                              setMcqAnswers(prev => ({ ...prev, [q.id]: optIdx }));
                            }}
                            className={`p-3 rounded-md border text-left text-xs font-sans transition-all cursor-pointer flex items-start gap-2.5 ${optionStyle}`}
                          >
                            <span className="font-mono font-bold text-[10px] text-[#4F8EF7] shrink-0 mt-0.5">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <span className="leading-snug">{opt}</span>
                          </button>
                        );
                      })}
                    </div>

                    {!isSubmitted && selected !== undefined && (
                      <button
                        onClick={() => handleCheckMcq(q)}
                        disabled={checkingMcq === q.id}
                        className="py-1.5 px-3 bg-[#4F8EF7] text-[#0F1724] font-mono font-bold text-[11px] rounded transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {checkingMcq === q.id ? "Checking..." : "Check Answer"}
                      </button>
                    )}

                    {isSubmitted && (
                      <div className="p-3 bg-[#141E30] border-l-2 border-[#4F8EF7] text-[11px] text-[#94A3B8] leading-relaxed rounded-r font-mono">
                        <strong className="text-[#F0F4FF] block mb-0.5">Explanation:</strong>
                        {outcome.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setActiveTab("video")}
                className="py-2.5 px-5 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Proceed to Part 2: Video Interview</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE VIDEO / SPOKEN INTERVIEW */}
        {activeTab === "video" && currentQuestion && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Side: Camera & Voice Controls (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#4F8EF7] uppercase tracking-wider flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5" /> Candidate Camera Feed
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${isCameraOn ? "bg-[#10B981] animate-pulse" : "bg-red-500"}`} />
                    <span className="text-[10px] font-mono text-[#94A3B8]">
                      {isCameraOn ? "Camera Active" : "Camera Off"}
                    </span>
                  </div>
                </div>

                {/* Video Container */}
                <div className="relative aspect-video bg-[#000000] rounded-md overflow-hidden border border-[#2A384C] flex items-center justify-center shadow-inner">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isCameraOn ? "block" : "hidden"}`}
                  />
                  {!isCameraOn && (
                    <div className="text-center p-4">
                      <VideoOff className="h-10 w-10 text-[#2A384C] mx-auto mb-2" />
                      <p className="text-xs font-bold text-[#94A3B8]">Camera off (optional)</p>
                      {cameraError && (
                        <p role="alert" className="mt-1 text-[11px] text-amber-400 max-w-xs mx-auto">{cameraError}</p>
                      )}
                      <button
                        onClick={startCameraStream}
                        className="mt-2 text-[10px] font-mono text-[#4F8EF7] underline cursor-pointer"
                      >
                        Turn On Camera & Microphone
                      </button>
                    </div>
                  )}

                  {/* Audio Volume Level Bar */}
                  {isCameraOn && (
                    <div className="absolute bottom-3 left-3 right-3 bg-[#0F1724]/80 backdrop-blur border border-[#2A384C] rounded p-2 flex items-center gap-2">
                      <Mic className={`h-3.5 w-3.5 ${audioLevel > 15 ? "text-[#10B981]" : "text-[#64748B]"}`} />
                      <div className="flex-1 bg-[#141E30] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#10B981] h-full transition-all duration-75"
                          style={{ width: `${audioLevel}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-[#94A3B8]">{audioLevel}%</span>
                    </div>
                  )}
                </div>

                {/* Accessibility & Text-Only Fallback Guidance Banner */}
                <div className="bg-[#141E30] border border-[#2A384C] rounded p-2.5 flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] px-1.5 py-0.5 rounded border border-[#10B981]/30 shrink-0">
                    TEXT ACCESSIBLE
                  </span>
                  <p className="text-[11px] text-[#94A3B8] leading-tight">
                    Camera and microphone are optional. Typed and spoken answers are evaluated the same way: from the text.
                  </p>
                </div>

                {/* Media Control Buttons */}
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    onClick={toggleCamera}
                    className={`py-2 px-3 rounded-md text-xs font-mono font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      isCameraOn
                        ? "bg-[#141E30] border-[#2A384C] text-[#F0F4FF]"
                        : "bg-red-950/40 border-red-500/40 text-red-300"
                    }`}
                  >
                    {isCameraOn ? <Video className="h-3.5 w-3.5 text-[#10B981]" /> : <VideoOff className="h-3.5 w-3.5 text-red-400" />}
                    <span>{isCameraOn ? "Camera ON" : "Turn On Camera"}</span>
                  </button>

                  <button
                    onClick={() => speakQuestion(currentQuestion.question)}
                    className="py-2 px-3 bg-[#141E30] hover:bg-[#1E293B] border border-[#2A384C] text-[#4F8EF7] text-xs font-mono font-bold rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Volume2 className={`h-3.5 w-3.5 ${isSpeechSpeaking ? "animate-bounce text-[#10B981]" : ""}`} />
                    <span>{isSpeechSpeaking ? "Agent Speaking..." : "Listen Question"}</span>
                  </button>
                </div>
              </div>

              {/* Question Navigation */}
              <div className="flex items-center justify-between bg-[#0F1724] border border-[#2A384C] rounded-lg p-3">
                <span className="text-xs font-mono font-bold text-[#94A3B8]">
                  Question {currentVideoIdx + 1} of {assessment.videoQuestions.length}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={currentVideoIdx === 0}
                    onClick={() => {
                      stopSpeech();
                      setCurrentVideoIdx(prev => prev - 1);
                    }}
                    className="py-1 px-3 bg-[#141E30] text-[#94A3B8] text-xs font-mono rounded border border-[#2A384C] disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={currentVideoIdx === assessment.videoQuestions.length - 1}
                    onClick={() => {
                      stopSpeech();
                      setCurrentVideoIdx(prev => prev + 1);
                    }}
                    className="py-1 px-3 bg-[#141E30] text-[#F0F4FF] text-xs font-mono rounded border border-[#2A384C] disabled:opacity-40"
                  >
                    Next Question
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side: Question Details, Voice Recording & AI Evaluation (7 Cols) */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Question Card */}
              <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#4F8EF7] bg-[#4F8EF7]/10 border border-[#4F8EF7]/30 px-2 py-0.5 rounded uppercase">
                    Topic: {currentQuestion.title}
                  </span>
                  <span className="text-[10px] font-mono text-[#94A3B8]">
                    Max Response: {currentQuestion.maxDurationSeconds}s
                  </span>
                </div>

                <h3 className="text-xs font-bold text-[#F0F4FF] leading-relaxed">
                  {currentQuestion.question}
                </h3>

                <div className="space-y-1.5 pt-2 border-t border-[#2A384C]">
                  <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider block">
                    Target Evaluation Rubrics (Agent Criteria):
                  </span>
                  <ul className="space-y-1 text-[11px] text-[#94A3B8] font-mono">
                    {currentQuestion.keyRubrics.map((r, rIdx) => (
                      <li key={rIdx} className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-[#4F8EF7]" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Spoken Answer Recording Box */}
              <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-[#F0F4FF] uppercase tracking-wider">
                    Candidate Voice Response & Transcript
                  </span>
                  {isRecording && (
                    <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/40 border border-red-500/40 px-2 py-0.5 rounded flex items-center gap-1.5 animate-pulse">
                      <Square className="h-2.5 w-2.5 fill-red-400" /> Live Recording...
                    </span>
                  )}
                </div>

                {/* Recording Controls */}
                <div className="flex gap-3">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="py-2.5 px-4 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2 shadow-sm"
                    >
                      <Mic className="h-4 w-4" />
                      <span>Start Recording & Speak Answer</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="py-2.5 px-4 bg-red-600 hover:bg-red-700 text-[#FFFFFF] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Square className="h-4 w-4 fill-white" />
                      <span>Stop Recording</span>
                    </button>
                  )}
                </div>

                {/* Live Transcript Field */}
                <div>
                  <label className="text-[10px] font-mono text-[#94A3B8] block mb-1">
                    Your answer (transcribed from speech, or typed) - this text is what gets evaluated:
                  </label>
                  {transcriptHint && (
                    <p role="status" className="text-[11px] text-amber-400 mb-1">{transcriptHint}</p>
                  )}
                  <textarea
                    rows={4}
                    value={spokenTranscript}
                    onChange={(e) => setSpokenTranscript(e.target.value)}
                    placeholder="Click 'Start Recording & Speak Answer' and talk into your microphone, or type your response..."
                    className="w-full bg-[#141E30] text-[#F0F4FF] text-xs p-3 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] font-sans leading-relaxed"
                  />
                </div>

                {/* Evaluate Answer Button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => handleEvaluateAnswer(currentQuestion)}
                    disabled={isEvaluating || !spokenTranscript.trim()}
                    className="py-2 px-4 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-[#4F8EF7]/10 disabled:opacity-50"
                  >
                    {isEvaluating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin text-[#0F1724]" />
                        <span>AI Agent Evaluating Answer...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>Evaluate Spoken Answer</span>
                      </>
                    )}
                  </button>
                </div>

                {evalError && (
                  <div className="p-2.5 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>{evalError}</span>
                  </div>
                )}
              </div>

              {/* AI Evaluation Result Card */}
              {currentEval && (
                <div className="bg-[#0F1724] border border-[#10B981]/40 rounded-lg p-5 space-y-4 animate-fade-in shadow-lg">
                  <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#10B981]" />
                      <h4 className="text-xs font-bold text-[#F0F4FF]">AI evaluation of your answer</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#94A3B8]">Overall Rating:</span>
                      <span className="text-sm font-mono font-extrabold text-[#10B981] bg-[#10B981]/10 px-2.5 py-0.5 rounded border border-[#10B981]/30">
                        {currentEval.overallScore}%
                      </span>
                      {currentEval._fallback && (
                        <span className="tag tone-warn" title="No AI model was reachable, so this score reflects answer length only.">
                          Provisional
                        </span>
                      )}
                    </div>
                  </div>

                  {/* One tile per score the evaluation actually returned. The speech,
                      grammar, pronunciation and body-language tiles used to fall back to
                      the communication score, showing one number under five names; the
                      model only ever receives the transcribed text. */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {([
                      ["Tech depth", currentEval.technicalScore, "text-[#4F8EF7]"],
                      ["Problem solving", currentEval.problemSolvingScore, "text-[#10B981]"],
                      ["Communication", currentEval.communicationScore, "text-[#A855F7]"],
                      ["Speech fluency", currentEval.speechFluencyScore, "text-[#A855F7]"],
                      ["Grammar & vocabulary", currentEval.grammarScore, "text-[#F59E0B]"],
                      ["Pronunciation", currentEval.pronunciationScore, "text-cyan-400"],
                      ["Body language", currentEval.bodyLanguageScore, "text-rose-400"],
                    ] as [string, number | undefined, string][])
                      .filter(([, value]) => typeof value === "number")
                      .map(([label, value, tone]) => (
                        <div key={label} className="bg-[#141E30] p-2 rounded border border-[#2A384C] text-center">
                          <span className="text-[9px] font-mono text-[#94A3B8] block uppercase">{label}</span>
                          <span className={`text-xs font-mono font-bold mt-0.5 block ${tone}`}>{value}%</span>
                        </div>
                      ))}
                  </div>

                  {/* Feedback */}
                  <div className="space-y-3 text-xs">
                    <p className="text-[#F0F4FF] leading-relaxed font-sans bg-[#141E30]/60 p-3 rounded border border-[#2A384C]">
                      {currentEval.feedback}
                    </p>

                    {/* Dual Stream Breakdown: Technical vs Soft Skills */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {/* Stream 1: Technical Depth & Gaps */}
                      <div className="bg-[#141E30] p-3 rounded-lg border border-[#4F8EF7]/30 space-y-2">
                        <div className="flex items-center gap-1.5 border-b border-[#2A384C] pb-1.5">
                          <Cpu className="h-3.5 w-3.5 text-[#4F8EF7]" />
                          <strong className="text-xs font-bold text-[#F0F4FF]">Technical Capability Stream</strong>
                        </div>
                        
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono font-bold text-[#10B981] uppercase block">Validated Technical Strengths:</span>
                          <ul className="space-y-1 text-[11px] text-[#94A3B8]">
                            {currentEval.strengths.slice(0, 2).map((s, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <CheckCircle2 className="h-3 w-3 text-[#10B981] shrink-0 mt-0.5" />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-1 pt-1">
                          <span className="text-[10px] font-mono font-bold text-amber-400 uppercase block">Identified Technical Gaps:</span>
                          <ul className="space-y-1 text-[11px] text-[#94A3B8]">
                            {(currentEval.technicalGaps || currentEval.missingConcepts).map((m, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <AlertCircle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                                <span>{m}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Stream 2: Communication, Speech, Grammar & Body Language */}
                      <div className="bg-[#141E30] p-3 rounded-lg border border-[#A855F7]/30 space-y-2">
                        <div className="flex items-center gap-1.5 border-b border-[#2A384C] pb-1.5">
                          <Heart className="h-3.5 w-3.5 text-[#A855F7]" />
                          <strong className="text-xs font-bold text-[#F0F4FF]">Communication</strong>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-mono font-bold text-[#A855F7] uppercase block">What is assessed</span>
                          <p className="text-[11px] text-[#94A3B8] italic">
                            Scored from your transcribed answer: structure, clarity, and how technical terms are explained.
                            Pace, pronunciation and body language are not assessed - the model receives only the text.
                          </p>
                        </div>

                        {currentEval.communicationGaps && currentEval.communicationGaps.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[10px] font-mono font-bold text-rose-400 uppercase block">Communication gaps:</span>
                          <ul className="space-y-1 text-[11px] text-[#94A3B8]">
                            {currentEval.communicationGaps.map((cg, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <AlertCircle className="h-3 w-3 text-rose-400 shrink-0 mt-0.5" />
                                <span>{cg}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        )}
                      </div>
                    </div>

                    {/* Handoff to Learning Concierge CTA */}
                    {onRedirectToConcierge && (
                      <button
                        onClick={() => {
                          const allGaps = [
                            ...(currentEval.technicalGaps || currentEval.missingConcepts),
                            ...(currentEval.communicationGaps || [])
                          ];
                          onRedirectToConcierge(allGaps, assessment?.roleTitle || targetRole);
                        }}
                        className="w-full mt-3 py-2.5 px-3 bg-[#4F8EF7]/15 hover:bg-[#4F8EF7]/25 border border-[#4F8EF7]/40 text-[#F0F4FF] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center justify-center gap-2 group"
                      >
                        <Sparkles className="h-4 w-4 text-[#4F8EF7] group-hover:scale-110 transition-transform" />
                        <span>Redirect Technical & Communication Gaps to Learning Concierge</span>
                        <ArrowRight className="h-4 w-4 text-[#4F8EF7]" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation to Next Tab */}
              <div className="flex justify-end pt-3">
                {assessment.practicalExercise ? (
                  <button
                    onClick={() => {
                      setActiveTab("practical");
                    }}
                    className="py-2.5 px-5 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-[#10B981]/20"
                  >
                    <Code className="h-4 w-4" />
                    <span>Proceed to Part 3: Practical Challenge</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setActiveTab("will");
                    }}
                    className="py-2.5 px-5 bg-[#A855F7] hover:bg-[#9333EA] text-[#F0F4FF] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-[#A855F7]/20"
                  >
                    <Heart className="h-4 w-4" />
                    <span>Proceed to Part 4: Will & Motivation Survey</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: PRACTICAL EXERCISE (CODING / ARCHITECTURE / FUNCTIONAL) */}
        {activeTab === "practical" && assessment.practicalExercise && (
          <div className="space-y-6">
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#2A384C] pb-3 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                      <Code className="h-3 w-3" />
                      Practical Assessment ({assessment.practicalExercise.type.toUpperCase()})
                    </span>
                    <h3 className="text-sm font-bold text-[#F0F4FF]">{assessment.practicalExercise.title}</h3>
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    Role-specific hands-on challenge, weighted at {assessment.assessmentTypeWeightage?.practicalWeight}% of this assessment.
                  </p>
                </div>
                {practicalScore !== null && (
                  <span className="text-sm font-mono font-bold text-[#10B981] bg-[#10B981]/10 px-3 py-1 rounded border border-[#10B981]/30">
                    Practical Score: {practicalScore}%
                  </span>
                )}
              </div>

              {/* Problem Statement Box */}
              <div className="bg-[#141E30] p-4 rounded-lg border border-[#2A384C] space-y-3">
                <span className="text-[10px] font-mono font-bold text-[#4F8EF7] uppercase tracking-wider block">
                  Problem Statement & System Scenario:
                </span>
                <p className="text-xs text-[#F0F4FF] leading-relaxed whitespace-pre-wrap font-sans">
                  {assessment.practicalExercise.problemStatement}
                </p>

                {assessment.practicalExercise.requirements && assessment.practicalExercise.requirements.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-[#2A384C]">
                    <span className="text-[10px] font-mono font-bold text-[#10B981] uppercase block">
                      Core Requirements to Address:
                    </span>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-[#94A3B8]">
                      {assessment.practicalExercise.requirements.map((req, rIdx) => (
                        <li key={rIdx} className="flex items-start gap-1.5 bg-[#0F1724] p-2 rounded border border-[#2A384C]/60">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981] shrink-0 mt-0.5" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {assessment.practicalExercise.evaluationRubrics && (
                  <div className="space-y-1 pt-2 border-t border-[#2A384C]">
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase block">
                      AI Evaluation Rubrics:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {assessment.practicalExercise.evaluationRubrics.map((rubric, rIdx) => (
                        <span key={rIdx} className="text-[10px] font-mono text-[#94A3B8] bg-[#0F1724] px-2.5 py-1 rounded border border-[#2A384C]">
                          • {rubric}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Code / Architecture Solution Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold text-[#F0F4FF] flex items-center gap-1.5">
                    <Terminal className="h-4 w-4 text-[#4F8EF7]" />
                    Candidate Practical Solution (Code / Architecture Blueprint / FRD Matrix):
                  </label>
                  <span className="text-[10px] font-mono text-[#94A3B8]">
                    {practicalCode.length} characters
                  </span>
                </div>
                <textarea
                  rows={10}
                  value={practicalCode}
                  onChange={(e) => setPracticalCode(e.target.value)}
                  placeholder={
                    assessment.practicalExercise.starterTemplate ||
                    `// Enter your code implementation, architectural diagram markdown, or FRD traceability matrix here...\n// Be detailed and address all evaluation rubrics.`
                  }
                  className="w-full bg-[#141E30] text-[#F0F4FF] text-xs font-mono p-4 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#10B981] leading-relaxed"
                />
              </div>

              {/* Submit & AI Evaluate Practical */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (assessment.practicalExercise?.starterTemplate && !practicalCode) {
                      setPracticalCode(assessment.practicalExercise.starterTemplate);
                    }
                  }}
                  className="text-xs font-mono text-[#4F8EF7] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <FileCode className="h-3.5 w-3.5" /> Load Starter Template
                </button>
                <button
                  onClick={handleEvaluatePractical}
                  disabled={isEvaluatingPractical || !practicalCode.trim()}
                  className="py-2.5 px-5 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-[#10B981]/20 disabled:opacity-50"
                >
                  {isEvaluatingPractical ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin text-[#0F1724]" />
                      <span>AI Agent Evaluating Practical Exercise...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Submit & Evaluate Practical Solution</span>
                    </>
                  )}
                </button>
              </div>

              {practicalError && (
                <div role="alert" className="p-2.5 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs">{practicalError}</div>
              )}

              {/* Practical Evaluation Feedback Box */}
              {practicalFeedback && (
                <div className="p-4 bg-[#141E30] border-l-4 border-[#10B981] rounded-r-lg space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#10B981] uppercase flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> Evaluation completed - score: {practicalScore}%
                    </span>
                    {practicalProvisional && <span className="tag tone-warn">Provisional - not counted</span>}
                  </div>
                  <p className="text-xs text-[#94A3B8] font-mono leading-relaxed">
                    {practicalFeedback}
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-[#2A384C]">
                <button
                  onClick={() => setActiveTab("will")}
                  className="py-2.5 px-5 bg-[#A855F7] hover:bg-[#9333EA] text-[#F0F4FF] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <Heart className="h-4 w-4" />
                  <span>Proceed to Part 4: Will & Motivation Survey</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WILL & ADAPTABILITY ASSESSMENT (Q1 - Q5) */}
        {activeTab === "will" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-[#2A384C] pb-3">
              <div>
                <h3 className="text-xs font-mono font-bold text-[#A855F7] uppercase tracking-wider flex items-center gap-2">
                  <Heart className="h-4 w-4 text-[#A855F7]" />
                  Part 4 - Will, motivation and adaptability (5 questions, optional)
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Your own view, kept beside your result. The Will score your manager sees is worked out from what you do, not from these answers.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-[#94A3B8]">Self-reported Will:</span>
                <span className="text-lg font-mono font-bold text-[#A855F7] ml-2 bg-[#A855F7]/10 px-2.5 py-1 rounded border border-[#A855F7]/30">
                  {calculateWillScore() === null ? "-" : `${calculateWillScore()}%`}
                </span>
              </div>
            </div>

            {/* Section 1: Career Intent (30%) */}
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#2A384C] pb-2">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-[#4F8EF7]" />
                  <h4 className="text-xs font-bold text-[#F0F4FF] uppercase tracking-wider">Section 1: Career Intent (30% Weight)</h4>
                </div>
                <span className="text-[10px] font-mono text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded border border-[#4F8EF7]/30">
                  {willAnswers.sec1_intent === null ? "Not answered" : `Score: ${willAnswers.sec1_intent}%`}
                </span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q1. How interested are you in transitioning to and working on target role technology stacks in upcoming projects?
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "Very High Interest", val: 100 },
                    { label: "Moderate Interest", val: 80 },
                    { label: "Neutral / Flexible", val: 50 },
                    { label: "Prefer Current Role", val: 20 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setWillAnswers(prev => ({ ...prev, sec1_intent: opt.val }))}
                      className={`p-3 rounded-md text-xs text-center border transition-all cursor-pointer font-medium ${
                        willAnswers.sec1_intent === opt.val
                          ? "bg-[#4F8EF7]/20 border-[#4F8EF7] text-[#F0F4FF] font-bold shadow-sm"
                          : "bg-[#141E30] border-[#2A384C] text-[#94A3B8] hover:border-[#4F8EF7]/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 2: Learning Behaviour (25%) */}
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#2A384C] pb-2">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-[#10B981]" />
                  <h4 className="text-xs font-bold text-[#F0F4FF] uppercase tracking-wider">Section 2: Learning Behavior (25% Weight)</h4>
                </div>
                <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/30">
                  {willAnswers.sec2_behavior === null ? "Not answered" : `Score: ${willAnswers.sec2_behavior}%`}
                </span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q2. Outside mandatory training, how proactively do you learn new technical skills and patterns?
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    { label: "Proactively learn independently on a regular basis", val: 100 },
                    { label: "Enroll in structured courses when guided by lead/mentor", val: 80 },
                    { label: "Learn on-demand when assigned to specific project needs", val: 50 },
                    { label: "Rarely engage in extra self-learning beyond current tasks", val: 20 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setWillAnswers(prev => ({ ...prev, sec2_behavior: opt.val }))}
                      className={`p-3 rounded-md text-xs text-left border transition-all cursor-pointer flex items-center justify-between ${
                        willAnswers.sec2_behavior === opt.val
                          ? "bg-[#10B981]/20 border-[#10B981] text-[#F0F4FF] font-bold shadow-sm"
                          : "bg-[#141E30] border-[#2A384C] text-[#94A3B8] hover:border-[#10B981]/40"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {willAnswers.sec2_behavior === opt.val && <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 3: Adaptability (20%) */}
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#2A384C] pb-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-[#F0F4FF] uppercase tracking-wider">Section 3: Adaptability & Resilience (20% Weight)</h4>
                </div>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30">
                  {willAnswers.sec3_adaptability === null ? "Not answered" : `Score: ${willAnswers.sec3_adaptability}%`}
                </span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q3. How confident and adaptable are you when stepping into unfamiliar technical domains or changing architectures?
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "Highly Adaptable & Confident", val: 100 },
                    { label: "Moderately Adaptable", val: 75 },
                    { label: "Needs Time to Adjust", val: 50 },
                    { label: "Prefer Familiar Stacks Only", val: 25 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setWillAnswers(prev => ({ ...prev, sec3_adaptability: opt.val }))}
                      className={`p-3 rounded-md text-xs text-center border transition-all cursor-pointer font-medium ${
                        willAnswers.sec3_adaptability === opt.val
                          ? "bg-amber-400/20 border-amber-400 text-[#F0F4FF] font-bold shadow-sm"
                          : "bg-[#141E30] border-[#2A384C] text-[#94A3B8] hover:border-amber-400/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 4: Commitment (15%) */}
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#2A384C] pb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-[#A855F7]" />
                  <h4 className="text-xs font-bold text-[#F0F4FF] uppercase tracking-wider">Section 4: Learning Commitment (15% Weight)</h4>
                </div>
                <span className="text-[10px] font-mono text-[#A855F7] bg-[#A855F7]/10 px-2 py-0.5 rounded border border-[#A855F7]/30">
                  {willAnswers.sec4_commitment === null ? "Not answered" : `Score: ${willAnswers.sec4_commitment}%`}
                </span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q4. How many hours per week can you realistically dedicate to upskilling and completing hands-on certifications?
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "6+ Hours / Week", val: 100 },
                    { label: "3–5 Hours / Week", val: 80 },
                    { label: "1–2 Hours / Week", val: 50 },
                    { label: "< 1 Hour / Week", val: 20 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setWillAnswers(prev => ({ ...prev, sec4_commitment: opt.val }))}
                      className={`p-3 rounded-md text-xs text-center border transition-all cursor-pointer font-medium ${
                        willAnswers.sec4_commitment === opt.val
                          ? "bg-[#A855F7]/20 border-[#A855F7] text-[#F0F4FF] font-bold shadow-sm"
                          : "bg-[#141E30] border-[#2A384C] text-[#94A3B8] hover:border-[#A855F7]/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 5: Engagement (10%) */}
            <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#2A384C] pb-2">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-rose-400" />
                  <h4 className="text-xs font-bold text-[#F0F4FF] uppercase tracking-wider">Section 5: Voluntary Engagement (10% Weight)</h4>
                </div>
                <span className="text-[10px] font-mono text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/30">
                  {willAnswers.sec5_engagement === null ? "Not answered" : `Score: ${willAnswers.sec5_engagement}%`}
                </span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F0F4FF] block">
                  Q5. Would you participate in communities of practice, pilot projects, or knowledge sharing for emerging technologies?
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: "Enthusiastically Yes", val: 100 },
                    { label: "Yes, if scheduled", val: 75 },
                    { label: "Maybe", val: 50 },
                    { label: "Unlikely", val: 20 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setWillAnswers(prev => ({ ...prev, sec5_engagement: opt.val }))}
                      className={`p-3 rounded-md text-xs text-center border transition-all cursor-pointer font-medium ${
                        willAnswers.sec5_engagement === opt.val
                          ? "bg-rose-400/20 border-rose-400 text-[#F0F4FF] font-bold shadow-sm"
                          : "bg-[#141E30] border-[#2A384C] text-[#94A3B8] hover:border-rose-400/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              {unansweredCount > 0 && (
                <span role="status" className="text-[11px] text-amber-400">
                  {unansweredCount} question{unansweredCount === 1 ? "" : "s"} not answered yet. Once a part is started, its unanswered questions count as 0.
                </span>
              )}
              {finishError && <span role="alert" className="text-[11px] text-rose-400">{finishError}</span>}
              <button
                id="finish-assessment"
                onClick={handleFinish}
                disabled={isFinishing}
                className="py-3 px-6 bg-[#A855F7] hover:bg-[#9333EA] text-[#F0F4FF] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-[#A855F7]/20 disabled:opacity-50"
              >
                <Award className="h-4 w-4" />
                <span>{isFinishing ? "Saving your result..." : "Finish and save my result"}</span>
              </button>
            </div>
          </div>
        )}

      </div>
    );
  }

  // --- STAGE 3: THE STORED RESULT ---
  if (!finished) return null;
  const result = finished.result;
  const shown = (value: number | null) => (value === null ? "-" : `${value}%`);
  const gapStreams: [string, typeof result.gaps, string][] = [
    ["1. Technical gaps", result.gaps.filter(g => g.source !== "communication"), "#4F8EF7"],
    ["2. Communication gaps", result.gaps.filter(g => g.source === "communication"), "#A855F7"],
  ];

  return (
    <div id="skillgap-stage" className="scroll-mt-32 bg-[#141E30] border border-[#2A384C] rounded-lg p-6 shadow-xl max-w-5xl mx-auto space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2A384C] pb-4 gap-4">
        <div>
          <span className="text-[10px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded uppercase">
            Level-1 result - saved
          </span>
          <h2 className="text-base font-bold text-[#F0F4FF] mt-1">{finished.roleTitle}</h2>
        </div>
        <div className="text-right">
          <span id="assessment-overall" className="text-2xl font-mono font-extrabold text-[#10B981]">
            {result.overallScore === null ? "Not graded" : `${result.overallScore}%`}
          </span>
          <span className="text-[10px] font-mono text-[#94A3B8] block">Overall score</span>
        </div>
      </div>

      {/* One tile per part. A part not taken shows a dash and is left out of the score. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          ["Multiple choice", shown(result.mcqScore), result.mcqScore === null ? "Not taken" : `${result.mcqCorrect} of ${result.mcqTotal} right`],
          ["Spoken answers", shown(result.spokenScore), result.spokenScore === null
            ? (result.provisionalAnswers ? "Provisional - not counted" : "Not taken") : `Weight ${result.weights.scenariosWeight}%`],
          ["Practical", shown(result.practicalScore), result.practicalScore === null ? "Not taken" : `Weight ${result.weights.practicalWeight}%`],
          ["Self-reported Will", shown(result.selfReportedWill), result.selfReportedWill === null ? "Not answered" : "From 5 questions"],
        ] as [string, string, string][]).map(([label, value, hint]) => (
          <div key={label} className="bg-[#0F1724] border border-[#2A384C] p-4 rounded-lg text-center">
            <span className="text-xs font-mono text-[#94A3B8] block">{label}</span>
            <span className="text-2xl font-mono font-bold text-[#4F8EF7] mt-1 block">{value}</span>
            <span className="text-[10px] text-[#64748B] font-mono mt-0.5 block">{hint}</span>
          </div>
        ))}
      </div>

      {(result.unanswered > 0 || result.provisionalAnswers > 0) && (
        <p role="status" className="text-[11px] text-[#94A3B8]">
          {result.unanswered > 0 && `${result.unanswered} question${result.unanswered === 1 ? " was" : "s were"} not answered. `}
          {result.provisionalAnswers > 0 && `${result.provisionalAnswers} answer${result.provisionalAnswers === 1 ? " was" : "s were"} graded without the AI model and not counted.`}
        </p>
      )}

      {/* Gaps and the handoff to the Concierge */}
      <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-[#2A384C] pb-3">
          <BookOpen className="h-4 w-4 text-[#4F8EF7]" />
          <h3 className="text-xs font-bold text-[#F0F4FF]">Gaps found in your answers</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gapStreams.map(([title, items, colour]) => (
            <div key={title} className="bg-[#141E30] p-3.5 rounded-lg border space-y-2.5" style={{ borderColor: `${colour}4D` }}>
              <strong className="text-xs font-bold text-[#F0F4FF] block border-b border-[#2A384C] pb-2">{title}</strong>
              {items.length === 0 ? (
                <p className="text-[11px] text-[#94A3B8]">None identified in your answers.</p>
              ) : (
                <ul className="space-y-2 text-xs text-[#94A3B8]">
                  {items.map(item => (
                    <li key={item.label} className="flex items-start gap-2 bg-[#0F1724] p-2.5 rounded border border-[#2A384C]">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: colour }} />
                      <span className="text-[11px] text-[#F0F4FF]">{item.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {onRedirectToConcierge && (
          <button
            id="send-gaps-to-concierge"
            onClick={() => onRedirectToConcierge(result.gaps.map(g => g.label), finished.roleTitle)}
            className="w-full py-3 px-4 bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#4F8EF7]/20 group"
          >
            <Sparkles className="h-4 w-4 group-hover:rotate-12 transition-transform" />
            <span>Take these gaps to the Learning Concierge</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          onClick={() => {
            setStep("input");
            setAssessment(null);
            resetAnswers();
          }}
          className="w-full sm:w-auto py-2.5 px-4 bg-[#141E30] hover:bg-[#1E293B] border border-[#2A384C] text-[#F0F4FF] font-mono font-bold text-xs rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Take another assessment</span>
        </button>

        {onNavigateToDashboard && (
          <button
            onClick={onNavigateToDashboard}
            className="w-full sm:w-auto py-2.5 px-5 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#10B981]/20"
          >
            <span>Open my learning plan</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

    </div>
  );
};
