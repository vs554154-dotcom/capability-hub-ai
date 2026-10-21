"""The version-1 baseline schema. FROZEN - do not edit.

This is the schema migration 1 builds (see migrations.py): all 12 tables, including
every column the Node server added over time with ALTER TABLE.

To change the schema, add a migration in migrations.py. Editing this file instead
would give new databases a schema that already-deployed databases never receive,
because migration 1 has already run on those and never runs again.
test_migrations.py fails if these statements change.
"""

# Executed in order. SQLite strips IF NOT EXISTS when it stores a statement in
# sqlite_master, so it is restored here: running this against an existing database
# must be a no-op, not an error.
SCHEMA_STATEMENTS: list[str] = [
    """CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    duration TEXT NOT NULL,
    skillId TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT, rating REAL DEFAULT 4.9, enrollmentCount TEXT DEFAULT '180,000+ Learners', lastUpdated TEXT DEFAULT 'Updated June 2026', isLatest2026 INTEGER DEFAULT 1,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE
  )""",
    """CREATE TABLE IF NOT EXISTS evidences (
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
  )""",
    """CREATE TABLE IF NOT EXISTS learning_plans (
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
    completedAt TEXT, demandId TEXT, purpose TEXT DEFAULT 'career_growth',
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )""",
    """CREATE TABLE IF NOT EXISTS post_assessments (
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
  )""",
    """CREATE TABLE IF NOT EXISTS project_demands (
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
  )""",
    """CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    targetRole TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )""",
    """CREATE TABLE IF NOT EXISTS skill_baselines (
    userId TEXT NOT NULL,
    skillId TEXT NOT NULL,
    demandId TEXT NOT NULL,
    baselineLevel INTEGER NOT NULL,
    capturedAt TEXT NOT NULL,
    PRIMARY KEY (userId, skillId, demandId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE
  )""",
    """CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL
  )""",
    """CREATE TABLE IF NOT EXISTS target_role_skills (
    roleId TEXT NOT NULL,
    skillId TEXT NOT NULL,
    minLevel INTEGER NOT NULL,
    PRIMARY KEY (roleId, skillId),
    FOREIGN KEY (roleId) REFERENCES target_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE
  )""",
    """CREATE TABLE IF NOT EXISTS target_roles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL
  )""",
    """CREATE TABLE IF NOT EXISTS user_skills (
    userId TEXT NOT NULL,
    skillId TEXT NOT NULL,
    currentLevel INTEGER NOT NULL,
    targetLevel INTEGER NOT NULL,
    status TEXT NOT NULL,
    lastUpdated TEXT NOT NULL,
    PRIMARY KEY (userId, skillId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE
  )""",
    """CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar TEXT NOT NULL,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    targetRoleId TEXT
  , experienceYears REAL, domain TEXT, primaryRole TEXT, primarySkills TEXT, passwordHash TEXT, managerId TEXT)""",
]

SEED_TABLE_ORDER: list[str] = [
    "users",
    "skills",
    "target_roles",
    "target_role_skills",
    "user_skills",
    "courses",
    "evidences",
    "learning_plans",
    "reminders",
    "project_demands",
    "post_assessments",
    "skill_baselines"
]
