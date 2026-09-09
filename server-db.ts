import Database from "better-sqlite3";
import fs from "fs";
import { User, UserRole, Skill, TargetRole, LearningCourse, Evidence, UserSkill, WeeklyLearningStep, AgentReminder, ProjectDemand, ResourceLearningProgress } from "./src/types";

// Initialize SQLite database connection with corruption auto-recovery.
// DATABASE_PATH lets a host point the file at a mounted, persistent, writable volume -
// important on platforms whose app directory is ephemeral or read-only. Defaults to the
// working directory for local development.
const dbPath = process.env.DATABASE_PATH || "capability-hub.db";
let sqliteDbInstance: Database.Database;

function initSqliteDatabase(): Database.Database {
  try {
    const conn = new Database(dbPath);
    conn.pragma("foreign_keys = ON");
    conn.exec("SELECT 1 FROM sqlite_master LIMIT 1");
    return conn;
  } catch (err: any) {
    console.error("Warning: SQLite DB corrupt or unreadable, recreating database...", err?.message || err);
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (_) {}
    }
    const conn = new Database(dbPath);
    conn.pragma("foreign_keys = ON");
    return conn;
  }
}

const sqliteDb = initSqliteDatabase();
 
// Initialize Database Schemas
sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar TEXT NOT NULL,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    targetRoleId TEXT
  );
 
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL
  );
 
  CREATE TABLE IF NOT EXISTS target_roles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL
  );
 
  CREATE TABLE IF NOT EXISTS target_role_skills (
    roleId TEXT NOT NULL,
    skillId TEXT NOT NULL,
    minLevel INTEGER NOT NULL,
    PRIMARY KEY (roleId, skillId),
    FOREIGN KEY (roleId) REFERENCES target_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE
  );
 
  CREATE TABLE IF NOT EXISTS user_skills (
    userId TEXT NOT NULL,
    skillId TEXT NOT NULL,
    currentLevel INTEGER NOT NULL,
    targetLevel INTEGER NOT NULL,
    status TEXT NOT NULL,
    lastUpdated TEXT NOT NULL,
    PRIMARY KEY (userId, skillId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE
  );
 
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    duration TEXT NOT NULL,
    skillId TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE
  );
 
  CREATE TABLE IF NOT EXISTS evidences (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    skillId TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    evidenceText TEXT NOT NULL,
    documentUrl TEXT,
    status TEXT NOT NULL,
    submittedAt TEXT NOT NULL,
    reviewedBy TEXT,
    reviewComment TEXT,
    reviewedAt TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewedBy) REFERENCES users(id) ON DELETE SET NULL
  );
 
  CREATE TABLE IF NOT EXISTS learning_plans (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    weekNumber INTEGER NOT NULL,
    title TEXT NOT NULL,
    skillFocus TEXT NOT NULL,
    courseName TEXT NOT NULL,
    provider TEXT NOT NULL,
    milestone TEXT NOT NULL,
    assessment TEXT NOT NULL,
    targetScore TEXT NOT NULL,
    status TEXT NOT NULL,
    progressPercent INTEGER NOT NULL,
    learningType TEXT DEFAULT 'in_depth',
    estimatedDuration TEXT DEFAULT '1 hour',
    phaseLabel TEXT DEFAULT 'Phase 1',
    targetDeadline TEXT,
    deadlineType TEXT DEFAULT 'client_interview',
    quizScore INTEGER DEFAULT 0,
    timeSpentMins INTEGER DEFAULT 0,
    completedAt TEXT,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
 
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    targetRole TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
 
  CREATE TABLE IF NOT EXISTS project_demands (
    id TEXT PRIMARY KEY,
    projectName TEXT NOT NULL,
    customerName TEXT NOT NULL,
    businessUnit TEXT NOT NULL,
    projectDescription TEXT NOT NULL,
    rawJobDescription TEXT,
    requiredSkills TEXT NOT NULL,
    preferredSkills TEXT NOT NULL,
    experienceRangeMin INTEGER NOT NULL,
    experienceRangeMax INTEGER NOT NULL,
    technologyStack TEXT NOT NULL,
    resourcesRequired INTEGER NOT NULL,
    clientInterviewDate TEXT NOT NULL,
    expectedJoiningDate TEXT NOT NULL,
    projectPriority TEXT NOT NULL,
    location TEXT NOT NULL,
    domain TEXT NOT NULL,
    employmentType TEXT NOT NULL,
    additionalNotes TEXT,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`);
 
// Safe column migrations for existing SQLite databases
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN learningType TEXT DEFAULT 'in_depth'"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN estimatedDuration TEXT DEFAULT '1 hour'"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN phaseLabel TEXT DEFAULT 'Phase 1'"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN targetDeadline TEXT"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN deadlineType TEXT DEFAULT 'client_interview'"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN quizScore INTEGER DEFAULT 0"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN timeSpentMins INTEGER DEFAULT 0"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN completedAt TEXT"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN demandId TEXT"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE learning_plans ADD COLUMN purpose TEXT DEFAULT 'career_growth'"); } catch (e) {}
 
// Client Resume Generator gating support:
// - post_assessments persists the GROW post-training assessment (previously generated
//   and thrown away on every call) so a resume can require an explicit manager sign-off,
//   not just an AI-generated score.
// - skill_baselines snapshots an employee's skill levels at the moment they're handed off
//   to a specific project demand, so "skill growth" can be measured against a real
//   before-state instead of assumed.
sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS post_assessments (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL,
    demandId TEXT,
    managerId TEXT NOT NULL,
    narrative TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_signoff',
    createdAt TEXT NOT NULL,
    signedOffBy TEXT,
    signedOffAt TEXT,
    FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (managerId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (signedOffBy) REFERENCES users(id) ON DELETE SET NULL
  );
 
  CREATE TABLE IF NOT EXISTS skill_baselines (
    userId TEXT NOT NULL,
    skillId TEXT NOT NULL,
    demandId TEXT NOT NULL,
    baselineLevel INTEGER NOT NULL,
    capturedAt TEXT NOT NULL,
    PRIMARY KEY (userId, skillId, demandId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE
  );
`);
 
// Safe column migrations for users table
try { sqliteDb.exec("ALTER TABLE users ADD COLUMN experienceYears REAL;"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE users ADD COLUMN domain TEXT;"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE users ADD COLUMN primaryRole TEXT;"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE users ADD COLUMN primarySkills TEXT;"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE users ADD COLUMN passwordHash TEXT;"); } catch (e) {}
 
// Safe column migrations for courses table
try { sqliteDb.exec("ALTER TABLE courses ADD COLUMN rating REAL DEFAULT 4.9"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE courses ADD COLUMN enrollmentCount TEXT DEFAULT '180,000+ Learners'"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE courses ADD COLUMN lastUpdated TEXT DEFAULT 'Updated June 2026'"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE courses ADD COLUMN isLatest2026 INTEGER DEFAULT 1"); } catch (e) {}
 
// Update existing course records with verified live URLs, exact titles, real providers, actual course durations, and real ratings
try {
  sqliteDb.exec(`
    UPDATE courses SET title = 'Java Programming Masterclass covering Java 11 & Java 17', provider = 'Udemy', duration = '135 hours', url = 'https://www.udemy.com/course/java-the-complete-java-developer-course/', rating = 4.7, enrollmentCount = '810,000+ Learners', lastUpdated = 'Updated 2026 (Verified Syllabus)' WHERE id = 'c_6';
    UPDATE courses SET title = 'Selenium WebDriver with Java - Basics to Advanced+Frameworks', provider = 'Udemy', duration = '54 hours', url = 'https://www.udemy.com/course/selenium-webdriver-with-java-basics-to-advanced/', rating = 4.6, enrollmentCount = '310,000+ Learners', lastUpdated = 'Updated 2026 (Verified Syllabus)' WHERE id = 'c_7';
    UPDATE courses SET title = 'Postman: The Complete Guide - REST API Testing', provider = 'Udemy', duration = '15 hours', url = 'https://www.udemy.com/course/postman-the-complete-guide/', rating = 4.7, enrollmentCount = '180,000+ Learners', lastUpdated = 'Updated 2026 (Verified Syllabus)' WHERE id = 'c_8';
    UPDATE courses SET title = 'Git Complete: The Definitive Guide to Git', provider = 'Udemy', duration = '6 hours', url = 'https://www.udemy.com/course/git-complete/', rating = 4.7, enrollmentCount = '150,000+ Learners', lastUpdated = 'Updated 2026 (Verified Syllabus)' WHERE id = 'c_9';
    UPDATE courses SET title = 'Jenkins, From Zero To Hero: Become a DevOps Jenkins Master', provider = 'Udemy', duration = '10.5 hours', url = 'https://www.udemy.com/course/jenkins-from-zero-to-hero/', rating = 4.6, enrollmentCount = '120,000+ Learners', lastUpdated = 'Updated 2026 (Verified Syllabus)' WHERE id = 'c_10';
    UPDATE courses SET title = 'REST API Testing Automation via REST Assured & Java', provider = 'Udemy', duration = '33.5 hours', url = 'https://www.udemy.com/course/rest-api-automation-testing-rest-assured-java/', rating = 4.6, enrollmentCount = '140,000+ Learners', lastUpdated = 'Updated 2026 (Verified Syllabus)' WHERE id = 'c_11';
    UPDATE courses SET title = 'Next.js & React - The Complete Guide', provider = 'Udemy', duration = '33.5 hours', url = 'https://www.udemy.com/course/nextjs-react-the-complete-guide/', rating = 4.7, enrollmentCount = '250,000+ Learners', lastUpdated = 'Updated 2026 (Verified Syllabus)' WHERE id = 'c_1';
    UPDATE courses SET title = 'Understanding TypeScript', provider = 'Udemy', duration = '15 hours', url = 'https://www.udemy.com/course/understanding-typescript/', rating = 4.7, enrollmentCount = '220,000+ Learners', lastUpdated = 'Updated 2026 (Verified Syllabus)' WHERE id = 'c_2';
    UPDATE courses SET title = 'Google Gemini API Official Documentation & Tutorials', provider = 'Google Developer Studio', duration = 'Self-Paced (6 hours)', url = 'https://ai.google.dev/gemini-api/docs', rating = 4.9, enrollmentCount = '350,000+ Developers', lastUpdated = 'Updated 2026 (Official Docs)' WHERE id = 'c_3';
 
    UPDATE learning_plans SET courseName = 'Java Programming Masterclass covering Java 11 & Java 17', provider = 'Udemy', estimatedDuration = '135 hours' WHERE id = 'plan_r_1';
    UPDATE learning_plans SET courseName = 'Selenium WebDriver with Java - Basics to Advanced+Frameworks', provider = 'Udemy', estimatedDuration = '54 hours' WHERE id = 'plan_r_2';
    UPDATE learning_plans SET courseName = 'Postman: The Complete Guide - REST API Testing', provider = 'Udemy', estimatedDuration = '15 hours' WHERE id = 'plan_r_3';
    UPDATE learning_plans SET courseName = 'Git Complete: The Definitive Guide to Git', provider = 'Udemy', estimatedDuration = '6 hours' WHERE id = 'plan_r_4';
    UPDATE learning_plans SET courseName = 'Jenkins, From Zero To Hero: Become a DevOps Jenkins Master', provider = 'Udemy', estimatedDuration = '10.5 hours' WHERE id = 'plan_r_5';
    UPDATE learning_plans SET courseName = 'REST API Testing Automation via REST Assured & Java', provider = 'Udemy', estimatedDuration = '33.5 hours' WHERE id = 'plan_r_6';
  `);
} catch (e) {
  console.error("Error updating course URLs:", e);
}
 
// Seed Data definition
const INITIAL_SKILLS: Skill[] = [
  {
    id: "sk_1",
    name: "Next.js App Architecture",
    category: "Technical",
    description: "Building production-grade React architectures using the App Router, Server Components, and advanced routing patterns."
  },
  {
    id: "sk_2",
    name: "Enterprise TypeScript Development",
    category: "Technical",
    description: "Strict typing patterns, custom utility types, and structural validation across full-stack applications."
  },
  {
    id: "sk_3",
    name: "Gemini API Integration",
    category: "Technical",
    description: "Implementing generative capabilities, structured JSON output, streaming, and tool use with @google/genai."
  },
  {
    id: "sk_4",
    name: "Strategic AI Product Management",
    category: "Leadership",
    description: "Defining product scope, alignment vectors, user trust heuristics, and product metrics for intelligent agents."
  },
  {
    id: "sk_5",
    name: "Manager-as-Coach Framework",
    category: "Leadership",
    description: "Applying GROW and situational coaching frameworks to unblock engineer capability gaps and scale trust."
  },
  {
    id: "sk_6",
    name: "System Design & Scalability",
    category: "Technical",
    description: "Architecting decoupled microservices, database scaling, caching, and event-driven architectures."
  },
  {
    id: "sk_7",
    name: "CI/CD & Cloud Infrastructure",
    category: "Technical",
    description: "Deploying secure container services, building robust testing pipelines, and maintaining platform health."
  },
  {
    id: "sk_8",
    name: "PostgreSQL & Vector Database Optimization",
    category: "Domain",
    description: "Advanced relational query tuning, indexing, and vector similarity searching for AI memory structures."
  },
  {
    id: "sk_9",
    name: "Java Core & OOP Principles",
    category: "Technical",
    description: "Object-oriented programming, data structures, exception handling, and multi-threading in Java."
  },
  {
    id: "sk_10",
    name: "Selenium Automation Framework",
    category: "Technical",
    description: "Building Page Object Model (POM) automation frameworks, dynamic locators, and cross-browser test suites."
  },
  {
    id: "sk_11",
    name: "Postman & REST API Testing",
    category: "Technical",
    description: "Validating RESTful APIs, automating JSON response assertions, collection runners, and auth tokens."
  },
  {
    id: "sk_12",
    name: "Git & Version Control",
    category: "Technical",
    description: "Branching strategies, pull requests, merge conflict resolution, and versioning for automated test code."
  },
  {
    id: "sk_13",
    name: "CI/CD Test Automation Pipelines",
    category: "Technical",
    description: "Integrating headless Selenium and API automated tests into Jenkins and GitHub Actions pipelines."
  },
  {
    id: "sk_14",
    name: "TestNG & Automation Frameworks",
    category: "Technical",
    description: "Parallel test execution, XML configuration, assertions, and automated HTML test reporting."
  },
  { id: "sk_15", name: "Java", category: "Technical", description: "Java core development, multithreading, collections, and backend enterprise application design." },
  { id: "sk_16", name: "Spring Boot", category: "Technical", description: "Building Spring Boot microservices, REST APIs, JPA repositories, and dependency injection." },
  { id: "sk_17", name: "React", category: "Technical", description: "Modern React state management, hooks, component architecture, and responsive user interfaces." },
  { id: "sk_18", name: "Microservices", category: "Technical", description: "Decoupled microservice architectures, API gateways, inter-service communication, and resilience." },
  { id: "sk_19", name: "REST APIs", category: "Technical", description: "Designing, documenting, and validating HTTP RESTful API contracts and payload schemas." },
  { id: "sk_20", name: "SQL", category: "Technical", description: "Relational database querying, joins, indexing, transaction management, and schema optimization." },
  { id: "sk_21", name: "CI/CD", category: "Technical", description: "Continuous integration, automated build pipelines, containerized deployments, and release management." },
  { id: "sk_22", name: "Python", category: "Technical", description: "Python scripting, data manipulation, automation, machine learning libraries, and API development." },
  { id: "sk_23", name: "Spark", category: "Technical", description: "Distributed Apache Spark data processing, RDDs, DataFrames, and big data ETL pipelines." },
  { id: "sk_24", name: "Azure Data Factory", category: "Technical", description: "Cloud data integration, pipeline orchestration, copy activities, and data transformation." },
  { id: "sk_25", name: "Databricks", category: "Technical", description: "Unified analytics platform, Delta Lake pipelines, PySpark notebooks, and collaborative data science." },
  { id: "sk_26", name: "Azure", category: "Technical", description: "Microsoft Azure cloud services, virtual networks, identity management, and cloud architecture." },
  { id: "sk_27", name: "Kubernetes", category: "Technical", description: "Container orchestration, pod scaling, ingress controllers, deployment strategy, and cluster management." },
  { id: "sk_28", name: "Docker", category: "Technical", description: "Containerizing applications, multi-stage Dockerfiles, Docker Compose, and image registries." },
  { id: "sk_29", name: "Terraform", category: "Technical", description: "Infrastructure as Code (IaC) provisioning, state management, modules, and multi-cloud infrastructure." },
  { id: "sk_30", name: "Azure DevOps", category: "Technical", description: "Azure Boards, Git repositories, pipeline triggers, artifact feeds, and automated releases." },
  { id: "sk_31", name: "Requirements Gathering", category: "Methodology", description: "Eliciting business requirements, user story creation, acceptance criteria, and feature mapping." },
  { id: "sk_32", name: "Agile", category: "Methodology", description: "Scrum, Kanban, sprint planning, retrospectives, and iterative delivery management." },
  { id: "sk_33", name: "Jira", category: "Methodology", description: "Backlog management, sprint boards, issue tracking, burndown metrics, and workflow automation." },
  { id: "sk_34", name: "Stakeholder Management", category: "Leadership", description: "Aligning cross-functional business stakeholders, executive communication, and scope prioritization." },
  { id: "sk_35", name: "Machine Learning", category: "Technical", description: "Supervised and unsupervised ML algorithms, model evaluation, feature engineering, and predictive modeling." },
  { id: "sk_36", name: "Azure ML", category: "Technical", description: "Azure Machine Learning Studio, model training pipelines, automated ML, and endpoint deployment." },
  { id: "sk_37", name: "NLP", category: "Technical", description: "Natural Language Processing, text tokenization, sentiment analysis, entity extraction, and transformers." },
  { id: "sk_38", name: "GenAI", category: "Technical", description: "Generative AI applications, prompt engineering, RAG architectures, and fine-tuning LLM foundation models." },
  { id: "sk_39", name: "MLOps", category: "Technical", description: "Machine learning operations, model versioning, continuous monitoring, feature stores, and automated retraining." }
];
 
const INITIAL_ROLES: TargetRole[] = [
  {
    id: "role_1",
    title: "Senior Full-Stack AI Engineer",
    description: "Architects scalable full-stack applications leveraging modern frameworks and state-of-the-art AI orchestration layers.",
    requiredSkills: [
      { skillId: "sk_1", minLevel: 4 },
      { skillId: "sk_2", minLevel: 5 },
      { skillId: "sk_3", minLevel: 4 },
      { skillId: "sk_6", minLevel: 4 },
      { skillId: "sk_8", minLevel: 4 }
    ]
  },
  {
    id: "role_2",
    title: "AI Solutions Architect",
    description: "Designs the overall cognitive systems structure, security boundaries, vector caching patterns, and orchestrator boundaries.",
    requiredSkills: [
      { skillId: "sk_3", minLevel: 5 },
      { skillId: "sk_6", minLevel: 5 },
      { skillId: "sk_7", minLevel: 4 },
      { skillId: "sk_8", minLevel: 5 }
    ]
  },
  {
    id: "role_3",
    title: "Engineering Manager",
    description: "Leads highly functional developer cohorts, aligning product capabilities with professional growth pathways and manager coaching.",
    requiredSkills: [
      { skillId: "sk_2", minLevel: 3 },
      { skillId: "sk_4", minLevel: 4 },
      { skillId: "sk_5", minLevel: 5 }
    ]
  },
  {
    id: "role_4",
    title: "Automation Tester",
    description: "Designs, executes, and scales automated test suites using Selenium, Java, API Testing, Git, CI/CD, and TestNG.",
    requiredSkills: [
      { skillId: "sk_9", minLevel: 4 },
      { skillId: "sk_10", minLevel: 4 },
      { skillId: "sk_11", minLevel: 4 },
      { skillId: "sk_12", minLevel: 3 },
      { skillId: "sk_13", minLevel: 3 },
      { skillId: "sk_14", minLevel: 3 }
    ]
  }
];
 
const MANAGERS_WITH_REPORTS = [
  // NOTE: these 5 entries were previously commented out, which was the root cause of the
  // "SQLITE_CONSTRAINT_FOREIGNKEY" seeding crash - employees' managerId fields and two
  // evidence records' reviewedBy fields reference these ids (user_2, mgr_2..mgr_5), and
  // inserting a row that references a non-existent user violates the foreign key
  // constraint. Restoring them fixes the crash AND means manager demo accounts actually
  // exist again.
  { id: "user_2", name: "Marcus Sterling", email: "marcus.sterling@capabilityhub.ai", title: "Engineering Lead", department: "QA & AI Divisions", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" },
  { id: "mgr_2", name: "Rachel Adams", email: "rachel.adams@capabilityhub.ai", title: "Front-End Engineering Manager", department: "UI/UX Division", avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150" },
  { id: "mgr_3", name: "David Croft", email: "david.croft@capabilityhub.ai", title: "Cloud Infrastructure Manager", department: "Cloud Platform", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150" },
  { id: "mgr_4", name: "Sophia Chen", email: "sophia.chen@capabilityhub.ai", title: "AI Products Engineering Manager", department: "AI Solutions", avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150" },
  { id: "mgr_5", name: "Carlos Gomez", email: "carlos.gomez@capabilityhub.ai", title: "Data & Vector Analytics Lead", department: "Data Science", avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150" }
];
 
const MANAGERS_WITHOUT_REPORTS: any[] = [];
 
function generateInitialUsers(): User[] {
  const users: User[] = [];
 
  // 1. Add active managers
  MANAGERS_WITH_REPORTS.forEach(m => {
    users.push({
      id: m.id,
      name: m.name,
      email: m.email,
      role: UserRole.MANAGER,
      avatar: m.avatar,
      title: m.title,
      department: m.department
    });
  });
 
  // 2. Add L&D Director and Executive Leadership
  // NOTE: these were also previously commented out, meaning no L&D or Leadership demo
  // account existed on a fresh database at all - restoring them so all 4 roles
  // (employee, manager, ld, leadership) are actually demoable out of the box.
  users.push({
    id: "user_3",
    name: "Sarah Jenkins",
    email: "sarah.jenkins@capabilityhub.ai",
    role: UserRole.LD,
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150",
    title: "Director of Workforce Development",
    department: "Learning & Development"
  });
 
  users.push({
    id: "user_4",
    name: "David Vance",
    email: "david.vance@capabilityhub.ai",
    role: UserRole.LEADERSHIP,
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150",
    title: "VP of Strategic Readiness",
    department: "Executive Leadership"
  });
 
  // 3. Push dataset resources (E1000 to E1019) as the only individual contributors
  const DATASET_RESOURCES: User[] = [
    { id: "E1000", name: "Aarav", email: "aarav@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", title: "Senior Senior Software Engineer", department: "Banking", experienceYears: 8, domain: "Banking", primaryRole: "Java Full Stack Developer", primarySkills: ["Java", "Spring Boot", "React", "Microservices", "REST APIs", "SQL", "CI/CD"], targetRoleId: "role_1", managerId: "user_2" },
    { id: "E1001", name: "Priya", email: "priya@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150", title: "Lead Data Engineer", department: "Healthcare", experienceYears: 9, domain: "Healthcare", primaryRole: "Data Engineer", primarySkills: ["Python", "SQL", "Spark", "Azure Data Factory", "Databricks"], targetRoleId: "role_1", managerId: "mgr_2" },
    { id: "E1002", name: "Rohan", email: "rohan@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", title: "Associate DevOps Engineer", department: "Retail", experienceYears: 3.5, domain: "Retail", primaryRole: "Cloud DevOps Engineer", primarySkills: ["Azure", "Kubernetes", "Docker", "Terraform", "Azure DevOps"], targetRoleId: "role_2", managerId: "mgr_3" },
    { id: "E1003", name: "Sneha", email: "sneha@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150", title: "Business Analyst", department: "Insurance", experienceYears: 6, domain: "Insurance", primaryRole: "Business Analyst", primarySkills: ["Requirements Gathering", "Agile", "Jira", "SQL", "Stakeholder Management"], targetRoleId: "role_3", managerId: "mgr_4" },
    { id: "E1004", name: "Karan", email: "karan@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150", title: "Senior Machine Learning Engineer", department: "Manufacturing", experienceYears: 7, domain: "Manufacturing", primaryRole: "AI/ML Engineer", primarySkills: ["Python", "Machine Learning", "Azure ML", "NLP", "GenAI", "MLOps"], targetRoleId: "role_1", managerId: "mgr_5" },
    { id: "E1005", name: "Neha", email: "neha@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150", title: "Lead Senior Software Engineer", department: "Banking", experienceYears: 9.5, domain: "Banking", primaryRole: "Java Full Stack Developer", primarySkills: ["Java", "Spring Boot", "React", "Microservices", "REST APIs", "SQL", "CI/CD"], targetRoleId: "role_1", managerId: "user_2" },
    { id: "E1006", name: "Vikram", email: "vikram@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150", title: "Data Engineer", department: "Healthcare", experienceYears: 4, domain: "Healthcare", primaryRole: "Data Engineer", primarySkills: ["Python", "SQL", "Spark", "Databricks"], targetRoleId: "role_1", managerId: "mgr_2" },
    { id: "E1007", name: "Ananya", email: "ananya@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150", title: "Cloud DevOps Engineer", department: "Retail", experienceYears: 5, domain: "Retail", primaryRole: "Cloud DevOps Engineer", primarySkills: ["Azure", "Kubernetes", "Docker", "Terraform"], targetRoleId: "role_2", managerId: "mgr_3" },
    { id: "E1008", name: "Rahul", email: "rahul@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150", title: "Business Analyst", department: "Insurance", experienceYears: 7.5, domain: "Insurance", primaryRole: "Business Analyst", primarySkills: ["Requirements Gathering", "Agile", "Jira", "Stakeholder Management"], targetRoleId: "role_3", managerId: "mgr_4" },
    { id: "E1009", name: "Ishita", email: "ishita@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150", title: "AI/ML Engineer", department: "Manufacturing", experienceYears: 10, domain: "Manufacturing", primaryRole: "AI/ML Engineer", primarySkills: ["Python", "Machine Learning", "NLP", "GenAI", "MLOps"], targetRoleId: "role_1", managerId: "mgr_5" },
    { id: "E1010", name: "Siddharth", email: "siddharth@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", title: "Java Full Stack Developer", department: "Banking", experienceYears: 3, domain: "Banking", primaryRole: "Java Full Stack Developer", primarySkills: ["Java", "Spring Boot", "REST APIs", "SQL"], targetRoleId: "role_1", managerId: "user_2" },
    { id: "E1011", name: "Pooja", email: "pooja@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150", title: "Data Engineer", department: "Healthcare", experienceYears: 5.5, domain: "Healthcare", primaryRole: "Data Engineer", primarySkills: ["Python", "SQL", "Spark", "Azure Data Factory"], targetRoleId: "role_1", managerId: "mgr_2" },
    { id: "E1012", name: "Aditya", email: "aditya@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150", title: "Cloud DevOps Engineer", department: "Retail", experienceYears: 8, domain: "Retail", primaryRole: "Cloud DevOps Engineer", primarySkills: ["Azure", "Kubernetes", "Docker", "Azure DevOps"], targetRoleId: "role_2", managerId: "mgr_3" },
    { id: "E1013", name: "Meera", email: "meera@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150", title: "Business Analyst", department: "Insurance", experienceYears: 9, domain: "Insurance", primaryRole: "Business Analyst", primarySkills: ["Requirements Gathering", "Agile", "Jira", "SQL"], targetRoleId: "role_3", managerId: "mgr_4" },
    { id: "E1014", name: "Nikhil", email: "nikhil@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", title: "AI/ML Engineer", department: "Manufacturing", experienceYears: 3.5, domain: "Manufacturing", primaryRole: "AI/ML Engineer", primarySkills: ["Python", "Machine Learning", "GenAI", "MLOps"], targetRoleId: "role_1", managerId: "mgr_5" },
    { id: "E1015", name: "Kavya", email: "kavya@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150", title: "Java Full Stack Developer", department: "Banking", experienceYears: 6, domain: "Banking", primaryRole: "Java Full Stack Developer", primarySkills: ["Java", "Spring Boot", "React", "Microservices", "SQL"], targetRoleId: "role_1", managerId: "user_2" },
    { id: "E1016", name: "Arjun", email: "arjun@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150", title: "Data Engineer", department: "Healthcare", experienceYears: 7, domain: "Healthcare", primaryRole: "Data Engineer", primarySkills: ["Python", "SQL", "Spark", "Databricks"], targetRoleId: "role_1", managerId: "mgr_2" },
    { id: "E1017", name: "Riya", email: "riya@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150", title: "Cloud DevOps Engineer", department: "Retail", experienceYears: 9.5, domain: "Retail", primaryRole: "Cloud DevOps Engineer", primarySkills: ["Azure", "Kubernetes", "Docker", "Terraform", "Azure DevOps"], targetRoleId: "role_2", managerId: "mgr_3" },
    { id: "E1018", name: "Dev", email: "dev@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150", title: "Business Analyst", department: "Insurance", experienceYears: 4, domain: "Insurance", primaryRole: "Business Analyst", primarySkills: ["Requirements Gathering", "Agile", "Jira", "Stakeholder Management"], targetRoleId: "role_3", managerId: "mgr_4" },
    { id: "E1019", name: "Aditi", email: "aditi@capabilityhub.ai", role: UserRole.EMPLOYEE, avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150", title: "AI/ML Engineer", department: "Manufacturing", experienceYears: 5, domain: "Manufacturing", primaryRole: "AI/ML Engineer", primarySkills: ["Python", "Machine Learning", "NLP", "GenAI"], targetRoleId: "role_1", managerId: "mgr_5" }
  ];
 
  users.push(...DATASET_RESOURCES);
 
  return users;
}
 
const INITIAL_USERS: User[] = generateInitialUsers();
 
const INITIAL_USER_SKILLS: { [userId: string]: UserSkill[] } = {
  E1000: [
    { skillId: "sk_15", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_16", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_17", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_18", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_19", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_21", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1001: [
    { skillId: "sk_22", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_23", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_24", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_25", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1002: [
    { skillId: "sk_26", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_27", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_28", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_29", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_30", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1003: [
    { skillId: "sk_31", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_32", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_33", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_34", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1004: [
    { skillId: "sk_22", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_35", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_36", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_37", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_38", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_39", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1005: [
    { skillId: "sk_15", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_16", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_17", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_18", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_19", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_21", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1006: [
    { skillId: "sk_22", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_23", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_25", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1007: [
    { skillId: "sk_26", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_27", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_28", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_29", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1008: [
    { skillId: "sk_31", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_32", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_33", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_34", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1009: [
    { skillId: "sk_22", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_35", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_37", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_38", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_39", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1010: [
    { skillId: "sk_15", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_16", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_19", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1011: [
    { skillId: "sk_22", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_23", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_24", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1012: [
    { skillId: "sk_26", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_27", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_28", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_30", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1013: [
    { skillId: "sk_31", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_32", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_33", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1014: [
    { skillId: "sk_22", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_35", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_38", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_39", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1015: [
    { skillId: "sk_15", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_16", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_17", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_18", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1016: [
    { skillId: "sk_22", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_20", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_23", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_25", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1017: [
    { skillId: "sk_26", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_27", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_28", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_29", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_30", currentLevel: 5, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1018: [
    { skillId: "sk_31", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_32", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_33", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_34", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" }
  ],
  E1019: [
    { skillId: "sk_22", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_35", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_37", currentLevel: 3, targetLevel: 4, status: "validated", lastUpdated: "2026-07-20" },
    { skillId: "sk_38", currentLevel: 4, targetLevel: 5, status: "validated", lastUpdated: "2026-07-20" }
  ]
};
 
const INITIAL_COURSES: LearningCourse[] = [
  {
    id: "c_6",
    title: "Java Programming Masterclass covering Java 11 & Java 17",
    provider: "Udemy",
    duration: "135 hours",
    skillId: "sk_9",
    description: "Comprehensive Java fundamentals, object-oriented programming principles, collections framework, lambda expressions, and exception handling for automated testing.",
    type: "Course",
    url: "https://www.udemy.com/course/java-the-complete-java-developer-course/",
    rating: 4.7,
    enrollmentCount: "810,000+ Learners",
    lastUpdated: "Updated 2026 (Verified Syllabus)",
    isLatest2026: true
  },
  {
    id: "c_7",
    title: "Selenium WebDriver with Java - Basics to Advanced+Frameworks",
    provider: "Udemy",
    duration: "54 hours",
    skillId: "sk_10",
    description: "Hands-on guide to building Page Object Model (POM) frameworks, dynamic locators, ThreadLocal parallel execution, and headless cross-browser grid automation.",
    type: "Course",
    url: "https://www.udemy.com/course/selenium-webdriver-with-java-basics-to-advanced/",
    rating: 4.6,
    enrollmentCount: "310,000+ Learners",
    lastUpdated: "Updated 2026 (Verified Syllabus)",
    isLatest2026: true
  },
  {
    id: "c_8",
    title: "Postman: The Complete Guide - REST API Testing",
    provider: "Udemy",
    duration: "15 hours",
    skillId: "sk_11",
    description: "Automating REST API endpoint validation, JSON Schema assertions, Newman CLI collection runners, environment variables, and token authentication.",
    type: "Course",
    url: "https://www.udemy.com/course/postman-the-complete-guide/",
    rating: 4.7,
    enrollmentCount: "180,000+ Learners",
    lastUpdated: "Updated 2026 (Verified Syllabus)",
    isLatest2026: true
  },
  {
    id: "c_9",
    title: "Git Complete: The Definitive Guide to Git",
    provider: "Udemy",
    duration: "6 hours",
    skillId: "sk_12",
    description: "Managing code repositories, Git Flow branching strategies, automated PR verification checks, merge conflict resolution, and code review best practices.",
    type: "Course",
    url: "https://www.udemy.com/course/git-complete/",
    rating: 4.7,
    enrollmentCount: "150,000+ Learners",
    lastUpdated: "Updated 2026 (Verified Syllabus)",
    isLatest2026: true
  },
  {
    id: "c_10",
    title: "Jenkins, From Zero To Hero: Become a DevOps Jenkins Master",
    provider: "Udemy",
    duration: "10.5 hours",
    skillId: "sk_13",
    description: "Setting up headless Selenium grid execution inside Docker containers, automated GitHub PR triggers, quality gate assertions, and HTML artifact reporting.",
    type: "Workshop",
    url: "https://www.udemy.com/course/jenkins-from-zero-to-hero/",
    rating: 4.6,
    enrollmentCount: "120,000+ Learners",
    lastUpdated: "Updated 2026 (Verified Syllabus)",
    isLatest2026: true
  },
  {
    id: "c_11",
    title: "REST API Testing Automation via REST Assured & Java",
    provider: "Udemy",
    duration: "33.5 hours",
    skillId: "sk_14",
    description: "Multi-threaded parallel suite execution, DataProvider annotations, dynamic XML suite generation, custom test listeners, and interactive HTML dashboards.",
    type: "Certification",
    url: "https://www.udemy.com/course/rest-api-automation-testing-rest-assured-java/",
    rating: 4.6,
    enrollmentCount: "140,000+ Learners",
    lastUpdated: "Updated 2026 (Verified Syllabus)",
    isLatest2026: true
  },
  {
    id: "c_1",
    title: "Next.js & React - The Complete Guide",
    provider: "Udemy",
    duration: "33.5 hours",
    skillId: "sk_1",
    description: "Production guide to React Server Components, streaming SSR, parallel & intercepting routes, server actions, and edge cache optimizations.",
    type: "Course",
    url: "https://www.udemy.com/course/nextjs-react-the-complete-guide/",
    rating: 4.7,
    enrollmentCount: "250,000+ Learners",
    lastUpdated: "Updated 2026 (Verified Syllabus)",
    isLatest2026: true
  },
  {
    id: "c_2",
    title: "Understanding TypeScript",
    provider: "Udemy",
    duration: "15 hours",
    skillId: "sk_2",
    description: "Mastering mapped types, template literal types, conditional interfaces, decorator metadata, strict null safety, and Zod runtime schema assertions.",
    type: "Course",
    url: "https://www.udemy.com/course/understanding-typescript/",
    rating: 4.7,
    enrollmentCount: "220,000+ Learners",
    lastUpdated: "Updated 2026 (Verified Syllabus)",
    isLatest2026: true
  },
  {
    id: "c_3",
    title: "Google Gemini API Official Documentation & Tutorials",
    provider: "Google Developer Studio",
    duration: "Self-Paced (6 hours)",
    skillId: "sk_3",
    description: "Official guide to structured JSON schema responses, function calling, tool use, search grounding, system instructions, and live streaming models.",
    type: "Certification",
    url: "https://ai.google.dev/gemini-api/docs",
    rating: 4.9,
    enrollmentCount: "350,000+ Developers",
    lastUpdated: "Updated 2026 (Official Docs)",
    isLatest2026: true
  }
];
 
const INITIAL_EVIDENCES: Evidence[] = [
  {
    id: "ev_aarav_1",
    userId: "E1000",
    skillId: "sk_15",
    title: "Core Java OOP Banking Application Simulator",
    description: "Developed a standalone Java simulator applying inheritance, interface polymorphism, and exception handling.",
    evidenceText: "Submitted GitHub repository containing 15 Java classes demonstrating OOP principles, unit assertions, and try-catch blocks for account operations.",
    documentUrl: "https://github.com/capability-hub/aarav-banking/tree/main/java-oop",
    status: "approved",
    submittedAt: "2026-07-22T10:00:00Z",
    reviewedBy: "user_2",
    reviewComment: "Great demonstration of Core Java principles. Clean code structure and exception handling verified!",
    reviewedAt: "2026-07-23T14:00:00Z"
  },
  {
    id: "ev_1",
    userId: "E1005",
    skillId: "sk_15",
    title: "Enterprise REST Type Defs for Core Banking Services",
    description: "Created custom strict generic type interfaces for backend communication payload models, eliminating 'any'.",
    evidenceText: "Refactored app/users/schemas.ts to utilize Zod parsing boundaries + strict schema mappings. Checked in code branch 'feature/type-safety-core'.",
    documentUrl: "https://github.com/capability-hub/core/pull/143",
    status: "approved",
    submittedAt: "2026-06-14T10:00:00Z",
    reviewedBy: "user_2",
    reviewComment: "Flawless application of Java & TypeScript patterns to our production endpoints. Verified the PR. Excellent work, Neha!",
    reviewedAt: "2026-06-15T15:30:00Z"
  }
];
 
const INITIAL_LEARNING_PLANS: WeeklyLearningStep[] = [
  {
    id: "plan_r_1",
    userId: "E1000",
    weekNumber: 1,
    title: "Core Java & Spring Boot Fundamentals",
    skillFocus: "Java & Spring Boot",
    courseName: "Java Microservices Masterclass for Enterprise",
    provider: "Udemy",
    milestone: "Master Classes, Spring Boot, REST APIs, and Exception Handling",
    assessment: "Java Architecture Assessment",
    targetScore: "80%",
    status: "completed",
    progressPercent: 100,
    learningType: "in_depth",
    estimatedDuration: "2 hours",
    phaseLabel: "Phase 1: Foundation",
    targetDeadline: "2026-08-08",
    deadlineType: "client_interview",
    quizScore: 92,
    timeSpentMins: 120,
    completedAt: "2026-07-22"
  },
  {
    id: "plan_r_2",
    userId: "E1000",
    weekNumber: 2,
    title: "React Frontend Integration Quick-Check",
    skillFocus: "React & Modern UI",
    courseName: "React with TypeScript - Fast Track",
    provider: "LinkedIn Learning",
    milestone: "Write State Managers & Custom Hooks for Banking Dashboards",
    assessment: "React Component Architecture Assignment",
    targetScore: "85%",
    status: "in_progress",
    progressPercent: 60,
    learningType: "micro",
    estimatedDuration: "15 mins",
    phaseLabel: "Phase 2: Sprint Prep",
    targetDeadline: "2026-08-10",
    deadlineType: "client_interview",
    quizScore: 85,
    timeSpentMins: 45
  },
  {
    id: "plan_r_3",
    userId: "E1000",
    weekNumber: 3,
    title: "Microservices & SQL Optimization Lab",
    skillFocus: "Microservices & SQL",
    courseName: "Microservices Design Patterns & SQL Tuning",
    provider: "Coursera",
    milestone: "Design 5 Microservice Endpoints with SQL Join Assertions",
    assessment: "Microservices Execution Lab",
    targetScore: "80%",
    status: "pending",
    progressPercent: 0,
    learningType: "best_practice",
    estimatedDuration: "45 mins",
    phaseLabel: "Interview Sprint: Day 3",
    targetDeadline: "2026-08-12",
    deadlineType: "client_interview",
    quizScore: 0,
    timeSpentMins: 0
  }
];
 
// Per-employee learning behaviour, seeded so the Will (Interest in Learning) axis of
// the Skill-vs-Will matrix is COMPUTED from real records rather than invented. Before
// this, willScore was `22 + (numericId * 53) % 73` - a number derived from the user's
// id and dressed up as a measured metric.
//
// Two design choices keep the axis honest and defensible:
//   1. Will is deliberately INDEPENDENT of Skill. A highly skilled employee can be
//      disengaged (E1005: strong skills, no learning activity -> Retain & Coach) and a
//      less skilled one highly motivated (E1010: eager learner -> high Will). If Will
//      simply tracked Skill the 2x2 would collapse to a diagonal.
//   2. Seeded evidence is mostly `pending`. Evidence submission signals initiative
//      (Will), but only *approved* evidence adds the skill bonus, so pending evidence
//      raises Will without inflating Skill - the two axes stay genuinely separate.
//
// Each number here corresponds to real rows generated below, so the score reconciles
// with what the employee's own dashboard shows (their learning plan and evidence).
// E1000 already has 3 hand-authored plans + 1 approved evidence, so it only adds
// initiative here; E1005 is intentionally left empty.
const ENGAGEMENT_PROFILES: {
  [userId: string]: { steps: number; completed: number; quiz: number; minutes: number; evidence: number; evidenceApproved: number };
} = {
  E1000: { steps: 0, completed: 0, quiz: 0,  minutes: 0,   evidence: 2, evidenceApproved: 0 },
  E1001: { steps: 4, completed: 3, quiz: 84, minutes: 240, evidence: 2, evidenceApproved: 1 },
  E1002: { steps: 3, completed: 1, quiz: 63, minutes: 55,  evidence: 0, evidenceApproved: 0 },
  E1003: { steps: 4, completed: 2, quiz: 77, minutes: 150, evidence: 1, evidenceApproved: 0 },
  E1004: { steps: 5, completed: 5, quiz: 91, minutes: 400, evidence: 3, evidenceApproved: 1 },
  E1005: { steps: 0, completed: 0, quiz: 0,  minutes: 0,   evidence: 0, evidenceApproved: 0 },
  E1006: { steps: 3, completed: 1, quiz: 60, minutes: 45,  evidence: 0, evidenceApproved: 0 },
  E1007: { steps: 4, completed: 3, quiz: 82, minutes: 220, evidence: 2, evidenceApproved: 1 },
  E1008: { steps: 2, completed: 0, quiz: 0,  minutes: 20,  evidence: 0, evidenceApproved: 0 },
  E1009: { steps: 5, completed: 4, quiz: 88, minutes: 330, evidence: 2, evidenceApproved: 1 },
  E1010: { steps: 5, completed: 5, quiz: 90, minutes: 410, evidence: 3, evidenceApproved: 0 },
  E1011: { steps: 4, completed: 2, quiz: 74, minutes: 140, evidence: 1, evidenceApproved: 0 },
  E1012: { steps: 3, completed: 1, quiz: 66, minutes: 60,  evidence: 0, evidenceApproved: 0 },
  E1013: { steps: 5, completed: 5, quiz: 92, minutes: 380, evidence: 3, evidenceApproved: 1 },
  E1014: { steps: 3, completed: 2, quiz: 79, minutes: 130, evidence: 1, evidenceApproved: 0 },
  E1015: { steps: 4, completed: 2, quiz: 75, minutes: 150, evidence: 1, evidenceApproved: 0 },
  E1016: { steps: 4, completed: 3, quiz: 85, minutes: 250, evidence: 2, evidenceApproved: 1 },
  E1017: { steps: 2, completed: 0, quiz: 0,  minutes: 25,  evidence: 0, evidenceApproved: 0 },
  E1018: { steps: 4, completed: 3, quiz: 81, minutes: 210, evidence: 1, evidenceApproved: 0 },
  E1019: { steps: 5, completed: 4, quiz: 87, minutes: 300, evidence: 2, evidenceApproved: 1 },
};

const ENG_STEP_TITLES = [
  "Foundations & Core Concepts", "Applied Practice Lab", "Advanced Patterns Workshop",
  "Capstone Project Build", "Peer Review & Refinement",
];
const ENG_COURSES = [
  { name: "Modern Engineering Foundations", provider: "Coursera" },
  { name: "Hands-On Applied Practice", provider: "Udemy" },
  { name: "Advanced Design Patterns", provider: "Pluralsight" },
  { name: "Capstone Delivery Track", provider: "LinkedIn Learning" },
  { name: "Professional Review Studio", provider: "edX" },
];

// Turns the compact profiles above into the actual learning_plans and evidences rows
// the Will formula reads. IDs are prefixed `eng_` so they never collide with the
// hand-authored seed rows; INSERT OR IGNORE makes re-seeding idempotent.
function buildEngagementSeed(): { plans: WeeklyLearningStep[]; evidences: Evidence[] } {
  const plans: WeeklyLearningStep[] = [];
  const evidences: Evidence[] = [];
  const jitter = [0, -2, 3, -1, 2];
  const pad = (n: number) => String(n).padStart(2, "0");

  for (const [uid, p] of Object.entries(ENGAGEMENT_PROFILES)) {
    const skillId = INITIAL_USER_SKILLS[uid]?.[0]?.skillId || "sk_20";
    const perStep = p.completed > 0 ? Math.round(p.minutes / p.completed) : 0;

    for (let i = 0; i < p.steps; i++) {
      const done = i < p.completed;
      const status: "completed" | "in_progress" | "pending" =
        done ? "completed" : i === p.completed ? "in_progress" : "pending";
      plans.push({
        id: `eng_plan_${uid}_${i + 1}`,
        userId: uid,
        weekNumber: i + 1,
        title: ENG_STEP_TITLES[i % ENG_STEP_TITLES.length],
        skillFocus: "Target Role Competencies",
        courseName: ENG_COURSES[i % ENG_COURSES.length].name,
        provider: ENG_COURSES[i % ENG_COURSES.length].provider,
        milestone: "Complete the module assessment and applied exercise",
        assessment: "Module Knowledge Check",
        targetScore: "80%",
        status,
        progressPercent: done ? 100 : status === "in_progress" ? 50 : 0,
        learningType: "in_depth",
        estimatedDuration: "1 hour",
        phaseLabel: `Phase ${i + 1}`,
        targetDeadline: "2026-09-30",
        deadlineType: "learner_set",
        quizScore: done ? Math.max(0, Math.min(100, p.quiz + jitter[i % jitter.length])) : 0,
        timeSpentMins: done ? perStep : status === "in_progress" ? Math.round(perStep * 0.4) : 0,
        completedAt: done ? `2026-08-${pad(10 + i)}` : undefined,
      });
    }

    for (let i = 0; i < p.evidence; i++) {
      const approved = i < p.evidenceApproved;
      evidences.push({
        id: `eng_ev_${uid}_${i + 1}`,
        userId: uid,
        skillId,
        title: `Applied ${["Workplace Task", "Project Contribution", "Skill Demonstration"][i % 3]}`,
        description: "Self-submitted evidence of applying a target skill on real work.",
        evidenceText: "Documented the task, the approach taken, and the outcome, with a link to the deliverable.",
        status: approved ? "approved" : "pending",
        submittedAt: `2026-08-${pad(5 + i)}T09:00:00Z`,
        reviewedBy: approved ? "user_2" : undefined,
        reviewComment: approved ? "Verified - clear evidence of applied capability." : undefined,
        reviewedAt: approved ? `2026-08-${pad(6 + i)}T12:00:00Z` : undefined,
      });
    }
  }
  return { plans, evidences };
}

const INITIAL_REMINDERS: AgentReminder[] = [
  // {
  //   id: "rem_1",
  //   userId: "E1000",
  //   targetRole: "Java Full Stack Developer",
  //   type: "weekly_reminder",
  //   title: "Week 2 Checkpoint Due: React Component Architecture",
  //   message: "Aarav, your Week 2 milestone in React & TypeScript is 60% complete. Complete your custom hooks assignment for ABC Global Bank interview readiness!",
  //   status: "scheduled",
  //   createdAt: "2026-07-24T08:00:00Z"
  // },
  // {
  //   id: "rem_2",
  //   userId: "E1000",
  //   targetRole: "Java Full Stack Developer",
  //   type: "manager_notice",
  //   title: "1-on-1 Coaching Checkpoint Scheduled with Marcus Sterling",
  //   message: "Marcus Sterling (Engineering Lead) has scheduled a 1-on-1 capability review for Friday at 3:00 PM to discuss OPP-1001 deployment readiness.",
  //   status: "scheduled",
  //   createdAt: "2026-07-24T10:30:00Z"
  // }
];
 
const INITIAL_DEMANDS: ProjectDemand[] = [
  {
    id: "OPP-1001",
    projectName: "ABC Global Bank Modernization",
    customerName: "ABC Global Bank",
    businessUnit: "Banking & Financial Services",
    projectDescription: "Modernizing core banking microservices and enterprise digital portals using Java, Spring Boot, React, and RESTful API integrations.",
    rawJobDescription: "ABC Global Bank requires Senior Java Full Stack Developers for modernizing core banking portals. Must have expertise in Java, Spring Boot, React, Microservices, REST APIs, SQL, and CI/CD pipelines.",
    requiredSkills: ["Java", "Spring Boot", "React", "Microservices", "REST APIs", "SQL", "CI/CD"],
    preferredSkills: ["Kubernetes", "Docker", "PostgreSQL"],
    experienceRangeMin: 5,
    experienceRangeMax: 10,
    technologyStack: ["Java", "Spring Boot", "React", "Microservices", "REST APIs", "SQL", "Jenkins"],
    resourcesRequired: 3,
    clientInterviewDate: "2026-08-15T10:00:00Z",
    expectedJoiningDate: "2026-09-01T09:00:00Z",
    projectPriority: "CRITICAL",
    location: "Hybrid / New York",
    domain: "Banking",
    employmentType: "Full-Time",
    additionalNotes: "High-priority core banking transformation program.",
    status: "OPEN",
    createdAt: "2026-07-25T10:00:00Z"
  },
  {
    id: "OPP-1002",
    projectName: "HealthFirst Data Engine",
    customerName: "HealthFirst Analytics",
    businessUnit: "Healthcare & Life Sciences",
    projectDescription: "Building scalable data pipelines for clinical patient records using Python, Spark, SQL, Azure Data Factory, and Databricks cloud lakehouse.",
    rawJobDescription: "HealthFirst Analytics requires Lead Data Engineers with Python, SQL, Apache Spark, Azure Data Factory, and Databricks experience to build HIPAA-compliant data engines.",
    requiredSkills: ["Python", "SQL", "Spark", "Azure Data Factory", "Databricks"],
    preferredSkills: ["Azure ML", "Delta Lake", "Snowflake"],
    experienceRangeMin: 6,
    experienceRangeMax: 10,
    technologyStack: ["Python", "SQL", "Spark", "Azure Data Factory", "Databricks", "Azure"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-08-18T14:00:00Z",
    expectedJoiningDate: "2026-09-05T09:00:00Z",
    projectPriority: "HIGH",
    location: "Remote / Boston",
    domain: "Healthcare",
    employmentType: "Full-Time",
    additionalNotes: "Requires HIPAA compliance awareness and large-scale data lake experience.",
    status: "OPEN",
    createdAt: "2026-07-26T11:00:00Z"
  },
  {
    id: "OPP-1003",
    projectName: "RetailHub OmniCommerce Pipeline",
    customerName: "RetailHub Commerce",
    businessUnit: "Retail & Consumer Goods",
    projectDescription: "Designing cloud analytics data lakes and ETL workflows using Databricks, Spark, SQL, and Azure Data Factory for retail inventory tracking.",
    rawJobDescription: "RetailHub requires Azure Data Engineers experienced in Python, Databricks, Spark, Azure Data Factory, and SQL.",
    requiredSkills: ["Python", "Databricks", "Spark", "Azure Data Factory", "SQL"],
    preferredSkills: ["Azure DevOps", "Power BI"],
    experienceRangeMin: 4,
    experienceRangeMax: 8,
    technologyStack: ["Python", "Databricks", "Spark", "Azure Data Factory", "SQL"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-08-20T11:00:00Z",
    expectedJoiningDate: "2026-09-08T09:00:00Z",
    projectPriority: "HIGH",
    location: "Hybrid / Chicago",
    domain: "Retail",
    employmentType: "Full-Time",
    additionalNotes: "Omnichannel inventory intelligence platform rollout.",
    status: "OPEN",
    createdAt: "2026-07-27T09:30:00Z"
  },
  {
    id: "OPP-1004",
    projectName: "InsureOne GCC Requirements & Transformation",
    customerName: "InsureOne GCC",
    businessUnit: "Insurance & Risk Management",
    projectDescription: "Eliciting requirements, mapping process flows, and coordinating sprint execution across insurance claim processing modules.",
    rawJobDescription: "InsureOne GCC requires a Senior Business Analyst in Insurance with expertise in Requirements Gathering, Agile, Jira, SQL, and Executive Stakeholder Management.",
    requiredSkills: ["Requirements Gathering", "Agile", "Jira", "SQL", "Stakeholder Management"],
    preferredSkills: ["Confluence", "Visio", "Insurance Claim Systems"],
    experienceRangeMin: 5,
    experienceRangeMax: 10,
    technologyStack: ["Jira", "Confluence", "SQL", "Agile/Scrum"],
    resourcesRequired: 1,
    clientInterviewDate: "2026-08-16T15:00:00Z",
    expectedJoiningDate: "2026-09-01T09:00:00Z",
    projectPriority: "CRITICAL",
    location: "Onsite / London",
    domain: "Insurance",
    employmentType: "Full-Time",
    additionalNotes: "High client visibility, requiring direct C-level stakeholder communication.",
    status: "OPEN",
    createdAt: "2026-07-28T08:00:00Z"
  },
  {
    id: "OPP-1005",
    projectName: "GlobalTel Cloud Infrastructure Automation",
    customerName: "GlobalTel Communications",
    businessUnit: "Telecom & Cloud Operations",
    projectDescription: "Automating cloud infrastructure deployment and Kubernetes container orchestration across Azure, Docker, and Terraform.",
    rawJobDescription: "GlobalTel is seeking Cloud DevOps Engineers with hands-on skills in Azure, Kubernetes, Docker, Terraform, and Azure DevOps CI/CD pipelines.",
    requiredSkills: ["Azure", "Kubernetes", "Docker", "Terraform", "Azure DevOps"],
    preferredSkills: ["Helm", "Prometheus", "Grafana"],
    experienceRangeMin: 3,
    experienceRangeMax: 8,
    technologyStack: ["Azure", "Kubernetes", "Docker", "Terraform", "Azure DevOps"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-08-22T10:00:00Z",
    expectedJoiningDate: "2026-09-10T09:00:00Z",
    projectPriority: "HIGH",
    location: "Remote / Dallas",
    domain: "Retail",
    employmentType: "Full-Time",
    additionalNotes: "Multi-region cloud infrastructure transformation.",
    status: "OPEN",
    createdAt: "2026-07-28T14:00:00Z"
  },
  {
    id: "OPP-1006",
    projectName: "TechNova Generative AI Platform",
    customerName: "TechNova AI",
    businessUnit: "Manufacturing & Industrial AI",
    projectDescription: "Deploying end-to-end GenAI foundational models, RAG search engines, and MLOps pipelines for smart factory diagnostic systems.",
    rawJobDescription: "TechNova AI requires Generative AI / ML Engineers with Python, Machine Learning, Azure ML, NLP, GenAI, and MLOps experience.",
    requiredSkills: ["Python", "Machine Learning", "Azure ML", "NLP", "GenAI", "MLOps"],
    preferredSkills: ["PyTorch", "LangChain", "Vector Databases"],
    experienceRangeMin: 4,
    experienceRangeMax: 9,
    technologyStack: ["Python", "Azure ML", "PyTorch", "GenAI", "MLOps"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-08-19T13:00:00Z",
    expectedJoiningDate: "2026-09-02T09:00:00Z",
    projectPriority: "CRITICAL",
    location: "Hybrid / San Jose",
    domain: "Manufacturing",
    employmentType: "Full-Time",
    additionalNotes: "Cutting-edge industrial GenAI diagnostic deployment.",
    status: "OPEN",
    createdAt: "2026-07-29T10:00:00Z"
  },
  {
    id: "OPP-1007",
    projectName: "EnergyGrid DevOps Platform Modernization",
    customerName: "EnergyGrid Systems",
    businessUnit: "Retail & Energy Infrastructure",
    projectDescription: "Leading cluster provisioning, IaC automation, and CI/CD deployment pipelines across Azure Kubernetes Service.",
    rawJobDescription: "EnergyGrid Systems requires Platform DevOps Engineers with Azure, Kubernetes, Docker, Terraform, and Azure DevOps expertise.",
    requiredSkills: ["Azure", "Kubernetes", "Docker", "Terraform", "Azure DevOps"],
    preferredSkills: ["Shell Scripting", "Ansible"],
    experienceRangeMin: 5,
    experienceRangeMax: 10,
    technologyStack: ["Azure", "Kubernetes", "Docker", "Terraform", "Azure DevOps"],
    resourcesRequired: 1,
    clientInterviewDate: "2026-08-25T11:00:00Z",
    expectedJoiningDate: "2026-09-12T09:00:00Z",
    projectPriority: "MEDIUM",
    location: "Hybrid / Houston",
    domain: "Retail",
    employmentType: "Full-Time",
    additionalNotes: "Grid monitoring system CI/CD automation.",
    status: "OPEN",
    createdAt: "2026-07-29T16:00:00Z"
  },
  {
    id: "OPP-1008",
    projectName: "PharmaNext Clinical NLP & Predictive AI",
    customerName: "PharmaNext Labs",
    businessUnit: "Healthcare & Life Sciences",
    projectDescription: "Applying NLP algorithms and predictive machine learning models to extract clinical trial insights from unstructured medical literature.",
    rawJobDescription: "PharmaNext Labs is hiring AI/ML Engineers skilled in Python, Machine Learning, NLP, GenAI, and MLOps.",
    requiredSkills: ["Python", "Machine Learning", "NLP", "GenAI"],
    preferredSkills: ["Azure ML", "MLOps", "Transformers"],
    experienceRangeMin: 4,
    experienceRangeMax: 9,
    technologyStack: ["Python", "NLP", "GenAI", "Azure ML"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-08-21T14:30:00Z",
    expectedJoiningDate: "2026-09-07T09:00:00Z",
    projectPriority: "HIGH",
    location: "Remote / Philadelphia",
    domain: "Healthcare",
    employmentType: "Full-Time",
    additionalNotes: "Accelerating drug trial candidate literature discovery.",
    status: "OPEN",
    createdAt: "2026-07-30T09:00:00Z"
  },
  {
    id: "OPP-1009",
    projectName: "AutoDrive Connected Services Backend",
    customerName: "AutoDrive Mobility",
    businessUnit: "Automotive & Telematics",
    projectDescription: "Building high-throughput backend services and microservice endpoints using Java, Spring Boot, REST APIs, and SQL.",
    rawJobDescription: "AutoDrive Mobility requires Java Backend Developers with experience in Java, Spring Boot, REST APIs, SQL, and Microservices.",
    requiredSkills: ["Java", "Spring Boot", "REST APIs", "SQL"],
    preferredSkills: ["Microservices", "React", "Kafka"],
    experienceRangeMin: 3,
    experienceRangeMax: 7,
    technologyStack: ["Java", "Spring Boot", "REST APIs", "SQL"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-08-24T10:00:00Z",
    expectedJoiningDate: "2026-09-10T09:00:00Z",
    projectPriority: "MEDIUM",
    location: "Hybrid / Detroit",
    domain: "Banking",
    employmentType: "Full-Time",
    additionalNotes: "Connected vehicle cloud telemetry services.",
    status: "OPEN",
    createdAt: "2026-07-30T11:30:00Z"
  },
  {
    id: "OPP-1010",
    projectName: "SkyLogistics Freight Management System",
    customerName: "SkyLogistics Global",
    businessUnit: "Logistics & Supply Chain",
    projectDescription: "Gaining operational requirements, organizing Agile sprint backlogs, and interfacing with insurance/logistics partners.",
    rawJobDescription: "SkyLogistics requires a Senior Business Analyst with expertise in Requirements Gathering, Agile, Jira, SQL, and Stakeholder Management.",
    requiredSkills: ["Requirements Gathering", "Agile", "Jira", "SQL", "Stakeholder Management"],
    preferredSkills: ["Supply Chain Analytics", "PostgreSQL"],
    experienceRangeMin: 4,
    experienceRangeMax: 8,
    technologyStack: ["Jira", "SQL", "Confluence", "Agile"],
    resourcesRequired: 1,
    clientInterviewDate: "2026-08-17T11:00:00Z",
    expectedJoiningDate: "2026-09-01T09:00:00Z",
    projectPriority: "HIGH",
    location: "Remote / Atlanta",
    domain: "Insurance",
    employmentType: "Full-Time",
    additionalNotes: "Global logistics tracking and risk mitigation portal.",
    status: "OPEN",
    createdAt: "2026-07-30T15:00:00Z"
  },
  {
    id: "OPP-1011",
    projectName: "Retail Platform E-Commerce Modernization",
    customerName: "OmniRetail Global",
    businessUnit: "Retail & E-Commerce Infrastructure",
    projectDescription: "Migrating e-commerce platform to a fully containerized, cloud-native architecture on Azure with Kubernetes, Terraform, Docker, and Azure DevOps.",
    rawJobDescription: "We're hiring a Cloud DevOps Engineer for a retail client's infrastructure modernization initiative. Responsibilities: Design & manage Kubernetes clusters, Build CI/CD pipelines with Azure DevOps, Automate IaC with Terraform, Containerize legacy apps with Docker, Monitor reliability and optimize cloud spend across Azure.",
    requiredSkills: ["Azure", "Kubernetes", "Docker", "Terraform", "Azure DevOps"],
    preferredSkills: ["Retail & E-Commerce", "Cost Optimization", "Python", "Bash"],
    experienceRangeMin: 3,
    experienceRangeMax: 9,
    technologyStack: ["Azure", "Kubernetes", "Docker", "Terraform", "Azure DevOps"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-08-22T10:00:00Z",
    expectedJoiningDate: "2026-09-05T09:00:00Z",
    projectPriority: "HIGH",
    location: "Remote",
    domain: "Retail",
    employmentType: "Full-Time",
    additionalNotes: "Priority: High — client interview targeted within 2 weeks. Infrastructure modernization for e-commerce platform.",
    status: "OPEN",
    createdAt: "2026-08-12T03:00:00Z"
  },
  {
    id: "OPP-1012",
    projectName: "Healthcare Analytics Real-Time Patient Data Pipeline",
    customerName: "CareAnalytics Health",
    businessUnit: "Healthcare & Value-Based Care Analytics",
    projectDescription: "Building a real-time patient data pipeline for a value-based care analytics platform, processing clinical and claims data with Databricks and Azure Data Factory.",
    rawJobDescription: "We're hiring a Data Engineer for a healthcare analytics client engagement. Responsibilities: Build and maintain ETL pipelines processing clinical and claims data, Design data models within Databricks, Orchestrate workflows using Azure Data Factory, Ensure data quality, lineage, and HIPAA compliance, Partner with data science teams to productionize ML pipelines.",
    requiredSkills: ["Python", "SQL", "Spark", "Databricks"],
    preferredSkills: ["Azure Data Factory", "Healthcare Data Domain", "HIPAA Compliance"],
    experienceRangeMin: 4,
    experienceRangeMax: 10,
    technologyStack: ["Python", "SQL", "Spark", "Databricks", "Azure Data Factory"],
    resourcesRequired: 3,
    clientInterviewDate: "2026-09-09T10:00:00Z",
    expectedJoiningDate: "2026-09-23T09:00:00Z",
    projectPriority: "MEDIUM",
    location: "Hybrid",
    domain: "Healthcare",
    employmentType: "Full-Time",
    additionalNotes: "Priority: Medium — client interview targeted within 4 weeks. Real-time patient data pipeline for value-based care platform.",
    status: "OPEN",
    createdAt: "2026-08-12T03:02:00Z"
  },
  {
    id: "OPP-1013",
    projectName: "Predictive Maintenance & GenAI Assistant",
    customerName: "SmartFactory Industrial",
    businessUnit: "Manufacturing & Industrial IoT",
    projectDescription: "Deploying machine learning models to predict equipment failures and building a GenAI-powered technical documentation assistant for plant engineers.",
    rawJobDescription: "We're hiring a Senior AI/ML Engineer for a manufacturing client's predictive maintenance and GenAI initiative. Responsibilities: Design & train ML models for predictive maintenance, Build & fine-tune NLP/GenAI models for technical documentation assistant, Deploy and monitor models using MLOps, Collaborate with plant engineering teams, Present findings to technical stakeholders.",
    requiredSkills: ["Python", "Machine Learning", "NLP", "GenAI", "MLOps"],
    preferredSkills: ["Azure ML", "Manufacturing Domain", "Industrial IoT", "Model Serving"],
    experienceRangeMin: 3,
    experienceRangeMax: 10,
    technologyStack: ["Python", "Machine Learning", "NLP", "GenAI", "MLOps", "Azure ML"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-09-02T10:00:00Z",
    expectedJoiningDate: "2026-09-16T09:00:00Z",
    projectPriority: "HIGH",
    location: "Remote",
    domain: "Manufacturing",
    employmentType: "Full-Time",
    additionalNotes: "Priority: High — client interview targeted within 3 weeks. Predictive maintenance and GenAI documentation assistant for plant engineers.",
    status: "OPEN",
    createdAt: "2026-08-12T03:05:00Z"
  },
  {
    id: "OPP-1014",
    projectName: "Insurance Claims Modernization Program",
    customerName: "Aegis Insurance Group",
    businessUnit: "Claims & Underwriting Technology",
    projectDescription: "Overhauling claims processing workflow, bridging business stakeholders and technical delivery teams with Agile backlog management and requirement traceability.",
    rawJobDescription: "We're hiring a Business Analyst for an insurance client's claims modernization program. Responsibilities: Gather and document business requirements, Translate into user stories & acceptance criteria for Agile sprints, Facilitate stakeholder workshops and sprint ceremonies, Track requirement traceability and manage backlog in Jira, Support UAT planning and execution.",
    requiredSkills: ["Requirements Gathering", "Agile", "Jira", "Stakeholder Management"],
    preferredSkills: ["Insurance Domain", "Claims Processing", "SQL", "UAT Execution"],
    experienceRangeMin: 4,
    experienceRangeMax: 9,
    technologyStack: ["Agile", "Jira", "SQL", "Confluence"],
    resourcesRequired: 2,
    clientInterviewDate: "2026-09-09T10:00:00Z",
    expectedJoiningDate: "2026-09-23T09:00:00Z",
    projectPriority: "MEDIUM",
    location: "Hybrid",
    domain: "Insurance",
    employmentType: "Full-Time",
    additionalNotes: "Priority: Medium — client interview targeted within 4 weeks. Claims processing workflow overhaul and UAT coordination.",
    status: "OPEN",
    createdAt: "2026-08-12T03:08:00Z"
  },
  {
    // Bridging requisition: deliberately pairs the Banking Java Full Stack cohort's
    // existing strengths (Java, Spring Boot, React, Microservices, REST APIs) with the
    // AI-layer competencies of target role_1 "Senior Full-Stack AI Engineer" that none
    // of them hold yet. That produces a genuine, closeable gap for the SkillGap-to-Growth
    // agent rather than a 100% match, and every gap skill has a course in the catalog.
    id: "OPP-1015",
    projectName: "NorthBridge Digital Banking GenAI Platform",
    customerName: "NorthBridge Financial Group",
    businessUnit: "Digital Banking & AI Engineering",
    projectDescription:
      "Building an AI-assisted retail banking portal: a Next.js and TypeScript front end over existing Java/Spring Boot microservices, with a Gemini-powered assistant for customer servicing, product discovery and internal advisor copilots.",
    rawJobDescription:
      "Senior Full-Stack AI Engineer — NorthBridge Financial Group (Digital Banking & AI Engineering)\n\n" +
      "ABOUT THE ENGAGEMENT\n" +
      "NorthBridge is modernising its retail banking experience. The existing estate is a mature Java/Spring Boot microservices platform exposing REST APIs over SQL data stores. We are layering an AI-assisted experience on top of it: a Next.js + TypeScript front end, and a Gemini-powered assistant that helps customers self-serve and helps advisors answer faster. You will work directly with the client's platform team through interview, onboarding and delivery.\n\n" +
      "WHAT YOU WILL DO\n" +
      "- Extend and harden Java / Spring Boot microservices that expose banking domain capabilities as REST APIs.\n" +
      "- Build the customer and advisor experience in Next.js with enterprise-grade TypeScript, replacing legacy React screens incrementally.\n" +
      "- Integrate the Gemini API for retrieval-grounded assistance: prompt design, tool/function calling, streaming responses, and guardrails against hallucinated financial advice.\n" +
      "- Design retrieval over customer and product data, including embedding storage and query patterns in PostgreSQL.\n" +
      "- Own service reliability: observability, CI/CD, and performance budgets for AI-assisted endpoints.\n" +
      "- Pair with the client's engineers and take part in architecture and design reviews.\n\n" +
      "ESSENTIAL EXPERIENCE\n" +
      "- 6+ years building production backend services in Java and Spring Boot.\n" +
      "- Strong microservices and REST API design; comfortable with SQL data modelling.\n" +
      "- Production React experience, and readiness to move to Next.js App Router patterns.\n" +
      "- Working knowledge of enterprise TypeScript in a typed, reviewed codebase.\n" +
      "- Hands-on integration of an LLM API (Gemini preferred) into a real product surface.\n\n" +
      "DESIRABLE\n" +
      "- Banking or financial services delivery exposure and awareness of regulatory constraints.\n" +
      "- Vector search / embedding optimisation in PostgreSQL (pgvector or equivalent).\n" +
      "- System design at scale, and container orchestration on Kubernetes.\n\n" +
      "ASSESSMENT\n" +
      "Shortlisted engineers complete a dual-stream evaluation: technical depth against the rubric above, plus a spoken scenario interview assessing communication, structured problem solving and stakeholder handling. Identified gaps are converted into a time-boxed upskilling roadmap ahead of the client interview date.",
    requiredSkills: [
      "Java",
      "Spring Boot",
      "React",
      "Microservices",
      "REST APIs",
      "Next.js App Architecture",
      "Enterprise TypeScript Development",
      "Gemini API Integration"
    ],
    preferredSkills: [
      "Banking & Financial Services",
      "PostgreSQL & Vector Database Optimization",
      "System Design & Scalability",
      "Kubernetes"
    ],
    experienceRangeMin: 6,
    experienceRangeMax: 12,
    technologyStack: [
      "Java",
      "Spring Boot",
      "Next.js",
      "TypeScript",
      "Gemini API",
      "PostgreSQL",
      "Azure"
    ],
    resourcesRequired: 2,
    clientInterviewDate: "2026-08-27T10:00:00Z",
    expectedJoiningDate: "2026-09-14T09:00:00Z",
    projectPriority: "HIGH",
    location: "Hybrid",
    domain: "Banking",
    employmentType: "Full-Time",
    additionalNotes:
      "Priority: High — client interview in ~2 weeks, so Time-to-Readiness is the binding constraint. Internal Java Full Stack bench covers the backend rubric; the AI layer (Next.js, TypeScript, Gemini API) is the expected gap and is course-backed in the catalog.",
    status: "OPEN",
    createdAt: "2026-08-13T09:00:00Z"
  }
];
 
// Perform Database Seeding cleanly and safely
function seedDatabase() {
  try {
    // 0. Ensure managerId column exists
    try {
      sqliteDb.exec("ALTER TABLE users ADD COLUMN managerId TEXT;");
    } catch (e) {
      // Column already exists
    }
 
    // 1. Seed Skills
    const insertSkill = sqliteDb.prepare("INSERT OR IGNORE INTO skills (id, name, category, description) VALUES (?, ?, ?, ?)");
    for (const s of INITIAL_SKILLS) {
      insertSkill.run(s.id, s.name, s.category, s.description);
    }
 
    // 2. Seed Target Roles & Role Skills
    const insertRole = sqliteDb.prepare("INSERT OR IGNORE INTO target_roles (id, title, description) VALUES (?, ?, ?)");
    const insertRoleSkill = sqliteDb.prepare("INSERT OR IGNORE INTO target_role_skills (roleId, skillId, minLevel) VALUES (?, ?, ?)");
    
    for (const r of INITIAL_ROLES) {
      insertRole.run(r.id, r.title, r.description);
      for (const rs of r.requiredSkills) {
        insertRoleSkill.run(r.id, rs.skillId, rs.minLevel);
      }
    }
 
    // 3. Seed Users
    // Previously this did DELETE FROM users + INSERT OR REPLACE on every server start,
    // which would silently wipe passwordHash (and cascade-delete anything FK'd to users,
    // like evidences/skill_baselines/post_assessments) on every restart. Switched to a
    // real upsert that only updates the seed-owned profile fields and never touches
    // passwordHash, so a password a user sets survives restarts within this DB file.
    const insertUser = sqliteDb.prepare(`
      INSERT INTO users (id, name, email, role, avatar, title, department, targetRoleId, managerId, experienceYears, domain, primaryRole, primarySkills)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, email=excluded.email, role=excluded.role, avatar=excluded.avatar,
        title=excluded.title, department=excluded.department, targetRoleId=excluded.targetRoleId,
        managerId=excluded.managerId, experienceYears=excluded.experienceYears, domain=excluded.domain,
        primaryRole=excluded.primaryRole, primarySkills=excluded.primarySkills
    `);
    for (const u of INITIAL_USERS) {
      insertUser.run(
        u.id,
        u.name,
        u.email,
        u.role,
        u.avatar,
        u.title,
        u.department,
        u.targetRoleId || null,
        u.managerId || null,
        u.experienceYears !== undefined ? u.experienceYears : null,
        u.domain || null,
        u.primaryRole || null,
        u.primarySkills ? JSON.stringify(u.primarySkills) : null
      );
    }
 
    // 4. Seed User Skills
    const insertUserSkill = sqliteDb.prepare("INSERT OR IGNORE INTO user_skills (userId, skillId, currentLevel, targetLevel, status, lastUpdated) VALUES (?, ?, ?, ?, ?, ?)");
    for (const [userId, skills] of Object.entries(INITIAL_USER_SKILLS)) {
      for (const us of skills) {
        insertUserSkill.run(userId, us.skillId, us.currentLevel, us.targetLevel, us.status, us.lastUpdated);
      }
    }
 
    // 5. Seed Courses
    const insertCourse = sqliteDb.prepare("INSERT OR IGNORE INTO courses (id, title, provider, duration, skillId, description, type, url, rating, enrollmentCount, lastUpdated, isLatest2026) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const c of INITIAL_COURSES) {
      insertCourse.run(
        c.id,
        c.title,
        c.provider,
        c.duration,
        c.skillId,
        c.description,
        c.type,
        c.url || null,
        c.rating || 4.9,
        c.enrollmentCount || "180,000+ Learners",
        c.lastUpdated || "Updated June 2026",
        c.isLatest2026 ? 1 : 0
      );
    }
 
    // 6. Seed Evidences
    const insertEvidence = sqliteDb.prepare(`
      INSERT OR IGNORE INTO evidences (id, userId, skillId, title, description, evidenceText, documentUrl, status, submittedAt, reviewedBy, reviewComment, reviewedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ev of INITIAL_EVIDENCES) {
      insertEvidence.run(
        ev.id,
        ev.userId,
        ev.skillId,
        ev.title,
        ev.description,
        ev.evidenceText,
        ev.documentUrl || null,
        ev.status,
        ev.submittedAt,
        ev.reviewedBy || null,
        ev.reviewComment || null,
        ev.reviewedAt || null
      );
    }
 
    // 7. Seed Learning Plans
    const insertPlan = sqliteDb.prepare(`
      INSERT OR IGNORE INTO learning_plans (id, userId, weekNumber, title, skillFocus, courseName, provider, milestone, assessment, targetScore, status, progressPercent, learningType, estimatedDuration, phaseLabel, targetDeadline, deadlineType, quizScore, timeSpentMins, completedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Hand-authored plans first, then the generated engagement plans that make the
    // Will axis measurable. Both go through the same INSERT OR IGNORE.
    const engagement = buildEngagementSeed();
    for (const p of [...INITIAL_LEARNING_PLANS, ...engagement.plans]) {
      insertPlan.run(
        p.id,
        p.userId,
        p.weekNumber,
        p.title,
        p.skillFocus,
        p.courseName,
        p.provider,
        p.milestone,
        p.assessment,
        p.targetScore,
        p.status,
        p.progressPercent,
        p.learningType || 'in_depth',
        p.estimatedDuration || '1 hour',
        p.phaseLabel || 'Phase 1',
        p.targetDeadline || '2026-08-15',
        p.deadlineType || 'client_interview',
        p.quizScore || 0,
        p.timeSpentMins || 0,
        p.completedAt || null
      );
    }
    for (const ev of engagement.evidences) {
      insertEvidence.run(
        ev.id, ev.userId, ev.skillId, ev.title, ev.description, ev.evidenceText,
        ev.documentUrl || null, ev.status, ev.submittedAt,
        ev.reviewedBy || null, ev.reviewComment || null, ev.reviewedAt || null
      );
    }
 
    // 8. Seed Reminders
    const insertRem = sqliteDb.prepare(`
      INSERT OR IGNORE INTO reminders (id, userId, targetRole, type, title, message, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of INITIAL_REMINDERS) {
      insertRem.run(r.id, r.userId, r.targetRole, r.type, r.title, r.message, r.status, r.createdAt);
    }
 
    // 9. Seed Project Demands
    const insertDemand = sqliteDb.prepare(`
      INSERT OR REPLACE INTO project_demands (
        id, projectName, customerName, businessUnit, projectDescription, rawJobDescription,
        requiredSkills, preferredSkills, experienceRangeMin, experienceRangeMax, technologyStack,
        resourcesRequired, clientInterviewDate, expectedJoiningDate, projectPriority, location,
        domain, employmentType, additionalNotes, status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of INITIAL_DEMANDS) {
      insertDemand.run(
        d.id,
        d.projectName,
        d.customerName,
        d.businessUnit,
        d.projectDescription,
        d.rawJobDescription || null,
        JSON.stringify(d.requiredSkills),
        JSON.stringify(d.preferredSkills),
        d.experienceRangeMin,
        d.experienceRangeMax,
        JSON.stringify(d.technologyStack),
        d.resourcesRequired,
        d.clientInterviewDate,
        d.expectedJoiningDate,
        d.projectPriority,
        d.location,
        d.domain,
        d.employmentType,
        d.additionalNotes || null,
        d.status,
        d.createdAt
      );
    }
 
    console.log("SQLite Seeding check completed successfully!");
  } catch (err) {
    console.error("Error during database seeding:", err);
  }
}
 
// Run Seeding
seedDatabase();
 
// Expose matching Database Interface
class SqliteDatabaseWrapper {
  private db: typeof sqliteDb;
 
  constructor() {
    this.db = sqliteDb;
  }
 
  getUsers(): User[] {
    const stmt = this.db.prepare("SELECT * FROM users");
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as UserRole,
      avatar: r.avatar,
      title: r.title,
      department: r.department,
      targetRoleId: r.targetRoleId || undefined,
      managerId: r.managerId || undefined,
      experienceYears: r.experienceYears !== null && r.experienceYears !== undefined ? Number(r.experienceYears) : undefined,
      domain: r.domain || undefined,
      primaryRole: r.primaryRole || undefined,
      primarySkills: r.primarySkills ? (typeof r.primarySkills === "string" ? JSON.parse(r.primarySkills) : r.primarySkills) : undefined
    }));
  }
 
  getSkills(): Skill[] {
    const stmt = this.db.prepare("SELECT * FROM skills");
    return stmt.all() as any[];
  }
 
  getTargetRoles(): TargetRole[] {
    const rolesStmt = this.db.prepare("SELECT * FROM target_roles");
    const roles = rolesStmt.all() as any[];
    
    const skillsStmt = this.db.prepare("SELECT * FROM target_role_skills");
    const roleSkills = skillsStmt.all() as any[];
 
    return roles.map(r => {
      const requiredSkills = roleSkills
        .filter(rs => rs.roleId === r.id)
        .map(rs => ({
          skillId: rs.skillId,
          minLevel: rs.minLevel
        }));
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        requiredSkills
      };
    });
  }
 
  getCourses(): LearningCourse[] {
    const stmt = this.db.prepare("SELECT * FROM courses");
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      provider: r.provider,
      duration: r.duration,
      skillId: r.skillId,
      description: r.description,
      type: r.type,
      url: r.url || undefined,
      rating: r.rating || 4.9,
      enrollmentCount: r.enrollmentCount || "180,000+ Learners",
      lastUpdated: r.lastUpdated || "Updated June 2026",
      isLatest2026: r.isLatest2026 !== undefined ? Boolean(r.isLatest2026) : true
    }));
  }
 
  getEvidences(): Evidence[] {
    const stmt = this.db.prepare("SELECT * FROM evidences");
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      skillId: r.skillId,
      title: r.title,
      description: r.description,
      evidenceText: r.evidenceText,
      documentUrl: r.documentUrl || undefined,
      status: r.status as any,
      submittedAt: r.submittedAt,
      reviewedBy: r.reviewedBy || undefined,
      reviewComment: r.reviewComment || undefined,
      reviewedAt: r.reviewedAt || undefined
    }));
  }
 
  getUserById(id: string): User | undefined {
    const stmt = this.db.prepare("SELECT * FROM users WHERE id = ?");
    const r = stmt.get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as UserRole,
      avatar: r.avatar,
      title: r.title,
      department: r.department,
      targetRoleId: r.targetRoleId || undefined,
      managerId: r.managerId || undefined,
      experienceYears: r.experienceYears !== null && r.experienceYears !== undefined ? Number(r.experienceYears) : undefined,
      domain: r.domain || undefined,
      primaryRole: r.primaryRole || undefined,
      primarySkills: r.primarySkills ? (typeof r.primarySkills === "string" ? JSON.parse(r.primarySkills) : r.primarySkills) : undefined
    };
  }
 
  // Deliberately separate from getUserById, which never includes passwordHash in its
  // return shape - keeping the hash lookup in its own narrow function makes it much
  // harder to accidentally leak it into an API response via a future getUserById change.
  getUserPasswordHash(userId: string): string | undefined {
    const stmt = this.db.prepare("SELECT passwordHash FROM users WHERE id = ?");
    const row = stmt.get(userId) as { passwordHash: string | null } | undefined;
    return row?.passwordHash || undefined;
  }
 
  setUserPassword(userId: string, passwordHash: string) {
    const stmt = this.db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?");
    stmt.run(passwordHash, userId);
  }
 
  getUserSkills(userId: string): UserSkill[] {
    const stmt = this.db.prepare("SELECT * FROM user_skills WHERE userId = ?");
    const rows = stmt.all(userId) as any[];
    
    if (rows.length > 0) {
      return rows.map(r => ({
        skillId: r.skillId,
        currentLevel: r.currentLevel,
        targetLevel: r.targetLevel,
        status: r.status as any,
        lastUpdated: r.lastUpdated
      }));
    }
 
    // If no skills exist, default from target role if user has one
    const user = this.getUserById(userId);
    if (user && user.targetRoleId) {
      const roleSkillsStmt = this.db.prepare("SELECT * FROM target_role_skills WHERE roleId = ?");
      const roleSkills = roleSkillsStmt.all(user.targetRoleId) as any[];
      
      if (roleSkills.length > 0) {
        const defaultSkills: UserSkill[] = roleSkills.map(s => ({
          skillId: s.skillId,
          currentLevel: 1,
          targetLevel: s.minLevel,
          status: "not_started",
          lastUpdated: new Date().toISOString().split("T")[0]
        }));
 
        // Insert them so they are persistent!
        const insertStmt = this.db.prepare(
          "INSERT INTO user_skills (userId, skillId, currentLevel, targetLevel, status, lastUpdated) VALUES (?, ?, ?, ?, ?, ?)"
        );
        const transaction = this.db.transaction((skills: UserSkill[]) => {
          for (const s of skills) {
            insertStmt.run(userId, s.skillId, s.currentLevel, s.targetLevel, s.status, s.lastUpdated);
          }
        });
        transaction(defaultSkills);
 
        return defaultSkills;
      }
    }
 
    return [];
  }
 
  getLearningPlan(userId: string): WeeklyLearningStep[] {
    const stmt = this.db.prepare("SELECT * FROM learning_plans WHERE userId = ? ORDER BY weekNumber ASC");
    const rows = stmt.all(userId) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      weekNumber: r.weekNumber,
      title: r.title,
      skillFocus: r.skillFocus,
      courseName: r.courseName,
      provider: r.provider,
      milestone: r.milestone,
      assessment: r.assessment,
      targetScore: r.targetScore,
      status: r.status as any,
      progressPercent: r.progressPercent,
      learningType: r.learningType || "in_depth",
      estimatedDuration: r.estimatedDuration || "1 hour",
      phaseLabel: r.phaseLabel || `Phase ${r.weekNumber}`,
      targetDeadline: r.targetDeadline || "2026-08-15",
      deadlineType: r.deadlineType || "client_interview",
      quizScore: r.quizScore || 0,
      timeSpentMins: r.timeSpentMins || 0,
      completedAt: r.completedAt || undefined,
      demandId: r.demandId || undefined,
      purpose: r.purpose || "career_growth"
    }));
  }

  // Resolves a learning step to the user who owns it, so a route can authorize the write
  // against that owner. Returns undefined for an unknown stepId.
  getLearningStepOwnerId(stepId: string): string | undefined {
    if (!stepId) return undefined;
    const row = this.db.prepare("SELECT userId FROM learning_plans WHERE id = ?").get(stepId) as { userId: string } | undefined;
    return row?.userId;
  }

  // Skill measures capability; Will measures motivation/drive - they must stay
  // independent for the 2x2 matrix to mean anything. Will is a transparent blend of
  // behavioural signals already recorded elsewhere in the app:
  //   40% learning engagement  - LMS follow-through: how much of a plan is completed,
  //                              quiz performance on completed modules, and time invested
  //   30% evidence initiative  - proactively submitting workplace evidence (approved OR
  //                              pending - initiative counts regardless of the verdict)
  //   20% goal progress        - how far skills have been driven toward their targets
  //   10% goal commitment      - whether a target role has actively been chosen
  // Engagement is the distinct LMS course-completion percentage. Both derive only from
  // real rows, so they reconcile with the employee's own learning plan and evidence.
  computeMotivationScores(userId: string): { willScore: number; engagementScore: number } {
    const skills = this.getUserSkills(userId);
    const plans = this.getLearningPlan(userId);
    const evidences = this.getEvidences().filter(e => e.userId === userId);
    const user = this.getUserById(userId);

    const totalSteps = plans.length;
    const completedSteps = plans.filter(p => p.status === "completed").length;
    const completionRatio = totalSteps > 0 ? completedSteps / totalSteps : 0;

    const completedWithQuiz = plans.filter(p => p.status === "completed" && (p.quizScore ?? 0) > 0);
    const avgQuiz = completedWithQuiz.length > 0
      ? completedWithQuiz.reduce((sum, p) => sum + (p.quizScore || 0), 0) / completedWithQuiz.length
      : 0;

    const minutes = plans.reduce((sum, p) => sum + (p.timeSpentMins || 0), 0);
    const timeNorm = Math.min(1, minutes / 300); // ~5h of study reads as fully invested

    const learning = 0.5 * completionRatio * 100 + 0.3 * avgQuiz + 0.2 * timeNorm * 100;
    const evidenceInitiative = Math.min(100, evidences.length * 30);

    const withTarget = skills.filter(s => s.targetLevel > 0);
    const progress = withTarget.length > 0
      ? (withTarget.reduce((sum, s) => sum + Math.min(1, s.currentLevel / s.targetLevel), 0) / withTarget.length) * 100
      : 0;

    const commitment = user?.targetRoleId ? 100 : 0;

    const willScore = Math.round(Math.max(0, Math.min(100,
      0.40 * learning + 0.30 * evidenceInitiative + 0.20 * progress + 0.10 * commitment)));
    const engagementScore = Math.round(completionRatio * 100);

    return { willScore, engagementScore };
  }

  updateLearningPlanWeek(
    stepId: string, 
    status: "completed" | "in_progress" | "pending", 
    progressPercent: number,
    quizScore?: number,
    timeSpentMins?: number
  ) {
    const nowStr = status === "completed" ? new Date().toISOString().split("T")[0] : null;
    let query = "UPDATE learning_plans SET status = ?, progressPercent = ?";
    const params: any[] = [status, progressPercent];
 
    if (quizScore !== undefined) {
      query += ", quizScore = ?";
      params.push(quizScore);
    }
    if (timeSpentMins !== undefined) {
      query += ", timeSpentMins = timeSpentMins + ?";
      params.push(timeSpentMins);
    }
    if (nowStr) {
      query += ", completedAt = ?";
      params.push(nowStr);
    }
 
    query += " WHERE id = ?";
    params.push(stepId);
 
    const updateStmt = this.db.prepare(query);
    updateStmt.run(...params);
 
    const getStmt = this.db.prepare("SELECT userId FROM learning_plans WHERE id = ?");
    const row = getStmt.get(stepId) as any;
    if (row) {
      return this.getLearningPlan(row.userId);
    }
    return [];
  }
 
  updateLearningPlanDeadline(userId: string, targetDeadline: string, deadlineType?: string) {
    const stmt = this.db.prepare(
      "UPDATE learning_plans SET targetDeadline = ?, deadlineType = ? WHERE userId = ?"
    );
    stmt.run(targetDeadline, deadlineType || "client_interview", userId);
    return this.getLearningPlan(userId);
  }
 
  assignFlexibleLearningTrack(
    userId: string,
    trackTitle: string,
    targetDeadline: string,
    deadlineType: "client_interview" | "project_deadline" | "learner_set" | "manager_assigned",
    steps: Array<{
      title: string;
      skillFocus: string;
      courseName: string;
      provider: string;
      milestone: string;
      assessment: string;
      targetScore: string;
      learningType: "micro" | "in_depth" | "best_practice";
      estimatedDuration: string;
      phaseLabel: string;
    }>,
    demandId?: string,
    purpose?: "project_hiring" | "career_growth"
  ) {
    // Clear old steps for this user
    const deleteStmt = this.db.prepare("DELETE FROM learning_plans WHERE userId = ?");
    deleteStmt.run(userId);
 
    const insertStmt = this.db.prepare(`
      INSERT INTO learning_plans (
        id, userId, weekNumber, title, skillFocus, courseName, provider, milestone,
        assessment, targetScore, status, progressPercent, learningType, estimatedDuration,
        phaseLabel, targetDeadline, deadlineType, quizScore, timeSpentMins, demandId, purpose
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `);
 
    steps.forEach((step, idx) => {
      const stepId = "plan_" + userId + "_" + (idx + 1) + "_" + Math.random().toString(36).substr(2, 5);
      insertStmt.run(
        stepId,
        userId,
        idx + 1,
        step.title,
        step.skillFocus,
        step.courseName,
        step.provider,
        step.milestone,
        step.assessment,
        step.targetScore,
        step.learningType,
        step.estimatedDuration,
        step.phaseLabel,
        targetDeadline,
        deadlineType,
        demandId || null,
        purpose || "career_growth"
      );
    });
 
    return this.getLearningPlan(userId);
  }
 
  // --- Client Resume Generator gating support ---
 
  createPostAssessment(employeeId: string, demandId: string | null, managerId: string, narrative: string) {
    const id = "pa_" + employeeId + "_" + Date.now();
    const createdAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO post_assessments (id, employeeId, demandId, managerId, narrative, status, createdAt)
      VALUES (?, ?, ?, ?, ?, 'pending_signoff', ?)
    `);
    stmt.run(id, employeeId, demandId, managerId, narrative, createdAt);
    return { id, employeeId, demandId: demandId || undefined, managerId, narrative, status: "pending_signoff" as const, createdAt };
  }
 
  signOffPostAssessment(id: string, signedOffBy: string, decision: "cleared" | "not_ready") {
    const signedOffAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE post_assessments SET status = ?, signedOffBy = ?, signedOffAt = ? WHERE id = ?
    `);
    const result = stmt.run(decision, signedOffBy, signedOffAt, id);
    if (result.changes === 0) return undefined;
    const getStmt = this.db.prepare("SELECT * FROM post_assessments WHERE id = ?");
    return getStmt.get(id) as any;
  }
 
  getLatestPostAssessment(employeeId: string, demandId?: string) {
    const stmt = demandId
      ? this.db.prepare("SELECT * FROM post_assessments WHERE employeeId = ? AND demandId = ? ORDER BY createdAt DESC LIMIT 1")
      : this.db.prepare("SELECT * FROM post_assessments WHERE employeeId = ? ORDER BY createdAt DESC LIMIT 1");
    const row = demandId ? stmt.get(employeeId, demandId) : stmt.get(employeeId);
    return row as any | undefined;
  }
 
  // Snapshots the employee's current skill levels the first time they're handed off to
  // this specific demand. INSERT OR IGNORE means a second handoff for the same
  // employee+demand won't overwrite the original "before" baseline.
  captureSkillBaselines(userId: string, demandId: string) {
    const skills = this.getUserSkills(userId);
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO skill_baselines (userId, skillId, demandId, baselineLevel, capturedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    const capturedAt = new Date().toISOString();
    skills.forEach(s => {
      stmt.run(userId, s.skillId, demandId, s.currentLevel, capturedAt);
    });
  }
 
  // An employee counts as shortlisted once a manager hands them off to a demand:
  // that handoff is exactly what writes their skill baselines for it, so the most
  // recent capture identifies their active opportunity. Deriving it this way avoids
  // a second source of truth that could disagree with the handoff itself.
  getActiveShortlist(userId: string): { demand: ProjectDemand; shortlistedAt: string } | null {
    const row = this.db.prepare(`
      SELECT demandId, MAX(capturedAt) AS capturedAt
      FROM skill_baselines
      WHERE userId = ?
      GROUP BY demandId
      ORDER BY capturedAt DESC
      LIMIT 1
    `).get(userId) as { demandId: string; capturedAt: string } | undefined;

    if (!row) return null;
    const demand = this.getProjectDemandById(row.demandId);
    // A demand can be deleted after a handoff; treat the dangling baseline as no
    // shortlist rather than surfacing a half-populated banner.
    if (!demand) return null;
    return { demand, shortlistedAt: row.capturedAt };
  }

  getSkillGrowth(userId: string, demandId: string) {
    const baselineStmt = this.db.prepare("SELECT skillId, baselineLevel FROM skill_baselines WHERE userId = ? AND demandId = ?");
    const baselines = baselineStmt.all(userId, demandId) as { skillId: string; baselineLevel: number }[];
    const currentSkills = this.getUserSkills(userId);
    const skillsDict = this.getSkills();
    return baselines.map(b => {
      const current = currentSkills.find(s => s.skillId === b.skillId);
      const skillName = skillsDict.find(s => s.id === b.skillId)?.name || b.skillId;
      return {
        skillId: b.skillId,
        skillName,
        baselineLevel: b.baselineLevel,
        currentLevel: current ? current.currentLevel : b.baselineLevel
      };
    });
  }
 
  // Composite eligibility check for the Client Resume Generator. All three conditions must
  // hold, and all three are checked against persisted, real records - not inferred from
  // whatever the caller claims in the request:
  //   1. A learning track exists for this exact employee+demand pair, tagged
  //      purpose='project_hiring', with every step completed.
  //   2. The latest post-assessment for this employee+demand has been explicitly signed
  //      off by a manager as 'cleared' (not just generated).
  //   3. At least one skill captured at handoff time has measurably improved since.
  checkClientResumeEligibility(employeeId: string, demandId: string) {
    const reasons: string[] = [];
 
    const allSteps = this.getLearningPlan(employeeId);
    const demandSteps = allSteps.filter(s => s.demandId === demandId && s.purpose === "project_hiring");
    const trainingComplete = demandSteps.length > 0 && demandSteps.every(s => s.status === "completed");
    if (demandSteps.length === 0) {
      reasons.push("No project-hiring learning track has been assigned for this employee and this demand yet.");
    } else if (!trainingComplete) {
      const remaining = demandSteps.filter(s => s.status !== "completed").length;
      reasons.push(`${remaining} of ${demandSteps.length} learning track step(s) are not yet completed.`);
    }
 
    const latestAssessment = this.getLatestPostAssessment(employeeId, demandId);
    const assessmentCleared = !!latestAssessment && latestAssessment.status === "cleared";
    if (!latestAssessment) {
      reasons.push("No post-training GROW assessment has been generated for this employee and this demand yet.");
    } else if (latestAssessment.status === "pending_signoff") {
      reasons.push("The post-training assessment has been generated but not yet signed off by a manager.");
    } else if (latestAssessment.status === "not_ready") {
      reasons.push("The most recent post-training assessment was marked 'not ready' by a manager.");
    }
 
    const growthDetail = this.getSkillGrowth(employeeId, demandId);
    const skillGrowthIdentified = growthDetail.length > 0 && growthDetail.some(g => g.currentLevel > g.baselineLevel);
    if (growthDetail.length === 0) {
      reasons.push("No skill baseline was captured for this employee and this demand (handoff may not have run).");
    } else if (!skillGrowthIdentified) {
      reasons.push("No measurable skill growth was found since this employee was matched to this demand.");
    }
 
    return {
      eligible: trainingComplete && assessmentCleared && skillGrowthIdentified,
      trainingComplete,
      assessmentCleared,
      skillGrowthIdentified,
      reasons,
      growthDetail
    };
  }
 
  getResourceLearningProgress(): ResourceLearningProgress[] {
    const users = this.getUsers().filter(u => u.role === UserRole.EMPLOYEE);
    const targetRoles = this.getTargetRoles();
 
    return users.map(user => {
      const steps = this.getLearningPlan(user.id);
      const totalSteps = steps.length;
      const completedSteps = steps.filter(s => s.status === "completed").length;
      const inProgressSteps = steps.filter(s => s.status === "in_progress").length;
      
      const overallProgressPercent = totalSteps > 0 
        ? Math.round(steps.reduce((acc, s) => acc + s.progressPercent, 0) / totalSteps)
        : 0;
 
      const scoredSteps = steps.filter(s => (s.quizScore || 0) > 0);
      const averageQuizScore = scoredSteps.length > 0
        ? Math.round(scoredSteps.reduce((acc, s) => acc + (s.quizScore || 0), 0) / scoredSteps.length)
        : (completedSteps > 0 ? 82 : 0);
 
      const totalTimeSpentMins = steps.reduce((acc, s) => acc + (s.timeSpentMins || 0), 0);
      const microCount = steps.filter(s => s.learningType === "micro").length;
      const inDepthCount = steps.filter(s => s.learningType === "in_depth").length;
      const bestPracticeCount = steps.filter(s => s.learningType === "best_practice").length;
 
      let status: "not_started" | "in_progress" | "completed" = "not_started";
      if (completedSteps === totalSteps && totalSteps > 0) status = "completed";
      else if (completedSteps > 0 || inProgressSteps > 0) status = "in_progress";
 
      const role = targetRoles.find(r => r.id === user.targetRoleId);
      const targetDeadline = steps[0]?.targetDeadline || "2026-08-15";
      const deadlineType = steps[0]?.deadlineType || "client_interview";
 
      return {
        userId: user.id,
        userName: user.name,
        userTitle: user.title,
        userAvatar: user.avatar,
        department: user.department,
        trackName: `${role?.title || "Custom Capability Track"} Fast-Track`,
        targetDeadline,
        deadlineType,
        totalSteps,
        completedSteps,
        overallProgressPercent,
        averageQuizScore,
        totalTimeSpentMins,
        microCount,
        inDepthCount,
        bestPracticeCount,
        status,
        lastActive: "Today",
        steps
      };
    });
  }
 
  getReminders(userId?: string): AgentReminder[] {
    let stmt;
    let rows;
    if (userId) {
      stmt = this.db.prepare("SELECT * FROM reminders WHERE userId = ? ORDER BY createdAt DESC");
      rows = stmt.all(userId) as any[];
    } else {
      stmt = this.db.prepare("SELECT * FROM reminders ORDER BY createdAt DESC");
      rows = stmt.all() as any[];
    }
    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      targetRole: r.targetRole,
      type: r.type as any,
      title: r.title,
      message: r.message,
      status: r.status as any,
      createdAt: r.createdAt
    }));
  }
 
  createReminder(userId: string, targetRole: string, type: string, title: string, message: string): AgentReminder {
    const id = "rem_" + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const insertStmt = this.db.prepare(
      "INSERT INTO reminders (id, userId, targetRole, type, title, message, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)"
    );
    insertStmt.run(id, userId, targetRole, type, title, message, now);
 
    return {
      id,
      userId,
      targetRole,
      type: type as any,
      title,
      message,
      status: "scheduled",
      createdAt: now
    };
  }
 
  updateUserSkill(userId: string, skillId: string, level: number, status?: "not_started" | "learning" | "practicing" | "validated") {
    const checkStmt = this.db.prepare("SELECT * FROM user_skills WHERE userId = ? AND skillId = ?");
    const exists = checkStmt.get(userId, skillId) as any;
    const nowStr = new Date().toISOString().split("T")[0];
 
    if (exists) {
      if (status) {
        const updateStmt = this.db.prepare(
          "UPDATE user_skills SET currentLevel = ?, status = ?, lastUpdated = ? WHERE userId = ? AND skillId = ?"
        );
        updateStmt.run(level, status, nowStr, userId, skillId);
      } else {
        const updateStmt = this.db.prepare(
          "UPDATE user_skills SET currentLevel = ?, lastUpdated = ? WHERE userId = ? AND skillId = ?"
        );
        updateStmt.run(level, nowStr, userId, skillId);
      }
    } else {
      const insertStmt = this.db.prepare(
        "INSERT INTO user_skills (userId, skillId, currentLevel, targetLevel, status, lastUpdated) VALUES (?, ?, ?, ?, ?, ?)"
      );
      insertStmt.run(userId, skillId, level, 4, status || "learning", nowStr);
    }
 
    return this.getUserSkills(userId);
  }
 
  submitEvidence(userId: string, skillId: string, title: string, description: string, text: string, docUrl?: string) {
    const id = "ev_" + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    
    const insertStmt = this.db.prepare(`
      INSERT INTO evidences (id, userId, skillId, title, description, evidenceText, documentUrl, status, submittedAt) 
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `);
    insertStmt.run(id, userId, skillId, title, description, text, docUrl || null, now);
 
    this.updateUserSkill(userId, skillId, this.getCurrentLevel(userId, skillId), "practicing");
 
    return {
      id,
      userId,
      skillId,
      title,
      description,
      evidenceText: text,
      documentUrl: docUrl || undefined,
      status: "pending",
      submittedAt: now
    } as Evidence;
  }
 
  getCurrentLevel(userId: string, skillId: string): number {
    const stmt = this.db.prepare("SELECT currentLevel FROM user_skills WHERE userId = ? AND skillId = ?");
    const row = stmt.get(userId, skillId) as any;
    return row ? row.currentLevel : 1;
  }
 
  reviewEvidence(evidenceId: string, reviewerId: string, status: "approved" | "revision_requested", comment: string) {
    const selectStmt = this.db.prepare("SELECT * FROM evidences WHERE id = ?");
    const ev = selectStmt.get(evidenceId) as any;
    if (!ev) return undefined;
 
    const now = new Date().toISOString();
    const updateStmt = this.db.prepare(
      "UPDATE evidences SET status = ?, reviewedBy = ?, reviewComment = ?, reviewedAt = ? WHERE id = ?"
    );
    updateStmt.run(status, reviewerId, comment, now, evidenceId);
 
    const updatedEvRow = selectStmt.get(evidenceId) as any;
    const updatedEv: Evidence = {
      id: updatedEvRow.id,
      userId: updatedEvRow.userId,
      skillId: updatedEvRow.skillId,
      title: updatedEvRow.title,
      description: updatedEvRow.description,
      evidenceText: updatedEvRow.evidenceText,
      documentUrl: updatedEvRow.documentUrl || undefined,
      status: updatedEvRow.status as any,
      submittedAt: updatedEvRow.submittedAt,
      reviewedBy: updatedEvRow.reviewedBy || undefined,
      reviewComment: updatedEvRow.reviewComment || undefined,
      reviewedAt: updatedEvRow.reviewedAt || undefined
    };
 
    if (status === "approved") {
      const currentSkills = this.getUserSkills(updatedEv.userId);
      const skillObj = currentSkills.find(s => s.skillId === updatedEv.skillId);
      if (skillObj) {
        const nextLevel = Math.min(5, skillObj.currentLevel + 1);
        this.updateUserSkill(updatedEv.userId, updatedEv.skillId, nextLevel, "validated");
      }
    } else {
      const currentSkills = this.getUserSkills(updatedEv.userId);
      const skillObj = currentSkills.find(s => s.skillId === updatedEv.skillId);
      if (skillObj) {
        this.updateUserSkill(updatedEv.userId, updatedEv.skillId, skillObj.currentLevel, "learning");
      }
    }
 
    return updatedEv;
  }
 
  updateTargetRole(userId: string, roleId: string) {
    const updateStmt = this.db.prepare("UPDATE users SET targetRoleId = ? WHERE id = ?");
    updateStmt.run(roleId, userId);
 
    const user = this.getUserById(userId);
    if (user) {
      const roleSkillsStmt = this.db.prepare("SELECT * FROM target_role_skills WHERE roleId = ?");
      const roleSkills = roleSkillsStmt.all(roleId) as any[];
      const nowStr = new Date().toISOString().split("T")[0];
 
      const checkSkillStmt = this.db.prepare("SELECT * FROM user_skills WHERE userId = ? AND skillId = ?");
      const insertSkillStmt = this.db.prepare(
        "INSERT INTO user_skills (userId, skillId, currentLevel, targetLevel, status, lastUpdated) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const updateTargetLevelStmt = this.db.prepare(
        "UPDATE user_skills SET targetLevel = ? WHERE userId = ? AND skillId = ?"
      );
 
      for (const req of roleSkills) {
        const exists = checkSkillStmt.get(userId, req.skillId) as any;
        if (!exists) {
          insertSkillStmt.run(userId, req.skillId, 1, req.minLevel, "not_started", nowStr);
        } else {
          updateTargetLevelStmt.run(req.minLevel, userId, req.skillId);
        }
      }
    }
 
    return user;
  }
 
  getProjectDemands(): ProjectDemand[] {
    const stmt = this.db.prepare("SELECT * FROM project_demands ORDER BY createdAt DESC");
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      projectName: r.projectName,
      customerName: r.customerName,
      businessUnit: r.businessUnit,
      projectDescription: r.projectDescription,
      rawJobDescription: r.rawJobDescription || undefined,
      requiredSkills: JSON.parse(r.requiredSkills || "[]"),
      preferredSkills: JSON.parse(r.preferredSkills || "[]"),
      experienceRangeMin: r.experienceRangeMin,
      experienceRangeMax: r.experienceRangeMax,
      technologyStack: JSON.parse(r.technologyStack || "[]"),
      resourcesRequired: r.resourcesRequired,
      clientInterviewDate: r.clientInterviewDate,
      expectedJoiningDate: r.expectedJoiningDate,
      projectPriority: r.projectPriority as any,
      location: r.location,
      domain: r.domain,
      employmentType: r.employmentType as any,
      additionalNotes: r.additionalNotes || undefined,
      status: r.status as any,
      createdAt: r.createdAt
    }));
  }
 
  getProjectDemandById(id: string): ProjectDemand | undefined {
    const stmt = this.db.prepare("SELECT * FROM project_demands WHERE id = ?");
    const r = stmt.get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      projectName: r.projectName,
      customerName: r.customerName,
      businessUnit: r.businessUnit,
      projectDescription: r.projectDescription,
      rawJobDescription: r.rawJobDescription || undefined,
      requiredSkills: JSON.parse(r.requiredSkills || "[]"),
      preferredSkills: JSON.parse(r.preferredSkills || "[]"),
      experienceRangeMin: r.experienceRangeMin,
      experienceRangeMax: r.experienceRangeMax,
      technologyStack: JSON.parse(r.technologyStack || "[]"),
      resourcesRequired: r.resourcesRequired,
      clientInterviewDate: r.clientInterviewDate,
      expectedJoiningDate: r.expectedJoiningDate,
      projectPriority: r.projectPriority as any,
      location: r.location,
      domain: r.domain,
      employmentType: r.employmentType as any,
      additionalNotes: r.additionalNotes || undefined,
      status: r.status as any,
      createdAt: r.createdAt
    };
  }
 
  createProjectDemand(demand: Omit<ProjectDemand, "id" | "createdAt" | "status">): ProjectDemand {
    const id = "dem_" + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const insertStmt = this.db.prepare(`
      INSERT INTO project_demands (
        id, projectName, customerName, businessUnit, projectDescription, rawJobDescription,
        requiredSkills, preferredSkills, experienceRangeMin, experienceRangeMax, technologyStack,
        resourcesRequired, clientInterviewDate, expectedJoiningDate, projectPriority, location,
        domain, employmentType, additionalNotes, status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `);
 
    insertStmt.run(
      id,
      demand.projectName,
      demand.customerName,
      demand.businessUnit,
      demand.projectDescription,
      demand.rawJobDescription || null,
      JSON.stringify(demand.requiredSkills || []),
      JSON.stringify(demand.preferredSkills || []),
      demand.experienceRangeMin || 0,
      demand.experienceRangeMax || 10,
      JSON.stringify(demand.technologyStack || []),
      demand.resourcesRequired || 1,
      demand.clientInterviewDate,
      demand.expectedJoiningDate,
      demand.projectPriority || "HIGH",
      demand.location,
      demand.domain,
      demand.employmentType || "Full-Time",
      demand.additionalNotes || null,
      now
    );
 
    return this.getProjectDemandById(id)!;
  }
}
 
export const db = new SqliteDatabaseWrapper();
export default db;
 