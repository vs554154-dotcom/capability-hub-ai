# CyBridge demo script

About 12 minutes, one story: from a client's demand to a person who is ready.

This is the printed version of the **Script** tab in the app's Demo panel
(`frontend/src/components/demoScript.ts`). A test keeps the two in step.

## Before you start

1. Put `DEMO_TOOLS="true"` in `.env` and start the app on your own computer. The Demo
   button does not exist anywhere else.
2. Open `http://localhost:8000` and sign in as David Vance
   (`david.vance@capabilityhub.ai`). The first sign-in sets the password.
3. Press **Demo** at the top, then **Reset demo**, so the demo starts from its starting point.
4. If interview dates have passed, the reset has already moved them ahead.

To change person at any time: **Demo** → **People** → **Switch**.

## The story

### 1. The whole company on one page (about 2 min)

As **David Vance (leader)**

- You land on Readiness. Point at Enterprise Readiness Index, then at Deployment pipeline.
- Scroll to Capability supply against open demand.

> Say: “Every number comes from a stored record. What we do not measure yet is marked as not measured.”

### 2. From a job description to the right people (about 3 min)

As **Olivia Grant (manager)**

- Open Demand to deploy. In the search box type Claims and pick Claims Knowledge Assistant.
- Point at the bands: Strong, Partial, Low. Click Partial and read one Fit Rationale.
- Press Upload a JD file and pick any file from sample-data/job-descriptions, or paste one from the audience.
- Press AI Competency Extraction, fill any box that is still empty, then press Publish Requisition to Agent Hub.

> Say: “Everyone is ranked with a reason. If nobody has a skill, it says so instead of inventing a match.”

### 3. The employee takes the test (about 2 min)

As **Nadia Gill (employee)**

- On My readiness, show the project and what is still missing. Press Take the Level-1 assessment.
- Press Generate Project Hiring Assessment. Answer two questions with Check Answer.
- Open Part 4: Will Survey, choose the answers, then press Finish and save my result. Show the score and the gaps.

> Say: “The server marks it. The right answers never reach the browser before you answer.”

### 4. Learning with proof (about 1 min)

As **Ajay Agarwal (employee)**

- On My readiness, scroll to Flexible Agentic Learning Journey and press Take Knowledge Check Quiz.
- Answer and press Submit answers. If it does not pass, try again. Close it and scroll down to the proof that is waiting for the manager.

> Say: “Finishing a course is not enough. A manager must see real work.”

### 5. The manager decides (about 2 min)

As **Olivia Grant (manager)**

- On Team board, scroll to Pending Workplace Evidence Verification Queue. Write a comment and press Approve Evidence.
- In the table above it, find Ritu Chatterjee. Press Post-Training GROW Assessment, then Clear for Deployment, then Close Brief.

> Say: “The manager sees readiness at handoff against readiness now, and signs it off.”

### 6. The client resume unlocks (about 1 min)

As **Olivia Grant (manager)**

- Open Demand to deploy, search for Visual Quality Inspection and find Ritu Chatterjee in the ranking.
- On that card press Client Resume Readiness. All three checks are green: press Generate Client Resume.

> Say: “It is written only from verified facts, and only after these three checks.”

### 7. Back to the top (about 1 min)

As **David Vance (leader)**

- On Readiness, show that Cleared and Resume ready have each gone up by one.

> Say: “One flow, from a client's demand to a person who is ready, with proof at each step.”

## If something does not go as planned

- **The AI is busy or out of its daily quota.** The app still answers, and says that the
  text was computed from records. Nothing else changes.
- **A wrong click.** Press **Demo**, then **Reset demo**. It takes a few seconds and keeps
  a backup in `backups/`.
- **You want your own starting point.** Prepare the demo as you like, then press **Save as
  the starting point**. Reset goes back to that from then on.
