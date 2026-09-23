"""Generate the hand-designed line-drawn exercise illustrations.

Source of truth for app/static/exercises/*.svg. Every file is 200x200
viewBox stroke line-art in a single ink (#1f2937): circle head, line
torso/limbs, minimal equipment lines, small motion arrows. No fills
except joint dots and arrowheads.

Re-run:  python scripts/illustrations.py
"""
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

INK = "#1f2937"
OUT = os.path.join(os.path.dirname(__file__), "..", "app", "static", "exercises")


# ---------------------------------------------------------------- primitives
def line(x1, y1, x2, y2):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>'


def head(x, y, r=12):
    return f'<circle cx="{x}" cy="{y}" r="{r}"/>'


def dot(x, y, r=3.4):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{INK}" stroke="none"/>'


def rect(x, y, w, h):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>'


def circ(x, y, r):
    return f'<circle cx="{x}" cy="{y}" r="{r}"/>'


def barbell(x1, x2, y):
    """Horizontal bar with plate rects at both ends."""
    return line(x1, y, x2, y) + rect(x1 - 7, y - 13, 5, 26) + rect(x2 + 2, y - 13, 5, 26)


def dumbbell(x, y, vertical=False):
    return line(x, y - 9, x, y + 9) if vertical else line(x - 9, y, x + 9, y)


def arrow(x1, y1, x2, y2):
    ang = math.atan2(y2 - y1, x2 - x1)
    L, spread = 11, math.radians(26)
    p1 = (x2 - L * math.cos(ang - spread), y2 - L * math.sin(ang - spread))
    p2 = (x2 - L * math.cos(ang + spread), y2 - L * math.sin(ang + spread))
    return (
        line(x1, y1, x2, y2)
        + f'<polyline points="{p1[0]:.1f},{p1[1]:.1f} '
        + f'{x2},{y2} {p2[0]:.1f},{p2[1]:.1f}"/>'
    )


def arc_arrow(cx, cy, r, a1_deg, a2_deg):
    """Curved motion arrow; angles in degrees, 0 = east, positive clockwise."""
    a1, a2 = math.radians(a1_deg), math.radians(a2_deg)
    x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
    x2, y2 = cx + r * math.cos(a2), cy + r * math.sin(a2)
    large = 1 if abs(a2 - a1) > math.pi else 0
    sweep = 1 if a2 > a1 else 0
    path = (
        f'<path d="M {x1:.1f},{y1:.1f} '
        f'A {r},{r} 0 {large},{sweep} {x2:.1f},{y2:.1f}"/>'
    )
    tang = a2 + math.pi / 2 if sweep else a2 - math.pi / 2
    L, spread = 11, math.radians(26)
    p1 = (x2 - L * math.cos(tang - spread), y2 - L * math.sin(tang - spread))
    p2 = (x2 - L * math.cos(tang + spread), y2 - L * math.sin(tang + spread))
    return path + (
        f'<polyline points="{p1[0]:.1f},{p1[1]:.1f} '
        f'{x2:.1f},{y2:.1f} {p2[0]:.1f},{p2[1]:.1f}"/>'
    )


def standing_legs(x, hip_y, spread=14, foot_y=158):
    return line(x, hip_y, x - spread, foot_y) + line(x, hip_y, x + spread, foot_y)


def doc(title, parts):
    body = "".join(parts)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" '
        f'role="img"><title>{title}</title>'
        f'<g fill="none" stroke="{INK}" stroke-width="4" '
        f'stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>\n'
    )


# ------------------------------------------------------------------ day 1
def p_chest_press():
    # Seated machine chest press, pressing handles forward.
    return [
        line(55, 80, 55, 150), line(55, 150, 100, 150),          # bench
        head(80, 60), line(80, 72, 80, 118), dot(80, 118),
        line(80, 118, 106, 118), line(106, 118, 106, 150),       # legs
        line(80, 86, 116, 94),                                   # arms to handles
        line(140, 40, 140, 170), line(140, 94, 116, 94),         # machine + handles
        rect(148, 115, 16, 45),                                  # weight stack
        arrow(100, 62, 132, 62),
    ]


def p_incline_press(mirror=False):
    # Dumbbell incline press on an inclined bench.
    ax = -1 if mirror else 1
    return [
        line(55, 150, 115, 75), line(55, 150, 95, 150),          # bench
        head(108, 62), line(100, 74, 70, 112), dot(70, 112),
        line(70, 112, 100, 118), line(100, 118, 100, 150),       # legs
        line(85, 92, 85, 55), dumbbell(85, 50),                  # pressing arm
        arrow(85 + 30 * ax, 95, 85 + 30 * ax, 60),
    ]


def p_dips():
    return [
        line(55, 110, 90, 110), line(110, 110, 145, 110),        # parallel bars
        line(55, 110, 55, 150), line(145, 110, 145, 150),
        head(100, 68), line(100, 80, 100, 112),
        line(100, 90, 72, 110), line(100, 90, 128, 110),        # arms to bars
        line(100, 112, 86, 132), line(86, 132, 96, 152),         # bent legs
        arrow(152, 85, 152, 115),
    ]


def p_chest_fly(mirror=False):
    ax = -1 if mirror else 1
    return [
        line(40, 130, 140, 130), line(50, 130, 50, 160),
        line(130, 130, 130, 160),                                 # flat bench
        head(48, 116), line(60, 124, 108, 124),
        line(108, 124, 132, 124), line(132, 124, 132, 152),      # legs
        line(84, 124, 84, 88), dumbbell(84, 82),                 # fly arm up
        arrow(84 - 26 * ax, 100, 84 - 8 * ax, 88),
        arrow(84 + 26 * ax, 100, 84 + 8 * ax, 88),
    ]


def p_shoulder_press():
    return [
        head(100, 52), line(100, 64, 100, 112),
        standing_legs(100, 112),
        line(100, 76, 72, 58), line(100, 76, 128, 58),           # arms overhead
        line(64, 50, 80, 66), line(120, 66, 136, 50),            # dumbbells
        arrow(150, 70, 150, 42),
    ]


def p_lateral_raises():
    return [
        head(100, 52), line(100, 64, 100, 112),
        standing_legs(100, 112),
        line(100, 76, 58, 84), line(100, 76, 142, 84),           # arms out
        line(50, 78, 58, 90), line(142, 90, 150, 78),            # dumbbells
        arrow(58, 84, 58, 56), arrow(142, 84, 142, 56),
    ]


def p_triceps_extensions():
    return [
        head(100, 52), line(100, 64, 100, 112),
        standing_legs(100, 112),
        line(100, 76, 116, 48), line(116, 48, 96, 38),          # bent overhead
        line(88, 32, 104, 44),                                   # dumbbell
        arrow(134, 48, 134, 80),
    ]


# ------------------------------------------------------------------ day 2
def p_pull_ups():
    return [
        line(60, 40, 140, 40), line(60, 40, 60, 18), line(140, 40, 140, 18),
        line(100, 86, 76, 42), line(100, 86, 124, 42),          # arms to bar
        head(100, 72), line(100, 84, 100, 128),
        line(100, 128, 114, 148), line(114, 148, 104, 164),     # bent legs
        arrow(134, 140, 134, 100),
    ]


def p_row():
    # Bent-over barbell row.
    return [
        head(58, 76), line(70, 84, 118, 92), dot(118, 92),
        line(118, 92, 128, 128), line(128, 128, 128, 158),       # legs
        line(88, 88, 94, 132),                                   # pulling arm
        barbell(58, 132, 136),
        arrow(94, 132, 94, 104),
    ]


def p_rows():
    # Seated cable row (distinct from bent-over "Row").
    return [
        line(150, 120, 110, 132), rect(156, 110, 16, 50),        # cable + stack
        line(132, 110, 132, 160),                                # foot plate
        line(56, 148, 100, 148),                                 # bench
        head(76, 102), line(76, 114, 78, 146),
        line(78, 146, 118, 148), line(118, 148, 126, 160),       # legs to plate
        line(78, 122, 104, 130), line(104, 130, 112, 132),       # arms to handle
        arrow(104, 130, 76, 130),
    ]


def p_pull_downs():
    return [
        line(152, 30, 152, 170), line(152, 34, 100, 34),         # machine
        line(100, 34, 100, 66), line(76, 66, 124, 66),          # cable + bar
        line(70, 158, 130, 158),                                 # seat
        head(100, 104), line(100, 116, 100, 156),
        line(100, 154, 126, 154), line(126, 154, 126, 180),     # seated legs
        line(100, 124, 86, 68), line(100, 124, 114, 68),        # arms to bar
        arrow(140, 80, 140, 112),
    ]


def p_rear_fly(mirror=False):
    ax = -1 if mirror else 1
    return [
        head(58, 76), line(70, 84, 118, 92), dot(118, 92),
        line(118, 92, 128, 128), line(128, 128, 128, 158),
        line(88, 88, 88 + 36 * ax, 108),                         # arm out to side
        line(88 + 36 * ax - 8, 102, 88 + 36 * ax + 8, 114)
        if ax > 0 else line(88 + 36 * ax - 8, 114, 88 + 36 * ax + 8, 102),
        arrow(88 + 36 * ax, 108, 88 + 36 * ax, 78),
    ]


def p_seated_curls():
    return [
        line(58, 78, 58, 140), line(58, 140, 108, 140),          # bench
        head(78, 60), line(78, 72, 78, 122), dot(78, 122),
        line(78, 122, 106, 122), line(106, 122, 106, 156),       # legs
        line(78, 86, 94, 102), line(94, 102, 94, 76),            # curling arm
        dumbbell(94, 70),
        arrow(114, 100, 114, 66),
    ]


def p_hammer_curls():
    return [
        head(100, 50), line(100, 62, 100, 112),
        standing_legs(100, 112),
        line(100, 76, 92, 100), line(92, 100, 92, 74),          # neutral-grip arm
        dumbbell(92, 66, vertical=True),
        arrow(74, 98, 74, 62),
    ]


def p_reverse_curls():
    return [
        head(100, 50), line(100, 62, 100, 112),
        standing_legs(100, 112),
        line(100, 76, 88, 108), line(100, 76, 112, 108),        # pronated arms
        line(76, 108, 124, 108),                                 # bar
        arrow(136, 108, 136, 74),
    ]


def p_curls():
    return [
        head(100, 50), line(100, 62, 100, 112),
        standing_legs(100, 112),
        line(100, 76, 88, 100), line(88, 100, 88, 70),          # supinated curl
        dumbbell(88, 64),
        arrow(70, 96, 70, 60),
    ]


# ------------------------------------------------------------------ day 3
def p_squats():
    return [
        barbell(58, 142, 60),
        head(100, 42), line(100, 54, 100, 102), dot(100, 102),
        line(100, 102, 74, 128), line(74, 128, 77, 158),         # bent legs
        line(100, 66, 74, 60), line(100, 66, 126, 60),           # arms to bar
        arrow(154, 120, 154, 84),
    ]


def p_leg_press():
    return [
        line(58, 152, 88, 102), line(58, 152, 80, 152),          # seat back
        head(94, 88), line(88, 100, 68, 136),
        line(68, 136, 104, 112), line(104, 112, 128, 128),      # legs to platform
        line(128, 78, 148, 138), line(148, 138, 148, 165),       # platform
        arrow(112, 142, 132, 108),
    ]


def p_seated_leg_curl_leg_extension():
    # Seated leg extension (quads) on the combo machine.
    return [
        line(58, 78, 58, 140), line(58, 140, 108, 140),          # seat
        head(78, 60), line(78, 72, 78, 122),
        line(78, 122, 106, 122), line(106, 122, 134, 106),      # extended shin
        line(106, 140, 136, 112), circ(138, 104, 6),            # machine arm + pad
        arrow(152, 118, 152, 82),
    ]


def p_romanian_deadlift():
    return [
        head(68, 66), line(80, 76, 124, 84), dot(124, 84),       # hinged torso
        line(124, 84, 130, 126), line(130, 126, 130, 158),       # straight legs
        line(94, 82, 94, 122),                                   # hanging arms
        barbell(60, 130, 126),
        arrow(94, 122, 94, 92),
    ]


def p_calf_raises():
    return [
        rect(66, 156, 68, 12),                                   # step
        head(100, 52), line(100, 64, 100, 112),
        line(100, 112, 96, 152), line(100, 112, 104, 152),
        line(92, 156, 108, 156),                                 # feet on step
        line(68, 100, 80, 112), line(120, 112, 132, 100),        # dumbbells
        arrow(146, 120, 146, 88),
    ]


def p_crunches():
    return [
        line(36, 160, 164, 160),                                 # floor
        head(54, 138), line(66, 146, 104, 146),
        line(104, 146, 120, 124), line(120, 124, 120, 156),     # bent knees
        line(80, 146, 94, 138),                                  # crossed arms
        arrow(40, 128, 40, 96),
    ]


def p_leg_raises():
    return [
        line(36, 160, 164, 160),                                 # floor
        head(50, 146), line(62, 150, 110, 150),
        line(110, 150, 110, 84), line(102, 84, 118, 84),        # raised legs
        line(80, 150, 62, 154),                                  # arms at sides
        arrow(132, 138, 132, 96),
    ]


# ------------------------------------------------------------------ day 4
def p_pushdowns():
    return [
        line(152, 30, 152, 170), line(152, 38, 110, 38),         # machine
        line(110, 38, 110, 66), line(94, 66, 126, 66),          # cable + bar
        head(100, 98), line(100, 110, 100, 154),
        line(100, 154, 88, 182), line(100, 154, 112, 182),      # legs
        line(100, 120, 98, 68),                                  # pressing arm
        arrow(136, 80, 136, 116),
    ]


def p_wrist_curls(up=True):
    return [
        line(58, 78, 58, 140), line(58, 140, 108, 140),          # bench
        head(78, 60), line(78, 72, 78, 122),
        line(78, 122, 106, 122),                                 # thigh
        line(80, 102, 106, 120),                                 # forearm on thigh
        line(110, 118, 122, 130),                                # dumbbell at wrist
        arrow(132, 140, 132, 112) if up else arrow(132, 112, 132, 140),
    ]


# ------------------------------------------------------------------ day 5
def p_back_extension():
    return [
        line(66, 118, 130, 118), line(98, 118, 98, 164),         # bench + post
        line(80, 164, 116, 164),
        head(52, 82), line(64, 90, 108, 110),                    # raised torso
        line(108, 110, 148, 114), line(148, 114, 148, 148),     # secured legs
        line(82, 98, 96, 106),                                   # crossed arms
        arrow(84, 86, 84, 56),
    ]


def p_bulgarian_split_squats():
    # Rear foot elevated on a bench behind.
    return [
        line(132, 128, 166, 128), line(138, 128, 138, 160),
        line(160, 128, 160, 160),                                 # bench
        head(84, 52), line(84, 64, 84, 108), dot(84, 108),
        line(84, 108, 62, 138), line(62, 138, 65, 168),          # front leg
        line(84, 108, 124, 126), line(124, 126, 136, 128),       # rear leg up
        line(56, 98, 68, 110), line(100, 110, 112, 98),          # dumbbells
        arrow(40, 108, 40, 140),
    ]


def p_leg_curls():
    # Lying leg curl: shins curl up against the machine pad.
    return [
        line(40, 128, 122, 128), line(50, 128, 50, 158),
        line(112, 128, 112, 158),                                 # bench
        head(50, 112), line(62, 120, 110, 120),
        line(110, 120, 140, 120), line(140, 120, 140, 88),       # curled shin
        line(140, 136, 140, 92), circ(140, 96, 6),               # lever + pad
        arrow(156, 108, 156, 72),
    ]


def p_twist_machine():
    return [
        line(66, 150, 134, 150), line(100, 150, 100, 170),       # seat
        line(58, 96, 58, 150), line(142, 96, 142, 150),          # handles
        head(100, 88), line(100, 100, 100, 148),
        line(100, 112, 66, 120), line(100, 112, 134, 120),       # arms to handles
        line(100, 148, 80, 150), line(100, 148, 120, 150),
        line(80, 150, 80, 168), line(120, 150, 120, 168),        # legs
        arc_arrow(100, 108, 46, 200, 340),                       # rotation cue
    ]


# ------------------------------------------------------- registry + writer
# name -> pose builder. Near-duplicate names (Row/Rows, Chest fly/Chest
# flys, ...) get their own file; mirrored variants keep the set coherent.
POSES = {
    "Chest press": p_chest_press,
    "Incline press": p_incline_press,
    "Dips": p_dips,
    "Chest fly": p_chest_fly,
    "Shoulder press": p_shoulder_press,
    "Lateral raises": p_lateral_raises,
    "Triceps extensions": p_triceps_extensions,
    "Pull-ups": p_pull_ups,
    "Row": p_row,
    "Pull-downs": p_pull_downs,
    "Rear fly": p_rear_fly,
    "Seated curls": p_seated_curls,
    "Hammer curls": p_hammer_curls,
    "Reverse curls": p_reverse_curls,
    "Squats": p_squats,
    "Leg press": p_leg_press,
    "Seated leg curl / leg extension": p_seated_leg_curl_leg_extension,
    "Romanian deadlift": p_romanian_deadlift,
    "Calf raises": p_calf_raises,
    "Crunches": p_crunches,
    "Leg raises": p_leg_raises,
    "Incline chest press": lambda: p_incline_press(mirror=True),
    "Rows": p_rows,
    "Chest flys": lambda: p_chest_fly(mirror=True),
    "Rear flys": lambda: p_rear_fly(mirror=True),
    "Pushdowns": p_pushdowns,
    "Curls": p_curls,
    "Wrist curls": lambda: p_wrist_curls(up=True),
    "Reverse wrist curls": lambda: p_wrist_curls(up=False),
    "Back extension": p_back_extension,
    "Bulgarian split squats": p_bulgarian_split_squats,
    "Leg curls": p_leg_curls,
    "Twist machine": p_twist_machine,
}


def main():
    from app.seed import ROUTINE, slug

    os.makedirs(OUT, exist_ok=True)
    names = [name for _, _, exs in ROUTINE for _, name, _, _, _ in exs]
    assert len(POSES) == len(set(names)), (
        f"registry has {len(POSES)} poses but seed has {len(set(names))} "
        "unique names"
    )
    missing = [n for n in set(names) if n not in POSES]
    assert not missing, f"no pose for: {missing}"

    worst = 0
    for name in sorted(set(names)):
        key = slug(name)
        svg = doc(name, POSES[name]())
        # validate XML + viewBox before writing
        root = ET.fromstring(svg)
        assert root.tag == "{http://www.w3.org/2000/svg}svg", key
        assert root.attrib["viewBox"] == "0 0 200 200", key
        path = os.path.join(OUT, key + ".svg")
        with open(path, "w") as f:
            f.write(svg)
        size = os.path.getsize(path)
        worst = max(worst, size)
        assert size < 3 * 1024, f"{key}.svg is {size} bytes"
    print(f"wrote {len(set(names))} illustrations to {OUT} "
          f"(largest {worst} bytes)")


if __name__ == "__main__":
    main()
