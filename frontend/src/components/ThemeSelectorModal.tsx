import React, { useState } from "react";
import { 
  ThemeId, 
  FontId, 
  THEME_OPTIONS, 
  FONT_OPTIONS, 
  applyThemeToDocument, 
  applyFontToDocument, 
  getCurrentFont 
} from "../lib/theme";
import { Palette, CheckCircle2, Sparkles, X, Type, Eye, ShieldCheck } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeId;
  onSelectTheme: (themeId: ThemeId) => void;
}

export const ThemeSelectorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme
}) => {
  const [activeTab, setActiveTab] = useState<"palettes" | "typography">("palettes");
  const [selectedTemp, setSelectedTemp] = useState<ThemeId>(currentTheme);
  const [selectedFont, setSelectedFont] = useState<FontId>(getCurrentFont());

  if (!isOpen) return null;

  const handleApplyTheme = (themeId: ThemeId) => {
    setSelectedTemp(themeId);
    applyThemeToDocument(themeId);
    onSelectTheme(themeId);
  };

  const handleApplyFont = (fontId: FontId) => {
    setSelectedFont(fontId);
    applyFontToDocument(fontId);
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="modal-panel bg-[#0F1724] border border-[#2A384C] rounded-2xl max-w-5xl w-full p-6 shadow-2xl relative my-8 text-white overflow-hidden">
        <div className="bg-circuit absolute inset-0 opacity-[0.04] pointer-events-none" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 accent-rule" aria-hidden="true" />

        <div className="relative space-y-6">
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-[#2A384C] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#141E30] text-[#4F8EF7] rounded-xl border border-[#4F8EF7]/40 shadow-inner animate-float">
              <Palette className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded">
                  UI/UX Customizer
                </span>
                <span className="text-xs font-mono text-[#94A3B8]">CyBridge - Workforce Capability Agent</span>
              </div>
              <h2 className="text-xl font-bold mt-0.5 gradient-text">Custom Themes & Readability Font Selector</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[#94A3B8] hover:text-white bg-[#141E30] hover:bg-[#1E293B] rounded-lg border border-[#2A384C] transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher: Color Palettes vs Typography */}
        <div className="flex items-center gap-3 border-b border-[#2A384C] pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("palettes")}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "palettes"
                ? "bg-[#4F8EF7] text-[#0F1724] shadow-lg"
                : "bg-[#141E30] text-[#94A3B8] hover:text-white border border-[#2A384C]"
            }`}
          >
            <Palette className="h-4 w-4" />
            Color Palettes ({THEME_OPTIONS.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("typography")}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "typography"
                ? "bg-[#4F8EF7] text-[#0F1724] shadow-lg"
                : "bg-[#141E30] text-[#94A3B8] hover:text-white border border-[#2A384C]"
            }`}
          >
            <Type className="h-4 w-4" />
            Readability Fonts ({FONT_OPTIONS.length})
          </button>
        </div>

        {activeTab === "palettes" ? (
          <>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Select an enterprise-engineered color theme. Every palette providesWCAG AA high-contrast ratios, crisp background separation, and distinct AI status indicators.
            </p>

            {/* 6 Theme Cards Grid */}
            <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
              {THEME_OPTIONS.map((theme) => {
                const isSelected = selectedTemp === theme.id;
                const isCurrentActive = currentTheme === theme.id;

                return (
                  <div
                    key={theme.id}
                    onClick={() => handleApplyTheme(theme.id)}
                    className={`p-4 rounded-xl border cursor-pointer relative flex flex-col justify-between space-y-3 hover-lift sheen ${
                      isSelected
                        ? "bg-[#141E30] border-[#4F8EF7] ring-2 ring-[#4F8EF7] shadow-xl"
                        : "bg-[#0A0A0A]/80 border-[#2A384C] hover:border-[#4F8EF7]/50 hover:bg-[#141E30]/50"
                    }`}
                  >
                    {/* Active Indicator Badge */}
                    {isCurrentActive && (
                      <span className="absolute top-3 right-3 text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded">
                          {theme.badge}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white leading-tight">{theme.name}</h3>
                      <p className="text-[11px] font-mono text-[#4F8EF7]">{theme.tagline}</p>
                      <p className="text-[11px] text-[#94A3B8] leading-snug">{theme.description}</p>
                    </div>

                    {/* Interactive Mini Visual Mockup Preview */}
                    <div 
                      className="p-2.5 rounded-lg border text-xs font-mono space-y-1.5"
                      style={{
                        backgroundColor: theme.previewColors.bg,
                        borderColor: theme.previewColors.border,
                        color: theme.previewColors.text
                      }}
                    >
                      <div className="flex items-center justify-between text-[10px] border-b pb-1" style={{ borderColor: theme.previewColors.border }}>
                        <span className="font-bold uppercase opacity-80">Card Preview</span>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ backgroundColor: theme.previewColors.accent + "20", color: theme.previewColors.accent }}>
                          AI Active
                        </span>
                      </div>

                      <div className="p-2 rounded border shadow-sm space-y-1" style={{ backgroundColor: theme.previewColors.card, borderColor: theme.previewColors.border, color: theme.previewColors.text }}>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold">SkillGap Match: 94%</p>
                          <span className="text-[8px] font-mono px-1 py-0.5 rounded text-emerald-400 bg-emerald-500/20">Validated</span>
                        </div>
                        <div className="w-full bg-slate-800/50 h-1 rounded-full overflow-hidden">
                          <div className="h-full rounded-full progress-fill" style={{ width: "94%", backgroundColor: theme.previewColors.accent }} />
                        </div>
                      </div>
                    </div>

                    {/* Select Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyTheme(theme.id);
                      }}
                      className={`w-full py-2 px-3 rounded-lg font-mono text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isSelected 
                          ? "bg-[#4F8EF7] text-[#0F1724] shadow-md" 
                          : "bg-[#141E30] text-[#4F8EF7] border border-[#4F8EF7]/40 hover:bg-[#1E293B]"
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {isSelected ? "Active Theme" : "Apply Palette"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              Select a primary typography font tailored for optimal visual legibility, lower reading fatigue, and clean technical rendering across high-density displays.
            </p>

            {/* Font Options Cards Grid */}
            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
              {FONT_OPTIONS.map((font) => {
                const isSelected = selectedFont === font.id;

                return (
                  <div
                    key={font.id}
                    onClick={() => handleApplyFont(font.id)}
                    className={`p-5 rounded-xl border cursor-pointer relative flex flex-col justify-between space-y-4 hover-lift sheen ${
                      isSelected
                        ? "bg-[#141E30] border-[#4F8EF7] ring-2 ring-[#4F8EF7] shadow-xl"
                        : "bg-[#0A0A0A]/80 border-[#2A384C] hover:border-[#4F8EF7]/50 hover:bg-[#141E30]/50"
                    }`}
                  >
                    {/* Top Row */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase text-[#4F8EF7] bg-[#4F8EF7]/10 px-2 py-0.5 rounded">
                          {font.badge}
                        </span>
                        {isSelected && (
                          <span className="text-[9px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Active Font
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-white">{font.name}</h3>
                      <p className="text-xs font-mono text-[#4F8EF7]">{font.tagline}</p>
                      <p className="text-xs text-[#94A3B8] leading-snug">{font.description}</p>
                    </div>

                    {/* Live Font Specimen Box */}
                    <div 
                      className="p-3.5 rounded-lg border border-[#2A384C] bg-[#070B12] space-y-2 shadow-inner"
                      style={{ fontFamily: font.family }}
                    >
                      <div className="flex items-center justify-between text-[10px] text-[#94A3B8] font-mono border-b border-[#1E293B] pb-1.5">
                        <span className="flex items-center gap-1 text-[#4F8EF7]"><Eye className="h-3 w-3" /> Live Typography Specimen</span>
                        <span>{font.name}</span>
                      </div>

                      <p className="text-sm font-semibold text-white leading-normal">
                        "{font.sampleText}"
                      </p>

                      <p className="text-xs text-[#CBD5E1] opacity-90">
                        ABCDEFGHIJKLMNOPQRSTUVWXYZ <br />
                        abcdefghijklmnopqrstuvwxyz 1234567890
                      </p>
                    </div>

                    {/* Select Font Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyFont(font.id);
                      }}
                      className={`w-full py-2.5 px-4 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#4F8EF7] text-[#0F1724] shadow-md"
                          : "bg-[#141E30] text-[#4F8EF7] border border-[#4F8EF7]/40 hover:bg-[#1E293B]"
                      }`}
                    >
                      <Type className="h-3.5 w-3.5" />
                      {isSelected ? "Selected Readability Font" : "Apply This Font"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Modal Footer */}
        <div className="relative flex items-center justify-between pt-4 border-t border-[#2A384C]">
          <div className="flex items-center gap-3 text-xs font-mono text-[#94A3B8]">
            <span>Theme: <strong className="text-white">{THEME_OPTIONS.find(t => t.id === selectedTemp)?.name}</strong></span>
            <span>•</span>
            <span>Font: <strong className="text-white">{FONT_OPTIONS.find(f => f.id === selectedFont)?.name}</strong></span>
          </div>

          <button
            onClick={onClose}
            className="bg-[#4F8EF7] hover:bg-[#3B82F6] text-[#0F1724] font-bold text-xs py-2.5 px-6 rounded-lg font-mono uppercase tracking-wider transition-all cursor-pointer shadow-lg flex items-center gap-2"
          >
            <ShieldCheck className="h-4 w-4" />
            Done & Save Settings
          </button>
        </div>
        </div>

      </div>
    </div>
  );
};

