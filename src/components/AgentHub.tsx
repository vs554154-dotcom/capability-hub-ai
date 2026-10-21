import React, { useState, useRef, useEffect } from "react";
import { User, Message } from "../types";
import { Send, Cpu, Sparkles, BookOpen, GraduationCap, Compass, ArrowRight, RefreshCw, Video, MessageSquare, ExternalLink, Paperclip, UploadCloud, Upload, FileCheck, X, Check } from "lucide-react";
import { SkillGapInterviewAgent } from "./SkillGapInterviewAgent";
import { parseUploadedFile, ParsedFileInfo } from "../utils/fileParser";
import { PageHeader } from "./ui/Page";

// What this page is for, per role: each role reaches a different copilot here.
const HUB_COPY: Record<string, { eyebrow: string; title: string; lede: React.ReactNode; steps: React.ReactNode[] }> = {
  employee: {
    eyebrow: "Employee workspace · SkillGap agent",
    title: "Practise, find your gaps, get a plan",
    lede: <>Two ways in: a JD interview practice (multiple-choice and spoken questions, scored against a job description) or a chat with the SkillGap agent and the Learning Concierge. Gaps an interview finds go straight to the Concierge for courses and exercises.</>,
    steps: [
      <><strong>Start a practice</strong> from your target role or a pasted job description.</>,
      <><strong>Answer</strong> the multiple-choice and spoken questions.</>,
      <><strong>Read your scores</strong> and the gaps found.</>,
      <><strong>Ask the Concierge</strong> for courses and exercises for those gaps.</>,
    ],
  },
  manager: {
    eyebrow: "Manager workspace · GROW coach",
    title: "Coach your team with GROW",
    lede: <>Ask the Manager GROW Coach about a report. It reads their skills and evidence and answers with Goal, Reality, Options and Will questions for your next 1-on-1. It can only see people who report to you.</>,
    steps: [
      <><strong>Pick a prompt</strong> or ask in your own words.</>,
      <><strong>Name the report</strong> you are preparing for.</>,
      <><strong>Take the GROW questions</strong> into your 1-on-1.</>,
    ],
  },
  ld: {
    eyebrow: "L&D workspace · Analytics AI",
    title: "Ask the Capability Analytics AI",
    lede: <>It answers from the organisation's own figures: the readiness index and its components, skill-gap risk, and supply against open demand. Where a figure is not measured, it says so instead of estimating.</>,
    steps: [
      <><strong>Ask a question</strong> or pick a prompt.</>,
      <><strong>Check a figure</strong> against your L&D insights page.</>,
      <><strong>Turn the answer</strong> into a learning campaign.</>,
    ],
  },
  leadership: {
    eyebrow: "Leadership workspace · Strategy AI",
    title: "Ask the Capability Analytics AI",
    lede: <>It answers from the organisation's own figures: the readiness index and its components, skill-gap risk, and supply against open demand. Where a figure is not measured, it says so instead of estimating.</>,
    steps: [
      <><strong>Ask a question</strong> or pick a prompt.</>,
      <><strong>Check a figure</strong> against the Readiness page.</>,
      <><strong>Draft a briefing</strong> for the board.</>,
    ],
  },
};

interface AgentHubProps {
  currentUser: User;
  messages: Message[];
  onSendMessage: (text: string, agent: "skill_gap" | "concierge" | "coach" | "analytics") => void;
  isLoading: boolean;
  onNavigateToDashboard?: () => void;
}

export const AgentHub: React.FC<AgentHubProps> = ({
  currentUser,
  messages,
  onSendMessage,
  isLoading,
  onNavigateToDashboard,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<"skill_gap" | "concierge" | "coach" | "analytics">("skill_gap");
  const [hubMode, setHubMode] = useState<"chat" | "jd_interview">("jd_interview");
  const [inputText, setInputText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Chat Document Upload State
  const [attachedDoc, setAttachedDoc] = useState<ParsedFileInfo | null>(null);
  const [isParsingChatDoc, setIsParsingChatDoc] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);

  // Set default agent based on user role
  useEffect(() => {
    if (currentUser.role === "manager") {
      setSelectedAgent("coach");
      setHubMode("chat");
    } else if (currentUser.role === "ld" || currentUser.role === "leadership") {
      setSelectedAgent("analytics");
      setHubMode("chat");
    } else {
      setSelectedAgent("skill_gap");
      setHubMode("jd_interview");
    }
  }, [currentUser]);

  const handleChatFileChange = async (file: File) => {
    if (!file) return;
    setIsParsingChatDoc(true);
    try {
      const parsed = await parseUploadedFile(file);
      setAttachedDoc(parsed);
      if (!inputText.trim()) {
        setInputText(`I am attaching my profile/resume document (${parsed.fileName}). Please analyze my background and evaluate my technical capabilities.`);
      }
    } catch (err) {
      console.error("Chat file parsing error:", err);
    } finally {
      setIsParsingChatDoc(false);
    }
  };

  // Keep the newest message in view by scrolling the message panel itself. (Scrolling
  // the last message into view moved the whole page, so the copilot page opened
  // scrolled past its own header.)
  useEffect(() => {
    const panel = chatEndRef.current?.parentElement;
    if (hubMode === "chat" && panel) {
      panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading, hubMode]);

  const renderFormattedMessage = (text: string) => {
    // Matches markdown links [title](url) or standalone URLs https://...
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)|(https?:\/\/[^\s\)]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      if (match[1] && match[2]) {
        // [Title](URL) format
        const title = match[1];
        const url = match[2];
        parts.push(
          <a
            key={match.index}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[#4F8EF7] hover:underline font-bold inline-flex items-center gap-1 mx-0.5 underline bg-[#4F8EF7]/10 px-1.5 py-0.5 rounded border border-[#4F8EF7]/30"
          >
            <span>{title}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        );
      } else if (match[3]) {
        // Bare URL format
        const url = match[3];
        parts.push(
          <a
            key={match.index}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[#4F8EF7] hover:underline font-bold inline-flex items-center gap-1 mx-0.5 underline bg-[#4F8EF7]/10 px-1.5 py-0.5 rounded border border-[#4F8EF7]/30"
          >
            <span>{url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    let fullPrompt = inputText;
    if (attachedDoc) {
      fullPrompt += `\n\n[ATTACHED CANDIDATE RESUME / PROFILE DOCUMENT (${attachedDoc.fileName})]:\n"""\n${attachedDoc.extractedText.slice(0, 8000)}\n"""`;
    }
    onSendMessage(fullPrompt, selectedAgent);
    setInputText("");
    setAttachedDoc(null);
  };

  const handlePromptCardClick = (promptText: string) => {
    if (isLoading) return;
    onSendMessage(promptText, selectedAgent);
  };

  // Dynamic Prompt Cards depending on selected Agent and Active User
  const firstName = currentUser?.name ? currentUser.name.split(" ")[0] : "Team Member";
  const promptTemplates = {
    skill_gap: [
      { label: "Analyze My Gaps", text: `Hi, I am ${currentUser?.name || "Team Member"}. Can you analyze my skill gap matrix against my target role requirements?` },
      { label: "Recommend Upskilling Plan", text: `Create a personalized, time-sensitive capability growth roadmap matching my target role and interview timeline.` },
      { label: "Practice Assignment", text: `Recommend a hands-on workplace practice task to address my primary skill gaps.` }
    ],
    concierge: [
      { label: "Concept & Doubt Clarification", text: "I have a technical doubt. Can you explain microservices event-driven patterns vs. REST API integration with code examples?" },
      { label: "Hands-on Practice Activities", text: "Suggest 2-3 hands-on practice assignments or workplace exercises to strengthen my core skill gaps." },
      { label: "Map Catalog Courses", text: "Show me certificates or courses in our catalog that can help me advance my target skills." }
    ],
    coach: [
      { label: "Post-Training GROW Assessment", text: `Run a Post-Training GROW Readiness Assessment to evaluate direct reports who completed Learning Concierge training, recalculate their readiness %, and verify closed skill gaps.` },
      { label: "Review Pending Evidence", text: `Review pending workplace evidence logs from team members and recommend coaching steps.` },
      { label: "Draft GROW Questions", text: `Draft 3 tactical coaching questions for my next 1-on-1 team sessions based on the GROW model.` }
    ],
    analytics: [
      { label: "Enterprise Skill Bottlenecks", text: "Identify the highest-risk capability bottlenecks across our organizational divisions." },
      { label: "Forecast Upskilling Delta", text: "Forecast our overall Capability Readiness Index if we run targeted upskilling cohorts." },
      { label: "Executive Briefing", text: "Draft an executive strategic upskilling report summarizing overall workforce readiness." }
    ]
  };

  const agentDescriptions = {
    skill_gap: {
      name: "SkillGap-to-Growth Agent",
      desc: "Verifies skill gaps via 1st-level assessments (theoretical video Q&A and MCQs) for Project Hiring, Lateral Hiring, or Individual Skill Upgrades.",
      icon: Cpu,
    },
    concierge: {
      name: "Learning Concierge",
      desc: "1-on-1 AI Mentor & Curator. Clears technical doubts, explains code & architectural concepts, recommends catalog courses, and assigns workplace practice exercises.",
      icon: BookOpen,
    },
    coach: {
      name: "Manager GROW Coach",
      desc: "Empowers managers on team capability development and coaching outcomes using GROW framework scripts, evidence validation, and post-training readiness assessments.",
      icon: GraduationCap,
    },
    analytics: {
      name: "Capability Analytics AI",
      desc: "Strategic intelligence layer providing bird's-eye intelligence. Delivers Skill-vs-Will 2×2 matrix insights, Enterprise Readiness Index (ERI), predictive forecasting, supply/demand alignment, and learning ROI.",
      icon: Compass,
    }
  };

  const ActiveAgentIcon = agentDescriptions[selectedAgent].icon;

  return (
    <div className="space-y-4 py-6 animate-fade-in min-h-[750px]">
      
      <PageHeader {...HUB_COPY[currentUser.role]} icon={Sparkles} />

      {/* Top Banner when SkillGap agent is selected */}
      {selectedAgent === "skill_gap" && (
        <div className="bg-[#141E30] border border-[#4F8EF7]/40 rounded-lg p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#0F1724] border border-[#4F8EF7]/40 text-[#4F8EF7] rounded-md">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-bold text-[#F0F4FF]">1st-Level Video Q&A & MCQ Assessment Engine</h3>
                <span className="text-[9px] font-mono font-bold bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                  <Upload className="h-3 w-3" /> Resume Upload Supported (PDF/DOCX)
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                Interactive Video Q&A, Spoken Audio Evaluation & MCQs with optional Candidate Resume / Profile document upload.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setHubMode("chat")}
              className={`py-2 px-3 rounded-md text-xs font-mono font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                hubMode === "chat"
                  ? "bg-[#4F8EF7] text-[#0F1724] border-[#4F8EF7]"
                  : "bg-[#0F1724] text-[#94A3B8] border-[#2A384C] hover:text-[#F0F4FF]"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Agent Chat</span>
            </button>
            <button
              onClick={() => setHubMode("jd_interview")}
              className={`py-2 px-3 rounded-md text-xs font-mono font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                hubMode === "jd_interview"
                  ? "bg-[#10B981] text-[#0F1724] border-[#10B981]"
                  : "bg-[#0F1724] text-[#94A3B8] border-[#2A384C] hover:text-[#F0F4FF]"
              }`}
            >
              <Video className="h-3.5 w-3.5" />
              <span>Launch Video & MCQ Assessment</span>
            </button>
          </div>
        </div>
      )}

      {/* RENDER JD INTERVIEW AGENT COMPONENT WHEN ACTIVE */}
      {selectedAgent === "skill_gap" && hubMode === "jd_interview" ? (
        <SkillGapInterviewAgent
          currentUser={currentUser}
          onNavigateToDashboard={onNavigateToDashboard}
          onRedirectToConcierge={(gaps, role) => {
            setSelectedAgent("concierge");
            setHubMode("chat");
            const gapList = gaps.length > 0 ? gaps.join(", ") : "core architectural concepts & implementation practices";
            onSendMessage(
              `Hi Learning Concierge, my SkillGap assessment for '${role || "target role"}' identified gaps in: ${gapList}. Please recommend verified catalog courses and hands-on practice assignments / workplace exercises to help me bridge these gaps.`,
              "concierge"
            );
          }}
        />
      ) : (
        /* STANDARD CHAT HUB VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 max-h-[700px] h-[700px]">
          
          {/* Sidebar Selector (1 column) */}
          <div className="lg:col-span-1 bg-[#141E30] border border-[#2A384C] rounded-lg p-5 shadow-lg flex flex-col justify-between h-full">
            <div className="space-y-4">
              <h3 className="text-[10px] font-mono font-bold text-[#4F8EF7] uppercase tracking-[0.2em]">Select Cognitive Copilot</h3>
              
              <div className="space-y-3">
                {(Object.keys(agentDescriptions) as Array<keyof typeof agentDescriptions>).map((key) => {
                  const item = agentDescriptions[key];
                  const ItemIcon = item.icon;
                  const isSelected = selectedAgent === key;
                  return (
                    <button
                      key={key}
                      id={`agent-tab-${key}`}
                      onClick={() => {
                        setSelectedAgent(key);
                        if (key !== "skill_gap") setHubMode("chat");
                      }}
                      className={`w-full text-left p-3.5 rounded-md border cursor-pointer flex items-start gap-3 sheen ${
                        isSelected
                          ? "border-[#4F8EF7] bg-[#0F1724] text-[#F0F4FF] shadow-md shadow-[#4F8EF7]/10"
                          : "border-transparent hover:border-[#2A384C] bg-[#0F1724]/40 text-[#94A3B8]"
                      }`}
                    >
                      <ItemIcon className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${isSelected ? "text-[#4F8EF7]" : "text-[#64748B]"}`} />
                      <div>
                        <span className="text-xs font-bold block">{item.name}</span>
                        <span className={`text-[10px] leading-relaxed mt-1 block ${isSelected ? "text-[#94A3B8]" : "text-[#64748B]"}`}>
                          {item.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* View Learning Plan Action Shortcut */}
            {onNavigateToDashboard && (
              <button
                onClick={onNavigateToDashboard}
                className="w-full mt-4 py-2.5 px-3 bg-[#10B981] hover:bg-[#059669] text-[#0F1724] font-mono font-bold text-xs rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                <span>View Adaptive Learning Roadmap</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Chat Canvas (3 columns) */}
          <div className="lg:col-span-3 bg-[#141E30] border border-[#2A384C] rounded-lg shadow-lg flex flex-col h-full overflow-hidden">
            
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-[#2A384C] flex items-center justify-between bg-[#0F1724]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#141E30] border border-[#2A384C] text-[#4F8EF7] rounded-md">
                  <ActiveAgentIcon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#F0F4FF]">{agentDescriptions[selectedAgent].name}</h4>
                  <p className="text-[10px] text-[#94A3B8] font-mono">Secured server-side AI model interface</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {onNavigateToDashboard && (
                  <button
                    onClick={onNavigateToDashboard}
                    className="hidden sm:flex items-center gap-1.5 text-xs font-mono font-bold text-[#10B981] hover:underline cursor-pointer"
                  >
                    <span>View Full Roadmap</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
                <Sparkles className="h-4 w-4 text-[#4F8EF7] animate-pulse" />
              </div>
            </div>

            {/* Message Canvas Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#0F1724]/60">
              {messages.filter(m => m.agentUsed === selectedAgent).length > 0 ? (
                messages.filter(m => m.agentUsed === selectedAgent).map((msg) => {
                  const isUser = msg.sender === "user";
                  return (
                    <div key={msg.id} className={`flex ${isUser ? "justify-end animate-slide-right" : "justify-start animate-slide-left"}`}>
                      <div className={`max-w-[85%] rounded-lg p-4 text-xs leading-relaxed font-sans shadow-sm border ${
                        isUser 
                          ? "bg-[#4F8EF7]/10 border-[#4F8EF7]/40 text-[#F0F4FF] rounded-tr-none" 
                          : "bg-[#0F1724] border-[#2A384C] text-[#F0F4FF] rounded-tl-none whitespace-pre-wrap"
                      }`}>
                        {renderFormattedMessage(msg.text)}
                        <div className={`text-[9px] mt-1.5 font-medium font-mono text-right ${isUser ? "text-[#94A3B8]" : "text-[#64748B]"}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-[#94A3B8]">
                  <ActiveAgentIcon className="h-10 w-10 stroke-1 text-[#2A384C] mb-2 animate-pulse" />
                  <p className="text-xs font-bold text-[#F0F4FF]">Interact with {agentDescriptions[selectedAgent].name}</p>
                  <p className="text-[11px] text-[#94A3B8] max-w-sm mt-1 leading-relaxed">
                    Choose a pre-constructed prompt card below or type your experience, current role, and target career objectives.
                  </p>
                </div>
              )}

              {isLoading && (
                <div className="flex justify-start animate-slide-left">
                  <div className="bg-[#0F1724] border border-[#2A384C] rounded-lg rounded-tl-none p-4 max-w-[80%] flex items-center gap-3">
                    <span className="typing-dots" aria-hidden="true">
                      <span /><span /><span />
                    </span>
                    <span className="text-xs text-[#94A3B8] font-mono">Agent analyzing capability requirements...</span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Prompt Card Suggestions */}
            <div className="px-6 py-3 border-t border-[#2A384C] bg-[#0F1724] flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider mr-1">Prompts:</span>
              {promptTemplates[selectedAgent].map((p, idx) => (
                <button
                  key={idx}
                  id={`prompt-card-${selectedAgent}-${idx}`}
                  onClick={() => handlePromptCardClick(p.text)}
                  disabled={isLoading}
                  className="text-[10px] font-mono font-bold text-[#4F8EF7] bg-[#141E30] border border-[#4F8EF7]/30 hover:border-[#4F8EF7] px-3 py-1 rounded transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Attached Document Banner */}
            {attachedDoc && (
              <div className="px-6 py-2 bg-[#0F1724] border-t border-[#2A384C] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#10B981]">
                  <FileCheck className="h-4 w-4 shrink-0" />
                  <span className="font-mono font-bold">Attached Document:</span>
                  <span className="text-[#F0F4FF] font-semibold">{attachedDoc.fileName}</span>
                  <span className="text-[10px] text-[#94A3B8] font-mono">({attachedDoc.fileSizeFormatted}, {attachedDoc.wordCount} words)</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAgent === "skill_gap" && (
                    <button
                      type="button"
                      onClick={() => setHubMode("jd_interview")}
                      className="text-[10px] font-mono font-bold text-[#4F8EF7] hover:underline bg-[#4F8EF7]/10 border border-[#4F8EF7]/30 px-2 py-0.5 rounded cursor-pointer"
                    >
                      Launch Assessment with Resume
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachedDoc(null)}
                    className="text-[#94A3B8] hover:text-red-400 p-1 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSend} className="p-4 border-t border-[#2A384C] bg-[#141E30] flex gap-2 sm:gap-3 items-center">
              <input
                type="file"
                ref={chatFileInputRef}
                accept=".pdf,.docx,.doc,.txt,.rtf,.md,.json"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleChatFileChange(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => chatFileInputRef.current?.click()}
                disabled={isLoading || isParsingChatDoc}
                title="Attach Candidate Resume or Profile Document (PDF, DOCX, Word, TXT)"
                className="bg-[#0F1724] hover:bg-[#1E293B] text-[#4F8EF7] border border-[#2A384C] hover:border-[#4F8EF7]/50 p-2.5 rounded-md transition-colors cursor-pointer shrink-0 disabled:opacity-50 flex items-center justify-center"
              >
                {isParsingChatDoc ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-[#4F8EF7]" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              <input
                id="chat-user-input"
                type="text"
                required
                placeholder={`Ask ${agentDescriptions[selectedAgent].name} or attach a document...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isLoading}
                className="flex-1 bg-[#0F1724] text-[#F0F4FF] text-xs py-2.5 px-4 rounded-md border border-[#2A384C] focus:outline-none focus:ring-1 focus:ring-[#4F8EF7] disabled:opacity-50"
              />
              <button
                id="send-chat-btn"
                type="submit"
                disabled={isLoading || !inputText.trim()}
                className="bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] p-2.5 rounded-md transition-all shadow-md shadow-[#4F8EF7]/10 cursor-pointer flex items-center justify-center font-bold disabled:opacity-50 shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

          </div>

        </div>
      )}

    </div>
  );
};

