"""Builds the demo data set from the plain-text sources in backend/seed/source/.

    python backend/scripts/build_demo_seed.py

Writes, always the same output for the same sources:
  backend/seed/demo_seed.json       rows for the database tables (people, skills, demands...)
  backend/seed/skill_aliases.json   other names a job description may use for a skill
  backend/seed/question_bank.json   adds the demo skills' questions to the base ones
  sample-data/job-descriptions/     one job description per role, to paste or upload

To add a technology or a role, edit the sources and run this again, then load it with
backend/scripts/load_demo_data.py. Every person and client is made up.
"""
from __future__ import annotations

import ast
import json
import random
import re
import shutil
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "backend" / "seed" / "source"
SEED = ROOT / "backend" / "seed"
JD_DIR = ROOT / "sample-data" / "job-descriptions"

CATEGORY = {"T": "Technical", "M": "Methodology", "L": "Leadership", "D": "Domain"}

FIRST = """Aanya Abhishek Adil Aisha Ajay Akash Alisha Amara Amit Amrita Anil Anjali Ankit Anushka Arnav Arpita
Asha Ashwin Ayaan Ayesha Bhavna Bharat Chetan Chitra Daksh Darshan Deepa Devika Dhruv Diya Ekta Esha Farhan Fatima
Gaurav Gauri Girish Gita Hamza Hari Harini Harsh Hema Imran Indira Irfan Isha Ishaan Jatin Jaya Joseph Juhi Kabir
Kamal Kanika Kartik Kavita Kiran Krishna Kunal Lakshmi Lalit Lata Leena Madhav Mahesh Malini Manav Manish Manoj Maya
Megha Mihir Mohan Monica Mukesh Nadia Naina Nakul Namrata Nandini Naveen Nidhi Nikita Nisha Nitin Omkar Padma Pallavi
Pankaj Parth Pavan Payal Prachi Pranav Prerna Priyanka Radha Raghav Rajesh Rakesh Ramya Ranveer Rashmi Ravi Rekha
Reyansh Rhea Ritika Ritu Rohit Roshni Rudra Sachin Sagar Sahil Sakshi Salman Samar Sameer Sana Sandeep Sanjana
Sanjay Sarita Saurabh Shalini Shanaya Shiv Shreya Shubham Simran Sonal Sonia Suhani Sunil Suresh Swati Tanvi Tara
Tarun Tejas Trisha Uday Uma Urvi Vaibhav Vani Varsha Varun Veena Vidya Vihaan Vinay Vineet Vishal Vivek Yamini Yash
Yusuf Zara Zoya Daniel Elena Emma Grace Hannah Julia Kofi Lucas Maria Mateo Nora Oliver Samuel Sofia Tomas Wei
Yuki""".split()
LAST = """Acharya Agarwal Ahmed Bajaj Banerjee Bansal Bhatia Bhatt Bose Chandra Chatterjee Chauhan Chopra Das Desai
Deshpande Dixit D'Souza Dutta Fernandes Gandhi Ganguly Ghosh Gill Goel Gokhale Gupta Hegde Iyer Jain Jha Joshi Kamath
Kapoor Kaur Khan Khanna Kulkarni Kumar Mathew Mehta Menon Mishra Mukherjee Nair Naidu Narang Pandey Patel Patil Pillai
Prasad Qureshi Rajan Rao Reddy Saxena Sethi Shah Sharma Shetty Singh Sinha Srinivasan Thakur Thomas Tiwari Trivedi
Varma Verma Walia Yadav""".split()

# practice -> (colour of the initials picture, how many managers share it)
PRACTICES = {
    "Digital Engineering": ("#1D4ED8", 2), "Mobile & Connected Products": ("#0F766E", 1),
    "Cloud & Platform": ("#0369A1", 2), "Cybersecurity": ("#B91C1C", 1),
    "Data & Analytics": ("#7C3AED", 1), "AI & Machine Learning": ("#A21CAF", 1),
    "SaaS & CRM Platforms": ("#C2410C", 1), "Enterprise Applications": ("#4D7C0F", 2),
    "Quality Engineering": ("#0E7490", 1), "Consulting & Delivery": ("#9A3412", 1),
    "IT Operations & Support": ("#475569", 1),
}
MANAGERS = ["Anita Deshmukh", "Robert Mathews", "Farah Siddiqui", "George Kurian", "Lakshya Menon", "Meenal Kapadia",
            "Nathan Cole", "Olivia Grant", "Prakash Nambiar", "Renuka Sastry", "Stephen D'Cruz", "Tanya Arora",
            "Umesh Kohli", "Victoria Lang"]

FIRST_MORE = """Aadhya Aakash Abha Aditi Advait Ahana Ajit Alok Ambika Amol Anand Ananta Aneesh Anika Anjana Antara Anurag Aparna
Archana Aryan Asmita Atul Avni Ayush Babita Barkha Bela Bhaskar Bhumika Charu Chirag Damini Deepak Deven Dilip Disha Divya
Dolly Elina Falguni Faisal Ganesh Gargi Geeta Gopal Govind Gulshan Hansa Hardik Harsha Hemant Hitesh Indu Ishwar Jagdish
Janvi Jayant Jignesh Jyoti Kailash Kalpana Kamini Karthik Kashish Ketan Khushi Kishore Komal Kriti Kuldeep Lavanya Lekha
Madhuri Mahima Mandeep Mansi Mayank Meera Milind Mitali Mohini Mukul Nalini Naman Narayan Natasha Neeraj Neetu Nikhil Nilesh
Nimisha Nirav Nitya Nupur Ojas Pooja Poonam Prabha Pradeep Pragya Prakriti Pratik Praveen Preeti Priti Puneet Purvi Rachna
Raghu Rahul Rajat Rajiv Rama Ranjit Ravina Renu Revati Richa Rishi Riya Rohan Ruchi Rupali Sabina Sahana Samir Sanya Sapna
Sarthak Sejal Shankar Sharad Sheela Shikha Shilpa Shruti Siddhi Smita Sneha Sourav Sridhar Srishti Stuti Sudha Sujata Sumit
Surbhi Sushma Tanmay Tanuja Tripti Tushar Ujjwal Urmila Vandana Vasudha Vijay Vikas Vimal Vinod Vishnu Yogesh Yogita
Aaron Adam Alice Andrei Anna Beatriz Carlos Chloe Clara David Diego Eva Felix Gabriel Henrik Ines Ivan James Kenji Laura
Leon Linh Luis Marco Mei Miguel Naomi Noah Omar Paula Pedro Rafael Rosa Sara Simon Tariq Victor Wanjiru Yara Zainab""".split()
MANAGERS_MORE = ["Arvind Shenoy", "Bindu Raghavan", "Christine Paul", "Dinesh Rathore", "Ellen Fischer", "Firoz Merchant",
                 "Gayatri Subramanian", "Hugo Lindqvist", "Indrani Sengupta", "Jason Whitfield", "Kamala Venkatesh",
                 "Leonard Pinto", "Mridula Nanda", "Neville Dastur", "Ophelia Grant", "Parvez Contractor", "Rukmini Bhandari",
                 "Sandra Oduya", "Trilok Mahajan", "Ursula Becker", "Vasant Kelkar", "Wilson Fernando", "Yamuna Iyengar",
                 "Zubin Irani", "Aruna Salvi", "Bernard Coutinho", "Chandana Rao", "Dominic Walsh", "Esther Mbeki", "Frank Delgado"]

# Level of the 1st, 2nd, 3rd... skill of a role by seniority, and the years that go with it.
SENIORITY = {
    "Lead": ([5, 5, 4, 4, 4, 3, 3, 3], (11, 15)),
    "Senior": ([5, 4, 4, 4, 3, 3, 3, 3], (7, 10)),
    "Mid": ([4, 4, 3, 3, 2, 3, 2, 2], (4, 6)),
    "Associate": ([3, 3, 2, 2, 1, 2, 1, 1], (1, 3)),
}
TEAM = {2: [("Senior", "Associate"), ("Lead", "Mid"), ("Senior", "Mid")], 3: [("Senior", "Mid", "Associate"), ("Lead", "Senior", "Mid")]}
PREFIX = {"Lead": "Lead ", "Senior": "Senior ", "Mid": "", "Associate": "Associate "}

GENERIC = [
    ("Practice project: {s}", "Turned a course into working knowledge",
     "Built a small example using {s}, wrote notes on what was learned and walked a colleague through it."),
    ("Team session on {s}", "The team now follows one approach",
     "Prepared and led an internal session on {s}, with examples from a recent project and a one-page guide."),
    ("Checklist for {s}", "New joiners avoid the usual mistakes",
     "Collected common problems with {s} from the last project and wrote a checklist the team now uses in reviews."),
]
COMMENTS = ["Checked the work itself, not only the description. Approved.", "Clear and useful. Approved.",
            "Reviewed with the team lead; meets the standard. Approved.", "Good detail on how it was tested. Approved.",
            "Saw it running in the demo. Approved."]


def lines(path: Path) -> list[str]:
    return [l.rstrip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def parts(text: str, sep: str = "|") -> list[str]:
    return [p.strip() for p in text.split(sep)]


def names(text: str) -> list[str]:
    return [p for p in parts(text, ",") if p]


def stop(message: str) -> None:
    sys.exit(f"build_demo_seed: {message}")


# --------------------------------------------------------------------------- #
# Sources
# --------------------------------------------------------------------------- #

base = json.loads((SEED / "seed.json").read_text(encoding="utf-8"))
skill_id = {s["name"]: s["id"] for s in base["skills"]}
BASE_SKILLS = set(skill_id)

skills: list[dict[str, Any]] = []
aliases: dict[str, dict[str, list[str]]] = {}


def other_names(skill: str, text: str) -> None:
    given = [n for n in parts(text, ";") if n]
    if given:
        aliases[skill] = {
            "names": [n for n in given if n[0] not in "=^"],
            "cased": [n[1:].strip() for n in given if n[0] == "^"],
            "exact": [n[1:].strip() for n in given if n[0] == "="],
        }


for line in lines(SOURCE / "skills.txt"):
    if line.startswith("#"):
        continue
    if line.startswith("+"):
        name, extra = parts(line[1:])
        if name not in BASE_SKILLS:
            stop(f"{name!r} is not in the base catalogue")
        other_names(name, extra)
        continue
    fields = parts(line) + [""]
    name, category, description, extra = fields[:4]
    if name in skill_id or "," in name:
        stop(f"skill name {name!r} is used twice or has a comma")
    skill_id[name] = f"sk_{101 + len(skills)}"
    skills.append({"id": skill_id[name], "name": name, "category": CATEGORY[category], "description": description})
    other_names(name, extra)

taken: dict[str, str] = {}
for skill, group in aliases.items():
    for n in group["names"] + group["cased"] + group["exact"]:
        key = n.lower()
        if key in {s.lower() for s in skill_id}:
            stop(f"other name {n!r} of {skill!r} is itself a skill")
        if key in taken:
            stop(f"other name {n!r} is given to {taken[key]!r} and {skill!r}")
        taken[key] = skill

courses = []
course_of: dict[str, dict[str, Any]] = {}
for line in lines(SOURCE / "courses.txt"):
    if line.startswith("#"):
        continue
    skill, title, provider, url, kind = parts(line)
    course = {
        "id": f"c_{101 + len(courses)}", "title": title, "provider": provider, "duration": "Self-paced",
        "skillId": skill_id[skill], "description": f"{title} from {provider}. Teaches {skill}.", "type": kind,
        "url": url, "rating": None, "enrollmentCount": None, "lastUpdated": None, "isLatest2026": 0,
    }
    courses.append(course)
    course_of[skill] = course
for c in base["courses"]:
    course_of.setdefault(next(n for n, i in skill_id.items() if i == c["skillId"]), c)

quiz: dict[str, list[list[Any]]] = {}
for path in sorted(SOURCE.glob("quiz_*.txt")):
    current = ""
    for line in lines(path):
        if line.startswith("## "):
            current = line[3:].strip()
            if current not in skill_id or current in quiz:
                stop(f"{path.name}: {current!r} is unknown or repeated")
            quiz[current] = []
        elif not line.startswith("#"):
            q, *options, why = parts(line)
            if len(options) != 4 or len(set(options)) != 4:
                stop(f"{path.name}: {q!r} needs four different options")
            quiz[current].append([q, options, why])
missing = [s["name"] for s in skills if len(quiz.get(s["name"], [])) < 3]
if missing:
    stop(f"fewer than three questions: {missing}")

roles: list[dict[str, Any]] = []
for line in lines(SOURCE / "roles.txt"):
    if line.startswith("## "):
        title, practice, domains, count = parts(line[3:])
        roles.append({"title": title, "practice": practice, "domains": names(domains), "count": int(count), "ev": []})
    elif not line.startswith("#"):
        key, value = line.split(":", 1)
        value = value.strip()
        if key == "ev":
            roles[-1]["ev"].append(parts(value, "::"))
        elif key == "demand":
            roles[-1]["demand"] = parts(value)
        else:
            roles[-1][key] = names(value) if key in ("skills", "nice") else parts(value, ";") if key == "do" else value
for r in roles:
    if r["practice"] not in PRACTICES:
        stop(f"{r['title']}: unknown practice {r['practice']!r}")
    unknown = [s for s in r["skills"] + r["nice"] if s not in skill_id]
    if unknown or len(r["ev"]) != 2 or any(len(e) != 3 for e in r["ev"]):
        stop(f"{r['title']}: unknown skills {unknown} or incomplete evidence")

# --------------------------------------------------------------------------- #
# Target roles, managers and people
# --------------------------------------------------------------------------- #

target_roles, target_role_skills = [], []
for i, r in enumerate(roles):
    r["id"] = f"role_{101 + i}"
    target_roles.append({"id": r["id"], "title": r["title"], "description": r["about"]})
    r["min"] = {s: (4 if k < (3 if len(r["skills"]) > 5 else 2) else 3) for k, s in enumerate(r["skills"])}
    target_role_skills += [{"roleId": r["id"], "skillId": skill_id[s], "minLevel": m} for s, m in r["min"].items()]
role_id = {r["title"]: r["id"] for r in roles}
NEXT_ROLE = {"Digital Engineering": "Solution Architect", "Cloud & Platform": "Cloud Architect"}


def picture(name: str, colour: str) -> str:
    initials = "".join(w[0] for w in name.split()[:2])
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='{colour}'/>"
           f"<text x='48' y='59' font-family='Arial' font-size='34' font-weight='700' fill='#fff' text-anchor='middle'>{initials}</text></svg>")
    return "data:image/svg+xml," + quote(svg, safe="")


def email(name: str) -> str:
    return re.sub(r"[^a-z.]", "", name.lower().replace(" ", ".")) + "@capabilityhub.ai"


USER_COLUMNS = list(base["users"][0])
users: list[dict[str, Any]] = []


def person(**values: Any) -> dict[str, Any]:
    row = {c: values.get(c) for c in USER_COLUMNS}
    users.append(row)
    return row


manager_queue = iter(MANAGERS)
managers: dict[str, list[str]] = {}
for practice, (colour, n) in PRACTICES.items():
    for _ in range(n):
        name = next(manager_queue)
        row = person(id=f"mgr_{101 + len(users)}", name=name, email=email(name), role="manager", avatar=picture(name, colour),
                     title=f"{practice} Practice Manager", department=practice)
        managers.setdefault(practice, []).append(row["id"])

rng = random.Random(20261124)
first_names, last_names = FIRST[:], LAST[:]
rng.shuffle(first_names)
rng.shuffle(last_names)
user_skills, evidences, plans = [], [], []
placed: dict[str, int] = {}


def evidence(user: str, manager: str, skill: str, item: tuple[str, str, str], status: str, days_ago: int) -> None:
    done = status == "approved"
    evidences.append({
        "id": f"ev_d{len(evidences) + 1:03d}", "userId": user, "skillId": skill_id[skill],
        "title": item[0].format(s=skill), "description": item[1], "evidenceText": item[2].format(s=skill),
        "documentUrl": None, "status": status, "submittedAt": f"@-{days_ago}dT10:00:00Z",
        "reviewedBy": manager if done else None,
        "reviewComment": COMMENTS[len(evidences) % len(COMMENTS)] if done else None,
        "reviewedAt": f"@-{max(1, days_ago - 3)}dT15:30:00Z" if done else None,
    })


for i, r in enumerate(roles):
    colour, _ = PRACTICES[r["practice"]]
    boss = managers[r["practice"]][placed.setdefault(r["practice"], 0) % len(managers[r["practice"]])]
    placed[r["practice"]] += 1
    options = TEAM[r["count"]]
    for k, level_name in enumerate(options[i % len(options)]):
        n = len(users) - len(MANAGERS)
        name = f"{first_names[n]} {last_names[n % len(last_names)]}"
        pattern, (low, high) = SENIORITY[level_name]
        held: dict[str, int] = {s: pattern[j] for j, s in enumerate(r["skills"])}
        # Nobody is a copy of the pattern: a weak spot for most, a strong one for some.
        weak = rng.choice(r["skills"][-2:] if level_name == "Senior" else r["skills"][2:])
        if level_name != "Lead" and rng.random() < 0.6:
            held[weak] = max(1, held[weak] - (2 if level_name == "Senior" else 1))
        if level_name in ("Mid", "Associate") and rng.random() < 0.5:
            strong = rng.choice(r["skills"][1:4])
            held[strong] = min(4, held[strong] + 1)
        for s in rng.sample(r["nice"], 2 if level_name in ("Lead", "Senior") else 1):
            held[s] = {"Lead": 4, "Senior": 3, "Mid": 2, "Associate": 1}[level_name]
        goal = r["title"]
        if level_name == "Lead" and NEXT_ROLE.get(r["practice"], goal) != goal:
            goal = NEXT_ROLE[r["practice"]]
        top = sorted((s for s in held if held[s] >= 3), key=lambda s: (-held[s], list(held).index(s)))[:5]
        years = round(rng.uniform(low, high) * 2) / 2
        row = person(
            id=f"E{2001 + n}", name=name, email=email(name), role="employee", avatar=picture(name, colour),
            title=PREFIX[level_name] + r["title"], department=r["practice"], targetRoleId=role_id[goal],
            experienceYears=years, domain=r["domains"][k % len(r["domains"])], primaryRole=r["title"],
            primarySkills=json.dumps(top, ensure_ascii=False), managerId=boss,
        )
        uid = row["id"]
        wanted = next(x["min"] for x in roles if x["title"] == goal)
        gaps = []
        for s, lv in held.items():
            target = max(wanted.get(s, 0), r["min"].get(s, 0)) or max(lv, 3)
            if lv < target:
                gaps.append(s)
            user_skills.append({
                "userId": uid, "skillId": skill_id[s], "currentLevel": lv, "targetLevel": target,
                "status": "validated" if lv >= 3 else "practicing", "lastUpdated": f"@-{rng.randint(5, 80)}d",
            })

        keen = rng.random() < 0.6            # does this person follow through on learning?
        item = r["ev"][k] if k < 2 else GENERIC[0]
        if keen or k == 0:
            evidence(uid, boss, r["skills"][0], item, "approved" if k < 2 else "pending", rng.randint(20, 90))
            extra = rng.randint(0, 2) if keen else 0
            for e in range(extra):
                evidence(uid, boss, r["skills"][1 + e], GENERIC[(i + k + e) % 3],
                         "approved" if rng.random() < 0.55 and held[r["skills"][1 + e]] >= 3 else "pending", rng.randint(2, 40))
        elif rng.random() < 0.4:
            evidence(uid, boss, r["skills"][0], GENERIC[(i + k) % 3], "pending", rng.randint(3, 20))

        study = [s for s in (gaps + r["nice"] + r["skills"]) if s in course_of]
        study = list(dict.fromkeys(study))[: rng.randint(3, 4) if keen else rng.randint(2, 3)]
        done = len(study) - rng.randint(0, 1) if keen else (1 if rng.random() < 0.25 else 0)
        for step, s in enumerate(study, start=1):
            status = "completed" if step <= done else "in_progress" if step == done + 1 and (keen or rng.random() < 0.5) else "pending"
            course = course_of[s]
            plans.append({
                "id": f"plan_d{len(plans) + 1:03d}", "userId": uid, "weekNumber": step, "title": f"Study: {s}",
                "skillFocus": s, "courseName": course["title"], "provider": course["provider"],
                "milestone": f"Finish the course and pass the {s} knowledge check", "assessment": f"{s} knowledge check",
                "targetScore": "60%", "status": status,
                "progressPercent": {"completed": 100, "in_progress": rng.choice([20, 40, 60]), "pending": 0}[status],
                "learningType": "in_depth", "estimatedDuration": "Self-paced", "phaseLabel": f"Skill {step} of {len(study)}",
                "targetDeadline": f"@+{rng.randint(20, 60)}d", "deadlineType": "learner_set",
                "quizScore": rng.choice([67, 80, 100]) if status == "completed" else 0,
                "timeSpentMins": {"completed": rng.randint(60, 150), "in_progress": rng.randint(15, 60), "pending": 0}[status],
                "completedAt": f"@-{rng.randint(3, 60)}d" if status == "completed" else None,
                "demandId": None, "purpose": "career_growth",
            })

# Every demo skill has someone who can do the work (level 3), so a job description for
# any of them finds a person.
best: dict[str, int] = {}
for s in user_skills:
    best[s["skillId"]] = max(best.get(s["skillId"], 0), s["currentLevel"])
for s in skills:
    if best.get(s["id"], 0) >= 3:
        continue
    held = [u for u in user_skills if u["skillId"] == s["id"]]
    if held:
        strongest = max(held, key=lambda u: u["currentLevel"])
        strongest.update(currentLevel=3, status="validated", targetLevel=max(3, strongest["targetLevel"]))
        continue
    home = next((r for r in roles if s["name"] in r["nice"] + r["skills"]), None)
    if not home:
        stop(f"no role uses {s['name']!r}")
    owner = next(u for u in users if u["primaryRole"] == home["title"])
    user_skills.append({"userId": owner["id"], "skillId": s["id"], "currentLevel": 3, "targetLevel": 3,
                        "status": "validated", "lastUpdated": "@-30d"})

# --------------------------------------------------------------------------- #
# Depth: a ladder of people for every opening
#
# An opening should rank several people with different fitment: someone ready, some who
# are nearly there, some who need training. The first people of each role are above and
# are never changed, so a database that has them only gets more. These are added where a
# rung is short, and each also knows part of a related role's work.
# --------------------------------------------------------------------------- #

depth = random.Random(20261125)
# Share of the required skills met, from and below, and how many people should be there.
LADDER = [(85, 101, 2), (65, 85, 2), (50, 65, 2), (40, 50, 1)]
RUNG = {
    85: (("Senior", "Lead"), [3, 4, 4, 5]), 65: (("Senior", "Mid"), [3, 3, 4, 4]),
    50: (("Mid", "Associate"), [3, 3, 4]), 40: (("Associate", "Mid"), [3]),
}
RELATED = {title: parts(text, ",") for title, text in (l.split(":") for l in lines(SOURCE / "related_roles.txt") if not l.startswith("#"))}
EXTRA = [
    ("Pilot using {s}", "The client agreed to a wider rollout", "Ran a four-week pilot with {s}, agreed the measures first and reported them honestly."),
    ("Support handover for {s}", "Fewer questions reach the project team", "Wrote the runbook for {s}, trained two colleagues and sat in on their first week."),
    ("Review of {s} work", "Mistakes are found before release", "Reviewed three colleagues' work on {s} with notes on what to change and why."),
    ("Small improvement with {s}", "A weekly task now takes minutes", "Automated part of a manual task using {s}; checked the result against the old way for a month."),
    ("Learning log: {s}", "Skills applied on a live project", "Kept notes while applying {s} on a live project, with problems met and how they were solved."),
    ("Estimate and plan for {s}", "Work finished close to the estimate", "Planned a change that used {s}, listed the risks and compared the plan with what happened."),
]
by_title = {r["title"]: r for r in roles}
for title, related in RELATED.items():
    wrong = [t for t in [title, *related] if t not in by_title]
    if wrong:
        stop(f"related_roles.txt: unknown roles {wrong}")
missing = [t for t in by_title if t not in RELATED]
if missing:
    stop(f"related_roles.txt: no related roles for {missing}")

# What everyone holds so far, as matching sees it.
skill_name = {i: n for n, i in skill_id.items()}
holds: dict[str, dict[str, int]] = {}
for s in [*base["user_skills"], *user_skills]:
    holds.setdefault(s["userId"], {})[skill_name[s["skillId"]]] = s["currentLevel"]
staff = [u for u in [*base["users"], *users] if u["role"] == "employee"]


def names_it(skill: str, text: str | None) -> bool:
    return bool(text) and re.search(rf"(?<![a-z0-9+#]){re.escape(skill.lower())}(?![a-z0-9+#])", text.lower()) is not None


def share(u: dict[str, Any], required: list[str]) -> float:
    """Share of the required skills this person meets, in percent."""
    known = json.loads(u["primarySkills"] or "[]")
    met = sum(
        1 for s in required
        if holds.get(u["id"], {}).get(s, 0) >= 3 or s in known or names_it(s, u["title"]) or names_it(s, u["primaryRole"])
    )
    return met / len(required) * 100


def on_rung(required: list[str], low: int, high: int) -> int:
    return sum(1 for u in staff if low <= share(u, required) < high)


def relevant(r: dict[str, Any]) -> int:
    return on_rung(r["skills"], 40, 101)


spare_first = first_names[169:] + [n for n in FIRST_MORE]
newcomers: list[dict[str, Any]] = []
used_names = {u["name"].lower() for u in [*base["users"], *users]}
DOMAINS = sorted({d for r in roles for d in r["domains"]})


def newcomer(r: dict[str, Any], low: int, high: int) -> bool:
    """Add one person who meets between `low` and `high` percent of a role's skills."""
    need = r["skills"]
    fits = [m for m in range(1, len(need) + 1) if low <= m / len(need) * 100 < high]
    if not fits:
        return False
    n = len(newcomers)
    levels_of, chosen = RUNG[low]
    seniority = chosen[n % len(chosen)] if isinstance(chosen[0], str) else levels_of[n % len(levels_of)]
    strength = RUNG[low][1]
    title = PREFIX[seniority] + r["title"]
    named = [s for s in need if names_it(s, title)]
    others = [s for s in need if s not in named]
    count = max(depth.choice(fits), len(named))
    # The first skills of a role matter most, so they are the ones people have first.
    weights = {s: depth.random() * (1.6 if k < 2 else 1.0) for k, s in enumerate(others)}
    met = named + sorted(others, key=lambda s: -weights[s])[: count - len(named)]
    held = {s: depth.choice(strength) for s in need if s in met}
    for s in need:
        if s not in held and depth.random() < 0.6:
            held[s] = depth.choice([1, 2, 2])
    for s in depth.sample(r["nice"], min(len(r["nice"]), depth.randint(0, 2))):
        held.setdefault(s, depth.choice([1, 2, 3]))
    if low >= 50 and r["title"] in RELATED:
        # Part of a neighbouring role's work, where that role has the fewest people.
        near = min((by_title[t] for t in RELATED[r["title"]]), key=relevant)
        have = [s for s in near["skills"] if held.get(s, 0) >= 3]
        for s in [s for s in near["skills"] if held.get(s, 0) < 3][: max(0, -(-len(near["skills"]) * 45 // 100) - len(have))]:
            if s not in need:
                held[s] = 3

    first = spare_first[n % len(spare_first)]
    surname = next(x for k in range(len(LAST)) for x in [last_names[(n * 7 + k) % len(last_names)]]
                   if f"{first} {x}".lower() not in used_names)
    name = f"{first} {surname}"
    used_names.add(name.lower())
    domains = list(dict.fromkeys([*r["domains"], *([r["demand"][3]] if "demand" in r else [])]))
    domain = domains[n % len(domains)] if depth.random() < 0.6 else depth.choice(DOMAINS)
    low_years, high_years = SENIORITY[seniority][1]
    top = sorted((s for s in held if held[s] >= 3), key=lambda s: (-held[s], list(held).index(s)))[:5]
    row = {c: None for c in USER_COLUMNS} | {
        "id": f"E{2170 + n}", "name": name, "email": email(name), "role": "employee",
        "avatar": picture(name, PRACTICES[r["practice"]][0]), "title": title, "department": r["practice"],
        "targetRoleId": r["id"], "experienceYears": round(depth.uniform(low_years, high_years) * 2) / 2,
        "domain": domain, "primaryRole": r["title"], "primarySkills": json.dumps(top, ensure_ascii=False),
    }
    newcomers.append(row)
    staff.append(row)
    holds[row["id"]] = held
    return True


for low, high, wanted in LADDER:
    for r in roles:
        while on_rung(r["skills"], low, high) < wanted and newcomer(r, low, high):
            pass
# An opening of the base data that only three people came close to. Its first place stays
# with the people it had.
bridge = next(d for d in base["project_demands"] if d["id"] == "OPP-1015")
full_stack = {
    "title": "Full Stack AI Engineer", "practice": "AI & Machine Learning", "domains": ["Retail", "SaaS"], "id": "role_1",
    "skills": json.loads(bridge["requiredSkills"]), "nice": ["Docker", "AWS", "GraphQL"],
    "min": {s: 4 if k < 3 else 3 for k, s in enumerate(json.loads(bridge["requiredSkills"]))},
}
for low, high in ((50, 65), (50, 65), (50, 65), (40, 51)):
    newcomer(full_stack, low, high)

# Managers for the newcomers, about a dozen people each, no first name twice in a team.
teams: dict[str, list[list[dict[str, Any]]]] = {}
for u in newcomers:
    squads = teams.setdefault(u["department"], [])
    first = u["name"].split()[0]
    squad = next((q for q in squads if len(q) < 12 and first not in {x["name"].split()[0] for x in q}), None)
    if squad is None:
        squads.append(squad := [])
    squad.append(u)
more_managers = iter(MANAGERS_MORE)
new_managers = []
for practice in PRACTICES:
    for squad in teams.get(practice, []):
        name = next(more_managers)
        if name.lower() in used_names:
            stop(f"manager name {name!r} is taken")
        used_names.add(name.lower())
        row = {c: None for c in USER_COLUMNS} | {
            "id": f"mgr_{115 + len(new_managers)}", "name": name, "email": email(name), "role": "manager",
            "avatar": picture(name, PRACTICES[practice][0]), "title": f"{practice} Delivery Manager", "department": practice,
        }
        new_managers.append(row)
        for u in squad:
            u["managerId"] = row["id"]
users += new_managers + newcomers

role_of = {r["title"]: r for r in roles} | {full_stack["title"]: full_stack}
def records(begin: int) -> None:
    """Skill levels, proof and learning steps for the newcomers from `begin` on."""
    for n, u in enumerate(newcomers):
        if n < begin:
            continue
        r, held = role_of[u["primaryRole"]], holds[u["id"]]
        gaps = []
        for s, lv in held.items():
            target = r["min"].get(s) or max(lv, 3)
            if lv < target:
                gaps.append(s)
            user_skills.append({
                "userId": u["id"], "skillId": skill_id[s], "currentLevel": lv, "targetLevel": target,
                "status": "validated" if lv >= 3 else "practicing", "lastUpdated": f"@-{depth.randint(5, 80)}d",
            })
        for s in r["skills"]:                        # a required skill not started yet is a gap too
            if s not in held:
                gaps.append(s)
                user_skills.append({
                    "userId": u["id"], "skillId": skill_id[s], "currentLevel": 1, "targetLevel": r["min"][s],
                    "status": "practicing", "lastUpdated": f"@-{depth.randint(5, 80)}d",
                })
        able = [s for s in held if held[s] >= 3] or list(held)
        for e in range(depth.choice([0, 1, 1, 2, 2, 3])):
            s = able[e % len(able)]
            evidence(u["id"], u["managerId"], s, EXTRA[(n + e) % len(EXTRA)],
                     "approved" if depth.random() < 0.6 and held[s] >= 3 else "pending", depth.randint(2, 90))
        keen = depth.random() < 0.6
        study = list(dict.fromkeys(s for s in gaps + r["nice"] if s in course_of))[: depth.randint(2, 4)]
        done = len(study) - depth.randint(0, 1) if keen else (1 if depth.random() < 0.25 else 0)
        for step, s in enumerate(study, start=1):
            status = "completed" if step <= done else "in_progress" if step == done + 1 and (keen or depth.random() < 0.5) else "pending"
            course = course_of[s]
            plans.append({
                "id": f"plan_d{len(plans) + 1:03d}", "userId": u["id"], "weekNumber": step, "title": f"Study: {s}",
                "skillFocus": s, "courseName": course["title"], "provider": course["provider"],
                "milestone": f"Finish the course and pass the {s} knowledge check", "assessment": f"{s} knowledge check",
                "targetScore": "60%", "status": status,
                "progressPercent": {"completed": 100, "in_progress": depth.choice([20, 40, 60]), "pending": 0}[status],
                "learningType": "in_depth", "estimatedDuration": "Self-paced", "phaseLabel": f"Skill {step} of {len(study)}",
                "targetDeadline": f"@+{depth.randint(20, 60)}d", "deadlineType": "learner_set",
                "quizScore": depth.choice([67, 80, 100]) if status == "completed" else 0,
                "timeSpentMins": {"completed": depth.randint(60, 150), "in_progress": depth.randint(15, 60), "pending": 0}[status],
                "completedAt": f"@-{depth.randint(3, 60)}d" if status == "completed" else None,
                "demandId": None, "purpose": "career_growth",
            })


records(0)

# Two people with the same fitment say less than two with different ones. Where newcomers
# tie near the top of a role's ranking, one of their pieces of proof is approved, or still
# waiting, so the places differ. The sum is the one in services/talent.py.
new_ids = {u["id"] for u in newcomers}
proof: dict[str, list[dict[str, Any]]] = {}
for e in evidences:
    proof.setdefault(e["userId"], []).append(e)
for e in base["evidences"]:
    proof.setdefault(e["userId"], []).append(dict(e))


def half_up(x: float) -> int:
    return int(x + 0.5)


def fitment(u: dict[str, Any], r: dict[str, Any]) -> int:
    d = r.get("demand")
    domain_wanted, low, high = (d[3], int(d[5]), int(d[6])) if d else (r["domains"][0], 3, 7)
    mine, theirs, dept = (u["domain"] or u["department"]).lower(), domain_wanted.lower(), u["department"].lower()
    domain = 95 if theirs in mine or mine in theirs else 90 if theirs in dept or dept in theirs else 75
    years = u["experienceYears"]
    experience = 60 if years is None or years < low else 100 if years <= high else 85
    levels = [s["currentLevel"] for s in level_rows.get(u["id"], [])]
    approved = sum(e["status"] == "approved" for e in proof.get(u["id"], []))
    average = sum(levels) / (len(levels) * 5) * 100 if levels else 0
    readiness = min(100, half_up(average * 0.8 + min(20, approved * 10)))
    return min(99, half_up(half_up(share(u, r["skills"])) * 0.45 + domain * 0.2 + experience * 0.15 + readiness * 0.2))


level_rows: dict[str, list[dict[str, Any]]] = {}
for s in [*base["user_skills"], *user_skills]:
    level_rows.setdefault(s["userId"], []).append(s)


def set_proof(u: dict[str, Any], approve: bool) -> bool:
    """Approve one waiting piece of a newcomer's proof, or put one back in the queue."""
    for e in proof.get(u["id"], []):
        skilled = holds[u["id"]].get(skill_name[e["skillId"]], 0) >= 3
        if approve and e["status"] == "pending" and skilled:
            e.update(status="approved", reviewedBy=u["managerId"], reviewComment=COMMENTS[len(e["id"]) % len(COMMENTS)],
                     reviewedAt="@-1dT15:30:00Z")
            return True
        if not approve and e["status"] == "approved":
            e.update(status="pending", reviewedBy=None, reviewComment=None, reviewedAt=None)
            return True
    return False


for r in roles:
    for _ in range(12):
        ranking = sorted(((fitment(u, r), u) for u in staff if share(u, r["skills"]) >= 40), key=lambda x: -x[0])[:8]
        taken_places = [f for f, _ in ranking]
        tied = [(f, u) for f, u in ranking if taken_places.count(f) > 1 and u["id"] in new_ids]
        moved_one = False
        for f, u in tied:
            approved = sum(e["status"] == "approved" for e in proof.get(u["id"], []))
            for approve in (True, False):
                if approve and approved >= 2:
                    continue
                if set_proof(u, approve):
                    if fitment(u, r) not in taken_places:
                        moved_one = True
                        break
                    set_proof(u, not approve)
            if moved_one:
                break
        if not moved_one:
            break

# The right kind of people. Where someone from an unrelated role is among the best five of
# an opening - met by its general skills, like Git or REST - two more of the role's own
# people are added, so the best places are people whose job it is.
depth = random.Random(20261126)
settled = len(newcomers)
for r in roles:
    kin = {r["title"], *RELATED[r["title"]], *(t for t, near in RELATED.items() if r["title"] in near)}
    best_five = sorted(((fitment(u, r), u["id"], u) for u in staff if share(u, r["skills"]) >= 40), key=lambda x: (-x[0], x[1]))[:5]
    if any(u["id"].startswith("E2") and u["primaryRole"] not in kin and u["department"] != r["practice"] for _, _, u in best_five):
        newcomer(r, 65, 85)
        newcomer(r, 50, 65)
for u in newcomers[settled:]:
    first = u["name"].split()[0]
    squad = next((q for q in teams[u["department"]] if len(q) < 14 and first not in {x["name"].split()[0] for x in q}), None)
    if squad is None:
        stop(f"no team has room for {u['name']} in {u['department']}")
    u["managerId"] = squad[0]["managerId"]
    squad.append(u)
users += newcomers[settled:]
records(settled)

# General skills count half in a match (services/matching.py), so the rungs are checked once
# more by that measure, and filled where one is empty.
depth = random.Random(20261127)
settled = len(newcomers)
GENERAL = set(ast.literal_eval(re.search(
    r"GENERAL_SKILLS = frozenset\((\{.*?\})\)", (ROOT / "backend/app/services/matching.py").read_text(encoding="utf-8"), re.S).group(1)))


def weighted(u: dict[str, Any], r: dict[str, Any]) -> float:
    title = r["demand"][0] if "demand" in r else r["title"]
    weights = {s: 0.5 if s in GENERAL and not names_it(s, title) else 1.0 for s in r["skills"]}
    return sum(w for s, w in weights.items() if share(u, [s])) / sum(weights.values()) * 100


def places(r: dict[str, Any]) -> list[int]:
    """The fitment of everyone who meets two in five of the role's skills, by weight."""
    result = []
    for u in staff:
        w = half_up(weighted(u, r))
        if w >= 40:
            result.append(half_up(fitment(u, r) + (w - half_up(share(u, r["skills"]))) * 0.45))
    return result


for r in roles:
    for _ in range(6):
        now = places(r)
        if not any(p <= 62 for p in now):
            done = newcomer(r, 40, 50) or newcomer(r, 50, 65)
        elif not any(66 <= p <= 78 for p in now):
            done = newcomer(r, 65, 85)
        elif len(now) < 8:
            done = newcomer(r, 50, 65)
        else:
            break
        if not done:
            break
for u in newcomers[settled:]:
    first = u["name"].split()[0]
    squad = next((q for q in teams[u["department"]] if len(q) < 16 and first not in {x["name"].split()[0] for x in q}), None)
    if squad is None:
        stop(f"no team has room for {u['name']} in {u['department']}")
    u["managerId"] = squad[0]["managerId"]
    squad.append(u)
users += newcomers[settled:]
for u in newcomers[settled:]:
    proof.setdefault(u["id"], [])
records(settled)

# --------------------------------------------------------------------------- #
# Job descriptions and demands
# --------------------------------------------------------------------------- #


def job_description(r: dict[str, Any]) -> str:
    d = r.get("demand")
    if d:
        project, client, unit, domain, place, low, high, people, *_ = d
        intro = (f"Job title: {r['title']}\nProject: {project}\nClient: {client}\nBusiness unit: {unit}\nDomain: {domain}\n"
                 f"Location: {place}\nExperience: {low}-{high} years\nOpenings: {people}")
        about = f"{r['about']} You will work on {project} for {client}."
    else:
        intro = (f"Job title: {r['title']}\nDomain: {r['domains'][0]}\nLocation: Hybrid\nExperience: 3-7 years\nOpenings: 1")
        about = r["about"]
    bullets = lambda items: "\n".join(f"- {x}" for x in items)
    return (f"{intro}\n\nAbout the role\n{about}\n\nWhat you will do\n{bullets(r['do'])}\n\n"
            f"Must have\n{bullets(r['skills'])}\n\nGood to have\n{bullets(r['nice'])}\n\n"
            "How we interview\nA technical discussion, then a short practical task.\n")


demands = []
DEMAND_COLUMNS = list(base["project_demands"][0])
urgency = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
open_roles = sorted((r for r in roles if "demand" in r), key=lambda r: (urgency[r["demand"][8]], int(r["demand"][9])))
for i, r in enumerate(open_roles):
    project, client, unit, domain, place, low, high, people, priority, days = r["demand"]
    values = {
        "id": f"OPP-{2001 + i}", "projectName": project, "customerName": client, "businessUnit": unit,
        "projectDescription": f"{r['about']} {project} for {client}.", "rawJobDescription": job_description(r),
        "requiredSkills": json.dumps(r["skills"], ensure_ascii=False),
        "preferredSkills": json.dumps(r["nice"], ensure_ascii=False),
        "experienceRangeMin": int(low), "experienceRangeMax": int(high),
        "technologyStack": json.dumps(r["skills"], ensure_ascii=False), "resourcesRequired": int(people),
        "clientInterviewDate": f"@+{days}dT10:00:00Z", "expectedJoiningDate": f"@+{int(days) + 30}dT09:00:00Z",
        "projectPriority": priority, "location": place, "domain": domain, "employmentType": "Full-Time",
        "additionalNotes": None, "status": "OPEN", "createdAt": f"@-{i + 41}dT09:00:00Z",
    }
    demands.append({c: values[c] for c in DEMAND_COLUMNS})

# --------------------------------------------------------------------------- #
# Checks and output
# --------------------------------------------------------------------------- #

everyone = [*base["users"], *users]
for what, values in (("id", [u["id"] for u in everyone]), ("e-mail", [u["email"].lower() for u in everyone]),
                     ("name", [u["name"].lower() for u in everyone])):
    twice = {v for v in values if values.count(v) > 1}
    if twice:
        stop(f"{what} used twice: {twice}")

out = {
    "users": users, "skills": skills, "target_roles": target_roles, "target_role_skills": target_role_skills,
    "user_skills": user_skills, "courses": courses, "evidences": evidences, "learning_plans": plans,
    "project_demands": demands,
}
dump = lambda value: json.dumps(value, ensure_ascii=False, indent=1) + "\n"
(SEED / "demo_seed.json").write_text(dump(out), encoding="utf-8", newline="\n")
(SEED / "skill_aliases.json").write_text(dump(aliases), encoding="utf-8", newline="\n")
bank = json.loads((SEED / "question_bank.json").read_text(encoding="utf-8"))
bank = {k: v for k, v in bank.items() if k in BASE_SKILLS} | quiz
(SEED / "question_bank.json").write_text(
    "{\n" + ",\n".join(
        f"  {json.dumps(k, ensure_ascii=False)}: [\n" + ",\n".join("    " + json.dumps(q, ensure_ascii=False) for q in v) + "\n  ]"
        for k, v in bank.items()
    ) + "\n}\n", encoding="utf-8", newline="\n")
shutil.rmtree(JD_DIR, ignore_errors=True)
JD_DIR.mkdir(parents=True)
for r in roles:
    slug = re.sub(r"[^a-z0-9]+", "-", r["title"].lower()).strip("-")
    (JD_DIR / f"{slug}.txt").write_text(job_description(r), encoding="utf-8", newline="\n")

print(f"{len(roles)} roles, {sum(u['role'] == 'employee' for u in users)} employees, {sum(u['role'] == 'manager' for u in users)} managers, {len(skills)} skills, "
      f"{len(user_skills)} skill levels, {len(demands)} demands, {len(courses)} courses, {len(evidences)} evidence, "
      f"{len(plans)} learning steps, {sum(map(len, quiz.values()))} questions, {sum(sum(map(len, a.values())) for a in aliases.values())} other names")
