"""Shared dimensions of the MissionForge rocket kit. All lengths in metres.

Value tags (design section 19):
  physical                - constants of nature / propellant densities
  real_world_approximate  - rounded from the real hardware class named as the part's twin
  game_value              - layout choices made for the kit (tier -> diameter, margins)
"""
from __future__ import annotations

import math

# --------------------------------------------------------------------------- diameters
# Stack diameters fixed by the task brief (game_value, chosen from real vehicle classes:
# small launcher 1.5, medium 3.7, heavy 5.4, super-heavy 8.4).
DIAMETERS = {"d15": 1.5, "d37": 3.7, "d54": 5.4, "d84": 8.4}
DIAMETER_KEYS = list(DIAMETERS)  # ordered small -> large


def dkey(d: float) -> str:
    for k, v in DIAMETERS.items():
        if abs(v - d) < 1e-6:
            return k
    raise KeyError(d)


SKIN = 0.02  # visual wall thickness of skirts / shells at open ends (game_value)

# --------------------------------------------------------------------------- engines
# length = attach_top plane (gimbal mount face) to nozzle exit plane.
# exit_d = nozzle exit outer diameter. envelope_d = widest point (bell or powerhead).
# All real_world_approximate from the twin named in GAME_DESIGN.md 7.7 / 7.8.
ENGINES = {
    # ---- first stage (7.7)
    "eng_kerolox_workhorse": dict(stage=1, name="Kerolox Workhorse", twin="Merlin 1D",
                                  length=2.9, exit_d=0.92, envelope_d=1.25, mount_d=0.55),
    "eng_kerolox_giant": dict(stage=1, name="Kerolox Giant", twin="F-1 (Saturn V)",
                              length=5.6, exit_d=3.7, envelope_d=3.7, mount_d=1.5),
    "eng_kerolox_staged_combustion": dict(stage=1, name="Kerolox Staged-Combustion",
                                          twin="RD-180 class (two chambers, one turbopump)",
                                          length=3.6, exit_d=1.45, envelope_d=3.15, mount_d=1.6,
                                          nozzles=2, nozzle_spacing=1.62),
    "eng_hydrolox_high_efficiency": dict(stage=1, name="Hydrolox High-Efficiency", twin="RS-25",
                                         length=4.3, exit_d=2.4, envelope_d=2.4, mount_d=1.0),
    "eng_methalox_full_flow": dict(stage=1, name="Methalox Full-Flow", twin="Raptor class",
                                   length=3.1, exit_d=1.3, envelope_d=1.35, mount_d=0.8),
    "eng_electric_pump_mini": dict(stage=1, name="Electric-Pump Mini", twin="Rutherford",
                                   length=0.65, exit_d=0.25, envelope_d=0.42, mount_d=0.2),
    # ---- upper stage (7.8)
    "eng_hydrolox_vacuum": dict(stage=2, name="Hydrolox Vacuum", twin="RL10",
                                length=2.2, exit_d=1.45, envelope_d=1.45, mount_d=0.5),
    "eng_kerolox_vacuum": dict(stage=2, name="Kerolox Vacuum", twin="Merlin Vacuum",
                               length=3.9, exit_d=3.0, envelope_d=3.0, mount_d=0.55),
    "eng_methalox_vacuum": dict(stage=2, name="Methalox Vacuum", twin="Raptor Vacuum class",
                                length=4.7, exit_d=2.5, envelope_d=2.5, mount_d=0.8),
    "eng_hypergolic_storable": dict(stage=2, name="Hypergolic Storable",
                                    twin="AJ10-137 (Apollo Service Propulsion System)",
                                    length=3.9, exit_d=2.5, envelope_d=2.5, mount_d=0.7),
    "eng_solid_kick_motor": dict(stage=2, name="Solid Kick Motor", twin="Star 48 class",
                                 length=2.03, exit_d=0.75, envelope_d=1.24, mount_d=0.9),
}

# --------------------------------------------------------------------------- tanks
# Propellant mass per size tier, tonnes (game_value, GAME_DESIGN.md 7.9).
TANK_PROP_T = {
    1: {"xs": 12.0, "s": 120.0, "m": 280.0, "l": 420.0, "xl": 1000.0},
    2: {"xs": 2.5, "s": 25.0, "m": 60.0, "l": 110.0, "xl": 250.0},
}
# Bulk propellant density, kg/m^3 (physical, from component densities at the usual
# mixture ratio): RP-1 810 + LOX 1141 at O/F 2.56 -> ~1020; LH2 71 + LOX 1141 at O/F 6 -> ~360.
BULK_DENSITY = {"standard": 1020.0, "hydrolox": 360.0}
ULLAGE = 1.03  # 3 % ullage volume (game_value)
# Diameter per stage / tier / family (game_value). Hydrolox moves up one diameter class
# where the standard diameter would give a fineness ratio above ~12.
TANK_DIAMETER = {
    (1, "standard"): {"xs": 1.5, "s": 3.7, "m": 3.7, "l": 5.4, "xl": 8.4},
    (1, "hydrolox"): {"xs": 1.5, "s": 3.7, "m": 5.4, "l": 5.4, "xl": 8.4},
    (2, "standard"): {"xs": 1.5, "s": 3.7, "m": 3.7, "l": 3.7, "xl": 5.4},
    (2, "hydrolox"): {"xs": 1.5, "s": 3.7, "m": 3.7, "l": 5.4, "xl": 8.4},
}
# Extra length on top of the equivalent-cylinder length, as a multiple of the diameter
# (game_value): separate tanks + intertank + skirts for a first stage, common dome +
# skirts for an upper stage.
TANK_OVERHEAD = {1: 0.90, 2: 0.45}
# Oxidiser share of the propellant VOLUME (physical, from the densities above).
OX_VOLUME_FRACTION = {"standard": 0.645, "hydrolox": 0.272}
TANK_SIZES = ["xs", "s", "m", "l", "xl"]


def tank_id(stage: int, size: str, family: str = "standard") -> str:
    base = f"tank_s{stage}_{size}"
    return base if family == "standard" else f"{base}_hydrolox"


def tank_dims(stage: int, size: str, family: str = "standard") -> dict:
    """Diameter, external length and derived layout numbers for one tank."""
    d = TANK_DIAMETER[(stage, family)][size]
    prop_kg = TANK_PROP_T[stage][size] * 1000.0
    volume = prop_kg / BULK_DENSITY[family] * ULLAGE
    area = math.pi * (d / 2.0) ** 2
    l_eq = volume / area
    length = round(l_eq + TANK_OVERHEAD[stage] * d, 1)
    return dict(diameter=d, length=length, volume_m3=round(volume, 1), prop_t=prop_kg / 1000.0,
                ox_fraction=OX_VOLUME_FRACTION[family], stage=stage, size=size, family=family)


# --------------------------------------------------------------------------- mounts
# First-stage engine mount = aft skirt + thrust structure. height: skirt height.
# recess: height of the engine attach plane (attach_engine_N) above the skirt's bottom rim.
S1_MOUNT = {
    1.5: dict(height=0.7, recess=0.25),
    3.7: dict(height=1.6, recess=0.55),
    5.4: dict(height=2.2, recess=0.75),
    8.4: dict(height=3.2, recess=1.10),
}
S1_ENGINE_COUNTS = [1, 3, 5, 9]
# Upper-stage mount = thrust cone hanging under the tank, inside the interstage.
S2_MOUNT = {1.5: dict(height=0.35), 3.7: dict(height=0.8), 5.4: dict(height=1.1), 8.4: dict(height=1.6)}
S2_ENGINE_COUNTS = [1, 2]


def s1_pattern(count: int, d: float) -> list[tuple[float, float]]:
    """(x, y) of each first-stage engine slot, slot 1 first. game_value."""
    r = d / 2.0
    if count == 1:
        return [(0.0, 0.0)]
    if count == 3:
        ring_r, n, centre = 0.55 * r, 3, False
    elif count == 5:
        ring_r, n, centre = (0.88 if d > 8.0 else 0.72) * r, 4, True
    elif count == 9:
        ring_r, n, centre = (0.75 if d > 8.0 else 0.72) * r, 8, True
    else:
        raise ValueError(count)
    pts = [(0.0, 0.0)] if centre else []
    phase = math.pi / 2.0 if count == 3 else (math.pi / 4.0 if count == 5 else 0.0)
    for k in range(n):
        a = phase + math.tau * k / n
        pts.append((round(ring_r * math.cos(a), 4), round(ring_r * math.sin(a), 4)))
    return pts


def s2_pattern(count: int, d: float) -> list[tuple[float, float]]:
    if count == 1:
        return [(0.0, 0.0)]
    if count == 2:
        return [(0.25 * d, 0.0), (-0.25 * d, 0.0)]
    raise ValueError(count)


def slot_clear_diameter(pts: list[tuple[float, float]], d: float, inside: bool) -> float:
    """Largest engine envelope diameter that does not touch a neighbouring engine
    (and, for upper stages, stays 0.08 m clear of the interstage wall)."""
    best = d if len(pts) == 1 else 1e9
    for i, a in enumerate(pts):
        for b in pts[i + 1:]:
            best = min(best, math.hypot(a[0] - b[0], a[1] - b[1]))
    if inside:
        for a in pts:
            best = min(best, 2.0 * (d / 2.0 - 0.08 - math.hypot(*a)))
    return round(best, 2)


# --------------------------------------------------------------------------- interstages
# Length per TOP diameter: houses the upper-stage mount plus the longest upper engine
# (Methalox Vacuum, 4.7 m) with clearance. game_value.
INTERSTAGE_LENGTH = {1.5: 2.9, 3.7: 6.0, 5.4: 6.4, 8.4: 7.0}
SEPARATION_SYSTEMS = ["pyro", "pneumatic", "hot_staging"]  # design 7.12
# (bottom diameter, top diameter) pairs authored: straight, one class down, one class up.
STACK_PAIRS = [(1.5, 1.5), (3.7, 3.7), (5.4, 5.4), (8.4, 8.4),
               (3.7, 1.5), (5.4, 3.7), (8.4, 5.4),
               (1.5, 3.7), (3.7, 5.4), (5.4, 8.4)]
def interstage_keepout(d_top: float) -> float:
    """Radial depth below the interstage skin that interstage internals may occupy.

    Inside r < d_top/2 - keepout (above z = 0.45 m) the interstage must stay empty: the
    upper-stage mount and engine live there. Upper-stage mounts keep their own geometry
    within r <= d_top/2 - keepout - 0.02."""
    return round(max(0.09, 0.06 * d_top), 3)


HOT_STAGE_SHIELD_MAX_RISE = 0.40


def pair_suffix(d_bottom: float, d_top: float) -> str:
    kb, kt = dkey(d_bottom), dkey(d_top)
    return kb if kb == kt else f"{kb}_to_{kt}"


def interstage_id(system: str, d_bottom: float, d_top: float) -> str:
    return f"interstage_{system}_{pair_suffix(d_bottom, d_top)}"


def adapter_id(d_bottom: float, d_top: float) -> str:
    return f"adapter_{pair_suffix(d_bottom, d_top)}"


ADAPTER_PAIRS = [p for p in STACK_PAIRS if p[0] != p[1]]


def adapter_length(d_bottom: float, d_top: float) -> float:
    """Plain conical payload/stack adapter: half-angle about 20 degrees. game_value."""
    return round(max(0.5, abs(d_bottom - d_top) / 2.0 / math.tan(math.radians(20.0))), 1)


# --------------------------------------------------------------------------- fairings
# design 7.5. diameter = maximum outer diameter; base_d = mating ring diameter.
FAIRINGS = {
    "fairing_small": dict(diameter=1.5, base_d=1.5, length=3.6, name="Small fairing"),
    "fairing_standard": dict(diameter=4.0, base_d=3.7, length=11.0, name="Standard fairing"),
    "fairing_large": dict(diameter=5.4, base_d=5.4, length=14.5, name="Large fairing"),
    "fairing_reusable_large": dict(diameter=5.4, base_d=5.4, length=14.5,
                                   name="Reusable large fairing", reusable=True),
}

# --------------------------------------------------------------------------- boosters
# design 7.11. gap = distance between booster skin and core skin.
BOOSTERS = {
    "booster_small_solid": dict(diameter=1.6, length=20.0, gap=0.22, twin="GEM-63 class",
                                attach_fwd_z=15.0, attach_aft_z=1.6),
    "booster_heavy_solid": dict(diameter=3.7, length=45.5, gap=0.50,
                                twin="Space Shuttle / SLS solid rocket booster",
                                attach_fwd_z=37.5, attach_aft_z=3.2, segments=4),
}
# Liquid side boosters (design 7.11, "= first stage", Falcon Heavy style). A side core is
# built from the same first-stage kit parts as the core (mount + engines + tank) and is
# topped by this nose cone, which carries the forward attach fitting. All game_value.
LIQUID_SIDE_NOSE = {d: dict(gap=round(0.10 * d + 0.12, 2), collar=round(0.45 * d, 2), nose=round(1.6 * d, 2))
                    for d in DIAMETERS.values()}


# --------------------------------------------------------------------------- T017: launch pad and gantry
# World parts (design 6.1, 6.10, 7.1). Frame: pad parts have their origin at ground level under the
# vehicle axis; gantry parts have their origin at ground level under the tower axis, so segments
# stack with identity transforms. All game_value layout choices; the clearances come from the
# largest vehicle the kit can build (8.4 m core with a 3.7 m heavy solid strap-on at a 0.5 m gap).
PAD_DECK_H = 9.0            # deck top above ground, m. Deep enough for the longest engine under a mount.
PAD_DECK_T = 2.0            # deck slab thickness, m
PAD_DECK_HALF_X = 9.0       # deck half width, m
PAD_DECK_HALF_Y = 15.0      # deck half length, m
PAD_OPENING = 10.0          # square launch-mount opening, m (> 8.4 m core)
PAD_MOUNT_R_IN, PAD_MOUNT_R_OUT, PAD_MOUNT_H = 4.35, 6.2, 0.8   # launch mount ring, m
PAD_CLAMPS = 8              # hold-down clamps around the core base ring
PAD_CLAMP_R = 4.2           # clamp jaw radius = 8.4 m core skin
TRENCH_HALF_W = 5.5         # clear half width of the flame trench, m
TRENCH_LEN_AFT = 15.0       # trench length behind the axis (under the deck), m
TRENCH_LEN_FWD = 40.0       # trench length ahead of the axis (exit), m
VEHICLE_ENVELOPE_R = 8.4    # core 4.2 + gap 0.5 + heavy solid 3.7 (spec.BOOSTERS), m
GANTRY_OFFSET_X = 12.0      # gantry axis offset from the vehicle axis along +X, m
GANTRY_HALF = 2.7           # tower half footprint (outer faces), m -> inner face at 9.3 m, clearance 0.9 m
GANTRY_LEG = 0.40           # corner leg section, m
GANTRY_SEGMENT_H = 6.0      # one stackable segment, m
GANTRY_BASE_H = PAD_DECK_H  # concrete pedestal so segment 1 starts at deck level, m
GANTRY_MAX_H = 60.0         # tallest authored stack in the Build Bay, m
WORLD_VALUE_TYPES = dict(
    PAD_DECK_H=("game_value", "LC-39A class pad: deck about 12 m above grade"),
    GANTRY_OFFSET_X="game_value", GANTRY_SEGMENT_H="game_value", GANTRY_HALF="game_value",
    VEHICLE_ENVELOPE_R="game_value")
