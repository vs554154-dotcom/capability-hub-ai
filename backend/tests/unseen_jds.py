"""Job descriptions written the way clients write them, none of them from the demo data.

Each is read without a model and matched against the demo company: (name, text, what the
required skills must include, a word in the job title of the best three people).
"""

UNSEEN = [
    ("k8s platform", """We are hiring a Sr. DevOps / Platform person (6+ yrs).
You live and breathe K8s (EKS or AKS), Helm charts and GitOps with ArgoCD. You write IaC in Terraform and
your pipelines run on GitHub Actions. Datadog or OpenTelemetry experience would be a plus. Remote, full time.""",
     {"Kubernetes", "Helm", "Argo CD", "Terraform", "GitHub Actions"}, ("Platform", "DevOps", "Cloud")),
    ("dotnet", """Position: Senior Dotnet Developer
Experience: 5 to 9 years
Skills: .NET Core, C#, EF Core, MSSQL, RESTful APIs, Microsoft Azure
Good to have: Angular, Docker
Our customer is a leading private bank modernising its loan systems.""",
     {"ASP.NET Core", "C#", "Entity Framework", "SQL Server", "REST APIs", "Azure"}, (".NET",)),
    ("rag engineer", """Generative AI Engineer - 3-6 years

Responsibilities
- Build RAG pipelines with LangGraph and a vector store such as Pinecone or pgvector
- Fine-tuning and evaluation of LLMs
- Expose services through FastAPI
Requirements
- Python
- Large language models
- Prompt engineering
Nice to have
- AWS SageMaker
- Responsible AI""",
     {"Retrieval-Augmented Generation", "LangChain", "Vector Databases", "Large Language Models", "FastAPI", "Python"},
     ("GenAI", "AI Agent")),
    ("soc", """Job title: SOC Analyst (L2)
24x7 security operations center. You will triage alerts in Microsoft Sentinel or Splunk, run incident response
and threat hunting using MITRE ATT&CK, and manage EDR tooling such as CrowdStrike. 3-5 years.""",
     {"Security Operations", "SIEM", "Incident Response", "Threat Hunting", "Endpoint Security"}, ("SOC",)),
    ("salesforce", """Looking for a Salesforce Developer who can write SOQL and Apex triggers, build LWC, and integrate
Service Cloud with REST APIs. Experience 3+ years. Telecom client in Gurugram. 2 positions.""",
     {"Apex", "Lightning Web Components", "Salesforce Administration", "REST APIs"}, ("Salesforce",)),
    ("sap", """SAP S4 HANA finance consultant
Must have: SAP FI, SAP CO, SAP S/4HANA, stakeholder management
Preferred: SAP MM
Manufacturing client, 7-12 years.""",
     {"SAP FICO", "SAP S/4HANA", "Stakeholder Management"}, ("SAP FICO",)),
    ("data", """Title: Analytics Engineer
Tech stack: Snowflake, dbt, Airflow, SQL, Python
You model data (star schema) for a retail client and care about data quality. 4-7 yrs.""",
     {"Snowflake", "dbt", "Apache Airflow", "SQL", "Python"}, ("Snowflake", "Data Engineer")),
    ("mobile", """iOS Developer with SwiftUI and UIKit. GraphQL APIs. App is used by a media company. 3-6 years experience.""",
     {"iOS Development", "GraphQL"}, ("iOS",)),
    ("sre", """Site Reliability Engineer
- Own SLOs and error budgets
- Prometheus, Grafana and OpenTelemetry
- K8s, Golang, Linux
- On-call incident response
5-8 years""",
     {"Site Reliability Engineering", "Prometheus & Grafana", "Kubernetes", "Go (Golang)", "Linux Administration"},
     ("Site Reliability",)),
    ("scrum", """Role: Scrum Master
Run ceremonies for three squads, coach on agile delivery, use Jira daily, SAFe exposure. 5+ years.""",
     {"Scrum", "Agile", "Jira", "Scaled Agile"}, ("Scrum",)),
    ("test automation", """SDET wanted. Playwright or Selenium WebDriver with Java, Postman for API testing, Cucumber with Gherkin,
tests in the CI pipeline. 4-6 years.""",
     {"Playwright", "Selenium Automation Framework", "Java", "Postman & REST API Testing", "Cucumber & BDD"}, ("SDET",)),
    ("embedded", """Embedded Software Engineer, automotive. Firmware in Embedded C and C++, RTOS, CAN bus and AUTOSAR. 4-8 years, Pune.""",
     {"Embedded C", "C++", "AUTOSAR"}, ("Embedded",)),
    ("servicenow", """ServiceNow developer - ITSM workflows, JavaScript, REST integrations with RESTful web services. 3 to 6 years.""",
     {"ServiceNow", "ITIL", "JavaScript"}, ("ServiceNow",)),
    ("vision", """Computer vision role for a factory: object detection with YOLO and PyTorch, OpenCV, deploy with Docker. Python. 3-7 years.""",
     {"Computer Vision", "PyTorch", "Docker", "Python"}, ("Computer Vision",)),
    ("fullstack js", """We need a MERN engineer: ReactJS, NodeJS, ExpressJS, Mongo. ES6 and HTML5/CSS3. 2-5 years. Remote.""",
     {"React", "Node.js", "Express.js", "MongoDB", "JavaScript", "HTML & CSS"}, ("MERN",)),
    ("iam", """Identity engineer - Okta, Entra ID and SailPoint. Zero trust programme for an insurer. PowerShell scripting. 4-8 years.""",
     {"Identity & Access Management", "Zero Trust Architecture", "PowerShell"}, ("IAM",)),
    ("power bi", """BI Developer: PowerBI with strong DAX, T-SQL, star schema modelling, Advanced Excel. Hospital client. 3-6 yrs.""",
     {"Power BI", "SQL Server", "Data Modeling", "Microsoft Excel"}, ("BI Developer",)),
    ("project manager", """Job Title: Senior Project Manager
Deliver a core banking programme. Project planning, risk and change management, Jira, stakeholder management. PMP preferred.
8-14 years. Onsite / Mumbai""",
     {"Project Management", "Change Management", "Jira", "Stakeholder Management"}, ("Project Manager",)),
]

# Nobody in the demo company has these; the answer must say so.
NOBODY_HAS = """Job title: Quantum Algorithms Engineer
Must have
- Qiskit
- Quantum error correction
- Python
Nice to have
- Rust
4-8 years"""
