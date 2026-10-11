"""Public portfolio content for the logged-out homepage.

Mirrors Anirudh's resume; edit here when the resume changes. Deliberately
contains no phone number — email/GitHub/LinkedIn only.
"""
import html

NAME = "Anirudh Yarram"
TITLE = "Software Engineer"
TAGLINE = (
    "Full-stack software engineer — currently shipping AV control platforms "
    "at Mechdyne, previously a founding engineer at a startup. I build "
    "reliable systems end to end, from data pipelines to the UI."
)
LOCATION = "Marshalltown, IA → relocating to San Francisco Bay Area"
OPEN_TO_WORK = "Open to new opportunities"
EMAIL = "anirudhyarram@gmail.com"
GITHUB_URL = "https://github.com/Losig23"
LINKEDIN_URL = "https://www.linkedin.com/in/anirudh-yarram-7a38ba18b/"

EXPERIENCE = [
    {
        "company": "Mechdyne",
        "location": "Marshalltown, IA",
        "title": "Software Engineer",
        "dates": "May 2025 – Present",
        "bullets": [
            "Architected a Flask REST service normalizing four incompatible "
            "spreadsheet formats into a SQL Server schema — replacing manual "
            "AV schematic drafting with auto-generated signal-flow maps at "
            "full match coverage across 11,000+ records.",
            "Replaced one-off control code with a reusable full-stack "
            "template, migrating legacy SIMPL/C modules to a layered C#/.NET "
            "(SimplSharpPro) architecture — now the company standard for new "
            "AV installs.",
            "Engineered an attribute-driven command-routing layer abstracting "
            "protocol-specific behavior behind a uniform contract, integrating "
            "10+ third-party devices (Shure, Biamp, Samsung, Epson, Crestron "
            "DM/NVX) without touching core logic.",
            "Unified touchpanel and web control on one path with a "
            "React/TypeScript (Vite, Crestron CH5) front end using "
            "context-based subscriptions over the C# backend; added device "
            "polling/reconnection and encrypted JSON config for real-time "
            "state parity.",
            "Solo-built a 7-scenario Unity validation suite for Mechdyne's "
            "CAVE system, giving non-technical staff a self-service way to "
            "isolate failures without engineering support.",
        ],
    },
    {
        "company": "Neubode",
        "location": "Madison, WI",
        "title": "Full Stack Founding Engineer",
        "dates": "Mar 2024 – May 2025",
        "bullets": [
            "Founding engineer on a roommate-matching platform, owning "
            "architecture and full-stack delivery end to end — React/TypeScript "
            "front end, Supabase Postgres data model, and "
            "compatibility-matching logic scoring students across lifestyle, "
            "schedule, and budget criteria.",
            "Implemented Google SSO with .edu domain verification as a hard "
            "gate on account creation, restricting users to verified students.",
            "Engineered and scaled RESTful APIs with serverless functions "
            "(Supabase Edge, Firebase), applying secure request validation, "
            "CORS configuration, and rate-limiting for resilient traffic "
            "handling.",
            "Automated deployments with GitHub Actions, improving release "
            "reliability and cutting cycle time by 25%.",
        ],
    },
    {
        "company": "CareTech",
        "location": "Remote",
        "title": "Software Engineer Intern",
        "dates": "Jun 2023 – Aug 2023",
        "bullets": [
            "Engineered a scalable AWS-based data pipeline (S3, Lambda, EC2) "
            "capturing interactions between patient data, pollen exposure, "
            "and weather patterns — automating ingestion and reducing data "
            "processing time by 40%.",
            "Deployed and fine-tuned a TensorFlow predictive model on Amazon "
            "SageMaker, improving retraining speed and adaptation to new data "
            "by 30%.",
            "Conducted exploratory data analysis (Pandas, NumPy, Matplotlib) "
            "on S3 datasets, reducing prediction errors by roughly half.",
            "Containerized the pipeline with Docker and automated test-and-deploy "
            "through GitHub Actions, cutting deployment from a manual "
            "multi-step process to a single merge.",
        ],
    },
]

PROJECTS = [
    {
        "name": "losig_home",
        "blurb": "Personal training-tracker web app — this site. Flask + "
        "Postgres (Neon) + R2 object storage, single-user auth with a public "
        "weekly view, Alembic migrations, deployed on Render's free tier.",
        "links": [("GitHub", "https://github.com/Losig23/losig_home")],
    },
    {
        "name": "TuneSage",
        "blurb": "AI music-recommendation platform: Flask + SQLite, TF-IDF "
        "taste-profile similarity, Reddit sentiment mining, feedback "
        "learning, Last.fm scrobble import.",
        "links": [("GitHub", "https://github.com/Losig23/tunesage")],
    },
]

SKILLS = [
    ("Languages", ["Python", "C#", "TypeScript", "JavaScript", "Java", "SQL", "HTML/CSS"]),
    (
        "Frameworks",
        ["Flask", ".NET (SimplSharpPro)", "React", "Node.js", "Spring Boot",
         "TensorFlow", "PyTorch", "Pandas", "NumPy"],
    ),
    ("Databases", ["MySQL", "Firestore", "PostgreSQL", "MongoDB"]),
    (
        "APIs & Architecture",
        ["REST", "GraphQL", "microservices", "serverless (AWS Lambda, Supabase Edge)"],
    ),
    (
        "Cloud & DevOps",
        ["AWS (S3, EC2, Lambda, SageMaker)", "Docker", "Kubernetes",
         "CI/CD", "GitHub Actions", "Git", "GitLab"],
    ),
    ("Tools", ["Jira", "Unity", "Agile/Scrum"]),
]

EDUCATION = [
    {
        "school": "University of Wisconsin–Madison",
        "detail": "B.S. Computer Science — Aug 2021 – May 2025",
    },
    {
        "school": "Coursera",
        "detail": "IBM Full Stack Software Developer Certificate",
    },
]

PORTFOLIO_STYLES = """
.portfolio .role { font-size: 1.3rem; color: var(--muted); margin: 0.25rem 0; }
.portfolio .tagline { max-width: 62ch; }
.portfolio .meta { color: var(--muted); }
.portfolio .open { color: #15803d; font-weight: 600; }
.portfolio .links a { margin-right: 1rem; }
.portfolio h2 { border-bottom: 1px solid var(--line); padding-bottom: 0.4rem;
  margin-top: 2.25rem; }
.portfolio .job { margin-bottom: 1.5rem; }
.portfolio .job h3 { margin-bottom: 0.15rem; }
.portfolio .job .where { color: var(--muted); font-size: 0.9rem; }
.portfolio .job ul { margin: 0.5rem 0; padding-left: 1.25rem; }
.portfolio .job li { margin-bottom: 0.4rem; max-width: 78ch; }
.portfolio .proj { margin-bottom: 1rem; }
.portfolio .proj p { margin: 0.25rem 0; max-width: 78ch; }
.portfolio .proj .links a { margin-right: 0.75rem; font-size: 0.9rem; }
.portfolio .tags { margin: 0.25rem 0 0.75rem; }
.portfolio .tag { display: inline-block; background: #f3f4f6;
  border: 1px solid var(--line); border-radius: 999px;
  padding: 0.1rem 0.65rem; margin: 0 0.3rem 0.3rem 0; font-size: 0.85rem; }
.portfolio .edu { margin-bottom: 0.5rem; }
.portfolio .edu .detail { color: var(--muted); font-size: 0.9rem; }
.portfolio hr { margin: 2.5rem 0; border: none; border-top: 1px solid var(--line); }
.training-log h2 { border-bottom: 1px solid var(--line); padding-bottom: 0.4rem; }
.training-log h3 { margin-top: 1.5rem; }
"""


def _links_html():
    links = [(f"Email", f"mailto:{EMAIL}"), ("GitHub", GITHUB_URL)]
    if LINKEDIN_URL:
        links.append(("LinkedIn", LINKEDIN_URL))
    return " · ".join(
        f'<a href="{html.escape(url)}">{html.escape(label)}</a>'
        for label, url in links
    )


def render_portfolio_html():
    """Server-rendered recruiter-facing portfolio (resume content)."""
    jobs = "".join(
        "<div class=\"job\">"
        f"<h3>{html.escape(job['title'])} — {html.escape(job['company'])}</h3>"
        f"<div class=\"where\">{html.escape(job['location'])} · "
        f"{html.escape(job['dates'])}</div>"
        "<ul>"
        + "".join(f"<li>{html.escape(b)}</li>" for b in job["bullets"])
        + "</ul></div>"
        for job in EXPERIENCE
    )
    projects = "".join(
        "<div class=\"proj\">"
        f"<h3>{html.escape(p['name'])}</h3>"
        f"<p>{html.escape(p['blurb'])}</p>"
        + (
            "<div class=\"links\">"
            + " · ".join(
                f"<a href=\"{html.escape(url)}\">{html.escape(label)}</a>"
                for label, url in p["links"]
            )
            + "</div>"
            if p["links"]
            else ""
        )
        + "</div>"
        for p in PROJECTS
    )
    skills = "".join(
        f"<div><b>{html.escape(group)}:</b></div>"
        "<div class=\"tags\">"
        + "".join(
            f"<span class=\"tag\">{html.escape(skill)}</span>"
            for skill in items
        )
        + "</div>"
        for group, items in SKILLS
    )
    education = "".join(
        "<div class=\"edu\">"
        f"<b>{html.escape(e['school'])}</b><br>"
        f"<span class=\"detail\">{html.escape(e['detail'])}</span>"
        "</div>"
        for e in EDUCATION
    )
    return f"""
<section class="portfolio">
<header>
<h1>{html.escape(NAME)}</h1>
<p class="role">{html.escape(TITLE)}</p>
<p class="tagline">{html.escape(TAGLINE)}</p>
<p class="meta">{html.escape(LOCATION)}<br>
<span class="open">{html.escape(OPEN_TO_WORK)}</span></p>
<p class="links">{_links_html()}</p>
</header>
<h2>Experience</h2>
{jobs}
<h2>Projects</h2>
{projects}
<h2>Skills</h2>
{skills}
<h2>Education</h2>
{education}
<hr>
</section>
"""
