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
        "taste-profile similarity, similar-artist candidate mining via Last.fm, "
        "feedback learning, Last.fm scrobble import.",
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
  --card-hi: #0d1512;
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
    radial-gradient(1000px 520px at 12% -5%, rgba(52, 211, 153, 0.08), transparent 60%),
    radial-gradient(800px 500px at 95% 25%, rgba(52, 211, 153, 0.05), transparent 60%),
    radial-gradient(900px 600px at 50% 115%, rgba(52, 211, 153, 0.06), transparent 60%);
  background-attachment: fixed;
}
::selection { background: rgba(52, 211, 153, 0.35); }
a { color: var(--green); }
.muted { color: var(--muted); }
.small { font-size: 0.88rem; }
.open { color: var(--green-hi); font-weight: 600; }

/* ---- top bar ---- */
.topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  display: flex; align-items: center; gap: 1.6rem;
  padding: 0.75rem 1.6rem;
  background: rgba(5, 8, 10, 0.82); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--green-dim);
}
.topbar .logo {
  font-family: var(--mono); font-weight: 700; color: var(--green);
  text-decoration: none; border: 2px solid var(--green); border-radius: 8px;
  padding: 0.15rem 0.5rem; font-size: 0.95rem;
}
.topbar .nav { display: flex; gap: 1.3rem; }
.topbar .nav a, .topbar .nav-ext a {
  color: var(--muted); text-decoration: none; font-size: 0.9rem;
}
.topbar .nav a:hover, .topbar .nav-ext a:hover { color: var(--green-hi); }
.topbar .nav-ext { margin-left: auto; display: flex; gap: 1.1rem; }

/* ---- bento grid ---- */
.bento {
  display: grid; gap: 1.1rem;
  grid-template-columns: repeat(6, 1fr);
  grid-template-areas:
    "hero hero hero hero now now"
    "hero hero hero hero links links"
    "about about about status status status"
    "exp exp exp exp exp exp"
    "p1 p1 p2 p2 p3 p3"
    "l1 l1 l2 l2 l3 l3"
    "contact contact contact contact contact contact";
  max-width: 1220px; margin: 0 auto;
  padding: 5.2rem 1.6rem 2rem;
}
.tile {
  background: linear-gradient(160deg, var(--card-hi), var(--card));
  border: 1px solid var(--green-dim); border-radius: 18px;
  padding: 1.6rem; min-width: 0;
  transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
}
.tile:hover {
  transform: translateY(-4px); border-color: rgba(52, 211, 153, 0.45);
  box-shadow: 0 14px 36px rgba(52, 211, 153, 0.09);
}
.hero { grid-area: hero; }
.now { grid-area: now; }
.links { grid-area: links; }
.about { grid-area: about; }
.status { grid-area: status; }
.exp { grid-area: exp; }
.p1 { grid-area: p1; } .p2 { grid-area: p2; } .p3 { grid-area: p3; }
.l1 { grid-area: l1; } .l2 { grid-area: l2; } .l3 { grid-area: l3; }
.contact { grid-area: contact; }

.eyebrow {
  font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--green); margin: 0 0 0.9rem;
}
.eyebrow .count {
  color: var(--bg); background: var(--green); border-radius: 999px;
  padding: 0.05rem 0.5rem; letter-spacing: 0;
}

/* ---- hero tile ---- */
.hero .name {
  margin: 0; font-size: clamp(2.8rem, 6vw, 4.6rem); font-weight: 800;
  letter-spacing: -0.03em; line-height: 0.98;
  background: linear-gradient(115deg, #f2fbf6 25%, var(--green-hi) 85%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hero .role { font-size: 1.25rem; color: var(--muted); margin: 0.7rem 0 0.4rem; }
.hero .tagline { max-width: 52ch; color: #c4d4cc; }
.hero .meta { color: var(--muted); margin: 1.4rem 0 0; font-size: 0.92rem; }
.cta { display: flex; gap: 0.9rem; margin-top: 1.6rem; flex-wrap: wrap; }
.btn {
  font-family: var(--mono); font-size: 0.88rem; color: var(--green);
  border: 1px solid var(--green); border-radius: 8px;
  padding: 0.75rem 1.35rem; text-decoration: none;
  transition: background 0.2s, transform 0.2s;
  display: inline-block;
}
.btn:hover { background: rgba(52, 211, 153, 0.12); transform: translateY(-2px); }
.btn.ghost { border-color: rgba(52, 211, 153, 0.4); }

/* ---- now playing / links tiles ---- */
.now .track { font-size: 1.25rem; font-weight: 700; margin: 0; }
.now .artist { margin: 0.25rem 0 0.8rem; }
.now .plays { font-family: var(--mono); font-size: 0.75rem; color: var(--green); }
.now .src, .tile .src { font-size: 0.8rem; color: var(--muted); margin: 0; }
.social-row { display: flex; gap: 1.1rem; margin-bottom: 1rem; }
.social-row a { color: var(--muted); transition: color 0.2s, transform 0.2s; }
.social-row a:hover { color: var(--green-hi); transform: translateY(-2px); }
.quick { display: flex; flex-direction: column; gap: 0.45rem; }
.quick a { text-decoration: none; font-size: 0.95rem; }
.quick a:hover { color: var(--green-hi); }

/* ---- about / status ---- */
.about p { max-width: 60ch; }
.pills { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 1rem; }
.pill {
  font-family: var(--mono); font-size: 0.76rem; color: var(--green-hi);
  border: 1px solid var(--green-dim); border-radius: 999px;
  padding: 0.22rem 0.75rem; background: rgba(52, 211, 153, 0.06);
}
.status .big { font-size: 1.3rem; font-weight: 700; margin: 0 0 0.3rem; }
.status .at { color: var(--green); }
.status .edu { margin: 0.9rem 0; }
.badge {
  display: inline-block; font-size: 0.85rem; font-weight: 600; color: var(--bg);
  background: linear-gradient(120deg, var(--green), var(--green-hi));
  border-radius: 999px; padding: 0.3rem 0.95rem;
}

/* ---- experience ---- */
.job { padding: 1.1rem 0; border-bottom: 1px solid var(--green-dim); }
.job:first-of-type { padding-top: 0; }
.job:last-child { border-bottom: none; padding-bottom: 0; }
.job-head { display: flex; justify-content: space-between; align-items: baseline;
  gap: 1rem; flex-wrap: wrap; }
.job-head h3 { margin: 0; font-size: 1.12rem; }
.job-head .at { color: var(--green); }
.job-head .dates { font-family: var(--mono); color: var(--muted); font-size: 0.82rem;
  white-space: nowrap; }
.job .where { color: var(--muted); font-size: 0.88rem; margin: 0.15rem 0 0.5rem; }
.job ul { margin: 0.4rem 0 0; padding-left: 1.2rem; color: #c4d4cc; font-size: 0.95rem; }
.job li { margin-bottom: 0.4rem; max-width: 88ch; }
.job li::marker { color: var(--green); }

/* ---- project tiles ---- */
.proj { display: flex; flex-direction: column; }
.proj-top { display: flex; justify-content: space-between; align-items: center;
  color: var(--green); margin-bottom: 0.9rem; }
.proj-links { display: flex; gap: 0.65rem; }
.proj-links a { color: var(--muted); }
.proj-links a:hover { color: var(--green-hi); }
.proj h3 { margin: 0 0 0.5rem; font-size: 1.2rem; }
.proj p { font-size: 0.93rem; flex: 1; }
.proj .tags { display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.9rem; }
.proj .tags span { font-family: var(--mono); font-size: 0.75rem; color: var(--muted); }

/* ---- life tiles ---- */
.life h4 { color: var(--green-hi); font-size: 0.95rem; margin: 1rem 0 0.3rem; }
.life .meal { border-bottom: 1px solid var(--green-dim); padding: 0.5rem 0; }
.life .meal:last-child { border-bottom: none; }
.life .macros { color: var(--muted); font-size: 0.86rem; }
.life .music-list { list-style: none; padding: 0; margin: 0.3rem 0; }
.life .music-list li { padding: 0.4rem 0; border-bottom: 1px solid var(--green-dim);
  font-size: 0.9rem; }
.life .music-list li:last-child { border-bottom: none; }
.life a { color: var(--green); }

/* ---- contact ---- */
.contact { text-align: center; padding: 3rem 1.6rem; }
.contact h2 { font-size: clamp(1.9rem, 4vw, 2.8rem); margin: 0 0 0.8rem; }
.contact .muted { max-width: 52ch; margin: 0 auto 1.8rem; }

/* ---- footer ---- */
.foot { text-align: center; color: var(--muted); font-size: 0.84rem;
  padding: 1.5rem 1rem 2.5rem; }
.foot p { margin: 0; }

/* ---- reveal ---- */
.reveal { opacity: 0; transform: translateY(22px);
  transition: opacity 0.65s ease, transform 0.65s ease; }
.reveal.in { opacity: 1; transform: none; }

/* ---- responsive ---- */
@media (max-width: 920px) {
  .topbar .nav { display: none; }
  .bento {
    grid-template-columns: 1fr;
    grid-template-areas:
      "hero" "now" "links" "about" "status" "exp"
      "p1" "p2" "p3" "l1" "l2" "l3" "contact";
    padding: 4.6rem 1rem 1.5rem;
  }
  .hero .name { font-size: clamp(2.4rem, 13vw, 3.4rem); }
}
"""



def render_portfolio_html(now_playing_html=""):
    """Bento-grid portfolio: hero, now-playing, links, about, status,
    experience, and project tiles."""
    jobs = "".join(
        "<article class=\"job\">"
        f"<div class=\"job-head\"><h3>{html.escape(job['title'])} "
        f"<span class=\"at\">@ {html.escape(job['company'])}</span></h3>"
        f"<span class=\"dates\">{html.escape(job['dates'])}</span></div>"
        f"<p class=\"where\">{html.escape(job['location'])}</p>"
        "<ul>"
        + "".join(f"<li>{html.escape(b)}</li>" for b in job["bullets"])
        + "</ul></article>"
        for job in EXPERIENCE
    )
    projects = "".join(
        f"<article class=\"tile proj reveal p{i + 1}{' id=\"projects\"' if i == 0 else ''}\">"
        "<p class=\"eyebrow\">project</p>"
        "<div class=\"proj-top\">"
        "<svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" "
        "stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"/></svg>"
        "<div class=\"proj-links\">"
        + "".join(
            f"<a href=\"{html.escape(url)}\" aria-label=\"{html.escape(label)}\">"
            "<svg viewBox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"none\" "
            "stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>"
            "<path d=\"M15 3h6v6M10 14 21 3\"/></svg></a>"
            for label, url in p["links"]
        )
        + "</div></div>"
        f"<h3>{html.escape(p['name'])}</h3>"
        f"<p class=\"muted\">{html.escape(p['blurb'])}</p>"
        + (
            "<div class=\"tags\">"
            + "".join(f"<span>{html.escape(t)}</span>" for t in p.get("tech", []))
            + "</div>"
            if p.get("tech")
            else ""
        )
        + "</article>"
        for i, p in enumerate(PROJECTS)
    )
    skills = "".join(
        f"<span class=\"pill\">{html.escape(skill)}</span>"
        for _, items in SKILLS for skill in items
    )
    return f"""
<article class="tile hero reveal">
<p class="eyebrow">\u25cf portfolio</p>
<h1 class="name">Anirudh<br>Yarram</h1>
<p class="role">{html.escape(TITLE)}</p>
<p class="tagline">{html.escape(TAGLINE)}</p>
<div class="cta">
<a class="btn" href="/game">Immerse me</a>
<a class="btn ghost" href="mailto:{html.escape(EMAIL)}">Say hello</a>
</div>
<p class="meta">{html.escape(LOCATION)} \u00b7 <span class="open">{html.escape(OPEN_TO_WORK)}</span></p>
</article>
<article class="tile now reveal">
<p class="eyebrow">\u266a now playing</p>
{now_playing_html or '<p class="muted">No scrobbles this week.</p>'}
<p class="src">via <a href="https://www.last.fm">Last.fm</a></p>
</article>
<article class="tile links reveal">
<p class="eyebrow">\u2197 links</p>
<div class="social-row">
<a href="{html.escape(GITHUB_URL)}" aria-label="GitHub">
<svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg></a>
<a href="{html.escape(LINKEDIN_URL)}" aria-label="LinkedIn">
<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45z"/></svg></a>
<a href="mailto:{html.escape(EMAIL)}" aria-label="Email">
<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg></a>
</div>
<div class="quick">
<a href="/game">Apartment game \u2192</a>
<a href="/login">Log in \u2192</a>
</div>
</article>
<article class="tile about reveal" id="about">
<p class="eyebrow">about</p>
<p>{html.escape(TAGLINE)}</p>
<div class="pills">{skills}</div>
</article>
<article class="tile status reveal">
<p class="eyebrow">currently</p>
<p class="big">{html.escape(EXPERIENCE[0]['title'])} <span class="at">@ {html.escape(EXPERIENCE[0]['company'])}</span></p>
<p class="muted">{html.escape(LOCATION)}</p>
<p class="edu">\U0001f393 {html.escape(EDUCATION[0]['school'])}<br><span class="muted">{html.escape(EDUCATION[0]['detail'])}</span></p>
<p><span class="badge">{html.escape(OPEN_TO_WORK)}</span></p>
</article>
<article class="tile exp reveal" id="experience">
<p class="eyebrow">experience</p>
{jobs}
</article>
{projects}
"""


def render_contact_html():
    return f"""
<article class="tile contact reveal" id="contact">
<p class="eyebrow">contact</p>
<h2>Get in touch</h2>
<p class="muted">I&rsquo;m currently {html.escape(OPEN_TO_WORK.lower())} &mdash;
my inbox is always open, whether you have a role in mind or just want
to talk shop.</p>
<a class="btn" href="mailto:{html.escape(EMAIL)}">Say hello</a>
</article>
"""
