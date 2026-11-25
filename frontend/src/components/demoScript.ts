// The presenter's script, shown in the Demo panel. docs/DEMO_SCRIPT.md is the printed
// version, and a test keeps the two, and the people named here, in step with the sample
// data. `as` is who to switch to, by their label and stage.

export interface DemoStep {
  as: "Leadership" | "Manager" | "handed_off" | "training" | null;
  title: string;
  minutes: number;
  clicks: string[];
  say: string;
}

export const DEMO_SCRIPT: DemoStep[] = [
  {
    as: "Leadership", title: "The whole company on one page", minutes: 2,
    clicks: [
      "You land on Readiness. Point at Enterprise Readiness Index, then at Deployment pipeline.",
      "Scroll to Capability supply against open demand.",
    ],
    say: "Every number comes from a stored record. What we do not measure yet is marked as not measured.",
  },
  {
    as: "Manager", title: "From a job description to the right people", minutes: 3,
    clicks: [
      "Open Demand to deploy. In the search box type Claims and pick Claims Knowledge Assistant.",
      "Point at the bands: Strong, Partial, Low. Click Partial and read one Fit Rationale.",
      "Press Upload a JD file and pick any file from sample-data/job-descriptions, or paste one from the audience.",
      "Press AI Competency Extraction, fill any box that is still empty, then press Publish Requisition to Agent Hub.",
    ],
    say: "Everyone is ranked with a reason. If nobody has a skill, it says so instead of inventing a match.",
  },
  {
    as: "handed_off", title: "The employee takes the test", minutes: 2,
    clicks: [
      "On My readiness, show the project and what is still missing. Press Take the Level-1 assessment.",
      "Press Generate Project Hiring Assessment. Answer two questions with Check Answer.",
      "Open Part 4: Will Survey, choose the answers, then press Finish and save my result. Show the score and the gaps.",
    ],
    say: "The server marks it. The right answers never reach the browser before you answer.",
  },
  {
    as: "training", title: "Learning with proof", minutes: 1,
    clicks: [
      "On My readiness, scroll to Flexible Agentic Learning Journey and press Take Knowledge Check Quiz.",
      "Answer and press Submit answers. If it does not pass, try again. Close it and scroll down to the proof that is waiting for the manager.",
    ],
    say: "Finishing a course is not enough. A manager must see real work.",
  },
  {
    as: "Manager", title: "The manager decides", minutes: 2,
    clicks: [
      "On Team board, scroll to Pending Workplace Evidence Verification Queue. Write a comment and press Approve Evidence.",
      "In the table above it, find Ritu Chatterjee. Press Post-Training GROW Assessment, then Clear for Deployment, then Close Brief.",
    ],
    say: "The manager sees readiness at handoff against readiness now, and signs it off.",
  },
  {
    as: "Manager", title: "The client resume unlocks", minutes: 1,
    clicks: [
      "Open Demand to deploy, search for Visual Quality Inspection and find Ritu Chatterjee in the ranking.",
      "On that card press Client Resume Readiness. All three checks are green: press Generate Client Resume.",
    ],
    say: "It is written only from verified facts, and only after these three checks.",
  },
  {
    as: "Leadership", title: "Back to the top", minutes: 1,
    clicks: ["On Readiness, show that Cleared and Resume ready have each gone up by one."],
    say: "One flow, from a client's demand to a person who is ready, with proof at each step.",
  },
];
