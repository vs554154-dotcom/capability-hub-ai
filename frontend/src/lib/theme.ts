export type ThemeId = 
  | "hybrid_cobalt" 
  | "pearl_emerald" 
  | "executive_light" 
  | "ice_indigo" 
  | "warm_amber" 
  | "teal_matrix";

export type FontId = "jakarta" | "inter" | "outfit" | "lexend";

export interface UIThemeOption {
  id: ThemeId;
  name: string;
  tagline: string;
  badge: string;
  description: string;
  previewColors: {
    bg: string;
    card: string;
    border: string;
    accent: string;
    text: string;
    secondaryText: string;
  };
  features: string[];
}

export interface UIFontOption {
  id: FontId;
  name: string;
  family: string;
  tagline: string;
  badge: string;
  description: string;
  sampleText: string;
}

export const FONT_OPTIONS: UIFontOption[] = [
  {
    id: "jakarta",
    name: "Plus Jakarta Sans",
    family: "'Plus Jakarta Sans', sans-serif",
    tagline: "Modern Geometric Corporate Sans",
    badge: "Default Choice",
    description: "Designed for modern tech products with balanced proportions and crisp letterforms at high pixel densities.",
    sampleText: "CyBridge - Workforce Capability Agent empowers workforce growth through real-time skill analytics."
  },
  {
    id: "inter",
    name: "Inter Variable",
    family: "'Inter', sans-serif",
    tagline: "Ultra-Crisp UI Standard",
    badge: "High Density",
    description: "Specialized for computer screens with a tall x-height to aid in legibility of mixed-case and lower-case text.",
    sampleText: "SkillGap Index validated: 94% job description readiness score across all modules."
  },
  {
    id: "outfit",
    name: "Outfit Sans",
    family: "'Outfit', sans-serif",
    tagline: "Humanistic & Friendly Tech Typeface",
    badge: "Executive Display",
    description: "Distinctive geometric curves that create a warm, approachable yet highly polished enterprise feel.",
    sampleText: "AI Copilots generated adaptive capability acceleration roadmaps for engineering leads."
  },
  {
    id: "lexend",
    name: "Lexend Readability Font",
    family: "'Lexend', sans-serif",
    tagline: "Scientifically Formulated for Reading Speed",
    badge: "Maximum Legibility",
    description: "Designed by educational researchers specifically to reduce cognitive reading strain and speed up comprehension.",
    sampleText: "GROW Coaching sessions scheduled with Marcus Sterling for Friday at 3:00 PM."
  }
];

export const THEME_OPTIONS: UIThemeOption[] = [
  {
    id: "executive_light",
    name: "Executive Light Mode (Crisp & Legible)",
    tagline: "Clean Light Canvas (#F8FAFC) + Pure White Cards",
    badge: "Recommended Default",
    description: "Ultra-legible, crisp light layout featuring pristine white component cards (#FFFFFF) on slate-50 background with royal blue accents and rich dark slate typography (#0F172A) for 100% WCAG AAA contrast.",
    previewColors: {
      bg: "#F8FAFC",
      card: "#FFFFFF",
      border: "#CBD5E1",
      accent: "#2563EB",
      text: "#0F172A",
      secondaryText: "#334155"
    },
    features: ["Clean light background with pure white component cards", "High-contrast dark slate text (#0F172A) for 100% readability", "Royal blue focus indicators & high-visibility borders"]
  },
  {
    id: "hybrid_cobalt",
    name: "Enterprise Slate & Dark Navy",
    tagline: "High-Contrast Slate Navy (#0A0F1D) + Electric Cobalt",
    badge: "Dark Navy",
    description: "Deep midnight slate canvas with high-contrast component cards (#161F33), crisp pure white headings, and vivid cobalt AI highlights.",
    previewColors: {
      bg: "#0A0F1D",
      card: "#161F33",
      border: "#2A3852",
      accent: "#3B82F6",
      text: "#FFFFFF",
      secondaryText: "#CBD5E1"
    },
    features: ["Deep midnight slate canvas background", "High-contrast #161F33 component cards", "Vivid cobalt blue AI indicators & crisp white text"]
  },
  {
    id: "pearl_emerald",
    name: "Cyber Obsidian & Emerald",
    tagline: "Obsidian Canvas (#070B12) + Cyber Emerald AI",
    badge: "Cyber Intelligence",
    description: "Ultra-sleek obsidian canvas framing deep charcoal cards (#0F172A) with luminous cyber emerald metrics and crisp ice-white typography.",
    previewColors: {
      bg: "#070B12",
      card: "#0F172A",
      border: "#1E293B",
      accent: "#10B981",
      text: "#F9FAFB",
      secondaryText: "#E5E7EB"
    },
    features: ["Deep obsidian canvas frame", "Rich dark cards for zero eye strain", "Cyber emerald & cyan high-contrast metrics"]
  },
  {
    id: "ice_indigo",
    name: "Midnight Indigo & Violet",
    tagline: "Midnight Indigo (#090C1F) + Electric Violet",
    badge: "Executive Violet",
    description: "Rich dark indigo canvas framing royal indigo component cards (#151B3B) with electric violet callouts and bright ice-white typography.",
    previewColors: {
      bg: "#090C1F",
      card: "#151B3B",
      border: "#2E3663",
      accent: "#818CF8",
      text: "#F8FAFC",
      secondaryText: "#C7D2FE"
    },
    features: ["Midnight indigo tint background", "Deep royal purple-indigo cards", "Vibrant violet callouts & high-contrast labels"]
  },
  {
    id: "warm_amber",
    name: "Warm Charcoal & Amber Gold",
    tagline: "Warm Onyx (#121214) + Amber Gold Accent",
    badge: "Warm Focus",
    description: "Gentle warm dark canvas (#121214) with deep zinc charcoal cards (#1C1C21) and warm amber gold focus accents for comfortable long sessions.",
    previewColors: {
      bg: "#121214",
      card: "#1C1C21",
      border: "#3F3F46",
      accent: "#F59E0B",
      text: "#FAFAFA",
      secondaryText: "#D4D4D8"
    },
    features: ["Warm dark background reduces visual glare", "High contrast zinc component surfaces", "Amber gold coaching & progress indicators"]
  },
  {
    id: "teal_matrix",
    name: "Deep Ocean & Mint Intelligence",
    tagline: "Deep Ocean Teal (#04151B) + Mint Cyan",
    badge: "Ocean Analytics",
    description: "Deep oceanic dark teal backdrop with rich marine cards (#0B222C), mint green progress indicators, and bright crisp typography.",
    previewColors: {
      bg: "#04151B",
      card: "#0B222C",
      border: "#163845",
      accent: "#14B8A6",
      text: "#F0FDF4",
      secondaryText: "#99F6E4"
    },
    features: ["Calming deep ocean backdrop", "Marine blue-teal component surfaces", "Bright mint green AI & analytical metrics"]
  }
];

export function applyFontToDocument(fontId: FontId) {
  const fontObj = FONT_OPTIONS.find(f => f.id === fontId) || FONT_OPTIONS[0];
  const root = document.documentElement;
  root.style.setProperty("--font-app", fontObj.family);
  document.body.style.fontFamily = `${fontObj.family}, sans-serif`;
  document.documentElement.setAttribute("data-font", fontId);
  try {
    localStorage.setItem("app_font", fontId);
  } catch (e) {
    // ignore
  }
}

export function getCurrentFont(): FontId {
  try {
    const saved = localStorage.getItem("app_font") as FontId;
    if (saved && FONT_OPTIONS.some(f => f.id === saved)) {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return "jakarta";
}

export function getCurrentTheme(): ThemeId {
  try {
    const saved = localStorage.getItem("app_theme") as ThemeId;
    if (saved && THEME_OPTIONS.some(t => t.id === saved)) {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return "executive_light";
}

export function applyThemeToDocument(themeId: ThemeId) {
  const root = document.documentElement;
  const theme = THEME_OPTIONS.find(t => t.id === themeId) || THEME_OPTIONS[0];

  // Set root CSS Variables
  root.style.setProperty("--app-bg", theme.previewColors.bg);
  root.style.setProperty("--app-card-bg", theme.previewColors.card);
  root.style.setProperty("--app-card-border", theme.previewColors.border);
  root.style.setProperty("--app-accent", theme.previewColors.accent);
  root.style.setProperty("--app-text", theme.previewColors.text);
  root.style.setProperty("--app-secondary-text", theme.previewColors.secondaryText);

  // Set body background & text color directly
  document.body.style.backgroundColor = theme.previewColors.bg;
  document.body.style.color = theme.previewColors.text;

  // Add data attribute to html
  document.documentElement.setAttribute("data-theme", themeId);

  try {
    localStorage.setItem("app_theme", themeId);
  } catch (e) {
    // ignore
  }

  // Apply active font as well
  applyFontToDocument(getCurrentFont());
}




