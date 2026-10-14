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
LOCATION = "Marshalltown, IA"
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
        "tech": ["Flask", "PostgreSQL", "Three.js", "Render"],
    },
    {
        "name": "TuneSage",
        "blurb": "AI music-recommendation platform: Flask + SQLite, TF-IDF "
        "taste-profile similarity, Reddit sentiment mining, feedback "
        "learning, Last.fm scrobble import.",
        "links": [("GitHub", "https://github.com/Losig23/tunesage")],
        "tech": ["Flask", "TF-IDF", "Last.fm", "SQLite"],
    },
    {
        "name": "Apartment game",
        "blurb": "Walkable 3D apartment in the browser — Three.js, cel shading "
        "with screen-space ink outlines, procedural anime character. Every "
        "object is a live view into my training, food, music, and gaming "
        "data through this site's REST API.",
        "links": [("Play", "/game"), ("GitHub", "https://github.com/Losig23/losig_home")],
        "tech": ["Three.js", "GLSL", "REST"],
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
:root {
  --bg: #05080a;
  --card: #0a100d;
  --green: #34d399;
  --green-hi: #6ee7b7;
  --green-dim: rgba(52, 211, 153, 0.14);
  --text: #e9f2ed;
  --muted: #8ba399;
  --mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: var(--sans); line-height: 1.6;
  background-image:
    radial-gradient(900px 500px at 15% -5%, rgba(52, 211, 153, 0.09), transparent 60%),
    radial-gradient(700px 500px at 90% 30%, rgba(52, 211, 153, 0.05), transparent 60%),
    radial-gradient(800px 600px at 50% 110%, rgba(52, 211, 153, 0.06), transparent 60%);
  background-attachment: fixed;
}
::selection { background: rgba(52, 211, 153, 0.35); }
a { color: var(--green); }
.mono { font-family: var(--mono); }
.muted { color: var(--muted); }
.open { color: var(--green-hi); font-weight: 600; }

/* ---- sidebar ---- */
.side {
  position: fixed; inset: 0 auto 0 0; width: 230px; z-index: 50;
  display: flex; flex-direction: column; align-items: center;
  padding: 2rem 1rem; background: rgba(5, 8, 10, 0.85);
  backdrop-filter: blur(8px); border-right: 1px solid var(--green-dim);
}
.side .logo {
  font-family: var(--mono); font-weight: 700; font-size: 1.4rem;
  color: var(--green); text-decoration: none;
  border: 2px solid var(--green); border-radius: 8px; padding: 0.3rem 0.6rem;
}
.side-links { display: flex; flex-direction: column; gap: 1.1rem; margin-top: 3rem; }
.side-links a {
  color: var(--muted); text-decoration: none; font-size: 0.95rem;
  display: flex; gap: 0.4rem; align-items: baseline;
}
.side-links a .num { font-family: var(--mono); color: var(--green); font-size: 0.8rem; }
.side-links a:hover { color: var(--green-hi); }
.side-links.ext { margin-top: 2rem; }
.side .social { margin-top: auto; display: flex; gap: 1.2rem; }
.side .social a { color: var(--muted); }
.side .social a:hover { color: var(--green-hi); transform: translateY(-2px); }
.side .social a { transition: color 0.2s, transform 0.2s; }

/* ---- mobile topbar ---- */
.topbar { display: none; }

/* ---- main column ---- */
main { margin-left: 230px; max-width: 1020px; padding: 0 4rem; }
.foot { padding: 3rem 0 2rem; color: var(--muted); font-size: 0.85rem; text-align: center; }
.foot p { margin: 0; }

/* ---- hero ---- */
.hero { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; }
.hero .hi { color: var(--green); margin: 0 0 1rem; font-size: 1rem; }
.hero .name {
  margin: 0; font-size: clamp(2.6rem, 7vw, 4.8rem); font-weight: 800;
  letter-spacing: -0.02em; line-height: 1.05;
  background: linear-gradient(120deg, #f2fbf6 30%, var(--green-hi) 90%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hero .tag {
  margin: 0.4rem 0 1.2rem; font-size: clamp(1.6rem, 4vw, 2.6rem);
  font-weight: 700; color: var(--muted); letter-spacing: -0.01em;
}
.hero .tagline { max-width: 56ch; color: var(--muted); font-size: 1.05rem; }
.cta { display: flex; gap: 1rem; margin-top: 2.2rem; flex-wrap: wrap; }
.btn {
  font-family: var(--mono); font-size: 0.9rem; color: var(--green);
  border: 1px solid var(--green); border-radius: 6px;
  padding: 0.8rem 1.4rem; text-decoration: none;
  transition: background 0.2s, color 0.2s, transform 0.2s;
}
.btn:hover { background: rgba(52, 211, 153, 0.12); transform: translateY(-2px); }
.btn.ghost { border-color: rgba(52, 211, 153, 0.4); }

/* ---- sections ---- */
.block { padding: 5rem 0 1rem; }
.sec {
  display: flex; align-items: center; gap: 0.8rem;
  font-size: 1.6rem; font-weight: 700; margin: 0 0 2rem;
}
.sec .num { font-family: var(--mono); color: var(--green); font-size: 1.1rem; font-weight: 400; }
.sec .rule { flex: 1; height: 1px; background: var(--green-dim); }

/* ---- about ---- */
#about p { max-width: 62ch; }
.pills { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.2rem; }
.pill {
  font-family: var(--mono); font-size: 0.8rem; color: var(--green-hi);
  border: 1px solid var(--green-dim); border-radius: 999px;
  padding: 0.25rem 0.8rem; background: rgba(52, 211, 153, 0.06);
}
.edu { color: var(--muted); }

/* ---- experience ---- */
.job {
  background: var(--card); border: 1px solid var(--green-dim);
  border-radius: 10px; padding: 1.4rem 1.6rem; margin-bottom: 1.2rem;
  transition: border-color 0.25s, transform 0.25s;
}
.job:hover { border-color: rgba(52, 211, 153, 0.45); transform: translateY(-3px); }
.job-head { display: flex; justify-content: space-between; align-items: baseline;
  gap: 1rem; flex-wrap: wrap; }
.job-head h3 { margin: 0; font-size: 1.15rem; }
.job-head .at { color: var(--green); font-weight: 600; }
.job-head .dates { color: var(--muted); font-size: 0.85rem; white-space: nowrap; }
.job .where { color: var(--muted); font-size: 0.9rem; margin: 0.2rem 0 0.6rem; }
.job ul { margin: 0.4rem 0 0; padding-left: 1.2rem; color: #c4d4cc; }
.job li { margin-bottom: 0.45rem; max-width: 76ch; }
.job li::marker { color: var(--green); }

/* ---- projects ---- */
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.2rem; }
.card {
  background: var(--card); border: 1px solid var(--green-dim);
  border-radius: 10px; padding: 1.4rem;
  display: flex; flex-direction: column;
  transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
}
.card:hover {
  border-color: rgba(52, 211, 153, 0.5); transform: translateY(-5px);
  box-shadow: 0 12px 32px rgba(52, 211, 153, 0.08);
}
.card-top { display: flex; justify-content: space-between; align-items: center;
  color: var(--green); margin-bottom: 1rem; }
.card-links { display: flex; gap: 0.7rem; }
.card-links a { color: var(--muted); }
.card-links a:hover { color: var(--green-hi); }
.card h3 { margin: 0 0 0.5rem; font-size: 1.15rem; }
.card p { color: var(--muted); font-size: 0.95rem; flex: 1; }
.card .tags { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1rem; }
.card .tags span { font-size: 0.78rem; color: var(--muted); }

/* ---- life log ---- */
.life-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
.life-card {
  background: var(--card); border: 1px solid var(--green-dim);
  border-radius: 10px; padding: 1.3rem 1.4rem; min-width: 0;
}
.life-card h3 { margin: 0 0 0.8rem; font-size: 1.05rem; display: flex;
  align-items: center; gap: 0.6rem; }
.life-card h3 .count {
  font-family: var(--mono); font-size: 0.75rem; color: var(--bg);
  background: var(--green); border-radius: 999px; padding: 0.1rem 0.55rem;
}
.life-card h4 { color: var(--green-hi); font-size: 0.95rem; margin: 1rem 0 0.3rem; }
.life-card .meal { background: transparent; border: none; border-bottom: 1px solid var(--green-dim);
  border-radius: 0; padding: 0.55rem 0; }
.life-card .meal:last-child { border-bottom: none; }
.life-card .macros { color: var(--muted); font-size: 0.88rem; }
.life-card .music-list { list-style: none; padding: 0; margin: 0.3rem 0; }
.life-card .music-list li { padding: 0.4rem 0; border-bottom: 1px solid var(--green-dim);
  font-size: 0.92rem; }
.life-card .music-list li:last-child { border-bottom: none; }
.life-card a { color: var(--green); }

/* ---- contact ---- */
.contact { text-align: center; padding-bottom: 6rem; }
.contact .over { color: var(--green); margin-bottom: 0.6rem; }
.contact h2 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 1rem; }
.contact .muted { max-width: 52ch; margin: 0 auto 2rem; }

/* ---- reveal on scroll ---- */
.reveal { opacity: 0; transform: translateY(26px);
  transition: opacity 0.7s ease, transform 0.7s ease; }
.reveal.in { opacity: 1; transform: none; }

/* ---- responsive ---- */
@media (max-width: 900px) {
  .side { display: none; }
  .topbar {
    display: flex; position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    align-items: center; justify-content: space-between;
    padding: 0.8rem 1.2rem; background: rgba(5, 8, 10, 0.9);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--green-dim);
  }
  .topbar .logo { font-family: var(--mono); font-weight: 700; color: var(--green);
    text-decoration: none; border: 2px solid var(--green); border-radius: 8px;
    padding: 0.2rem 0.5rem; font-size: 0.95rem; }
  .topbar-links { display: flex; gap: 1rem; }
  .topbar-links a { color: var(--muted); text-decoration: none; font-size: 0.85rem; }
  .topbar-links a:hover { color: var(--green-hi); }
  main { margin-left: 0; padding: 0 1.4rem; }
  .hero { min-height: 92vh; padding-top: 4rem; }
  .cards { grid-template-columns: 1fr; }
  .life-grid { grid-template-columns: 1fr; }
}
"""



def render_portfolio_html():
    """Public portfolio: hero, about, experience, projects."""
    jobs = "".join(
        "<article class=\"job\">"
        f"<div class=\"job-head\"><h3>{html.escape(job['title'])} "
        f"<span class=\"at\">@ {html.escape(job['company'])}</span></h3>"
        f"<span class=\"dates mono\">{html.escape(job['dates'])}</span></div>"
        f"<p class=\"where\">{html.escape(job['location'])}</p>"
        "<ul>"
        + "".join(f"<li>{html.escape(b)}</li>" for b in job["bullets"])
        + "</ul></article>"
        for job in EXPERIENCE
    )
    projects = "".join(
        "<article class=\"card\">"
        "<div class=\"card-top\">"
        "<svg viewBox=\"0 0 24 24\" width=\"28\" height=\"28\" fill=\"none\" "
        "stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"/></svg>"
        "<div class=\"card-links\">"
        + "".join(
            f"<a href=\"{html.escape(url)}\" aria-label=\"{html.escape(label)}\">"
            "<svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" "
            "stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>"
            "<path d=\"M15 3h6v6M10 14 21 3\"/></svg></a>"
            for label, url in p["links"]
        )
        + "</div></div>"
        f"<h3>{html.escape(p['name'])}</h3>"
        f"<p>{html.escape(p['blurb'])}</p>"
        + (
            "<div class=\"tags mono\">"
            + "".join(f"<span>{html.escape(t)}</span>" for t in p.get("tech", []))
            + "</div>"
            if p.get("tech")
            else ""
        )
        + "</article>"
        for p in PROJECTS
    )
    skills = "".join(
        f"<span class=\"pill\">{html.escape(skill)}</span>"
        for _, items in SKILLS for skill in items
    )
    return f"""
<section class="hero">
<p class="mono hi">Hi, my name is</p>
<h1 class="name">Anirudh Yarram.</h1>
<h2 class="tag">I build reliable software.</h2>
<p class="tagline">{html.escape(TAGLINE)}</p>
<div class="cta">
<a class="btn" href="#projects">Check out my work</a>
<a class="btn ghost" href="/game">Immerse me</a>
</div>
</section>
<section class="block reveal" id="about">
<h2 class="sec"><span class="num">01.</span> About <span class="rule"></span></h2>
<p>{html.escape(TAGLINE)}</p>
<p class="muted">{html.escape(LOCATION)} · <span class="open">{html.escape(OPEN_TO_WORK)}</span></p>
<p class="edu">🎓 {html.escape(EDUCATION[0]["school"])} — {html.escape(EDUCATION[0]["detail"])}</p>
<div class="pills">{skills}</div>
</section>
<section class="block reveal" id="experience">
<h2 class="sec"><span class="num">02.</span> Experience <span class="rule"></span></h2>
{jobs}
</section>
<section class="block reveal" id="projects">
<h2 class="sec"><span class="num">03.</span> Projects <span class="rule"></span></h2>
<div class="cards">{projects}</div>
</section>
"""


def render_contact_html():
    return f"""
<section class="block reveal contact" id="contact">
<p class="mono over">05. What&rsquo;s next?</p>
<h2>Get in touch</h2>
<p class="muted">I&rsquo;m currently {html.escape(OPEN_TO_WORK.lower())} —
my inbox is always open, whether you have a role in mind or just want
to talk shop.</p>
<a class="btn" href="mailto:{html.escape(EMAIL)}">Say hello</a>
</section>
"""
