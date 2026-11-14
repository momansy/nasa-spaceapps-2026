# T007 — Core flight physics kernel (package B2, part 1)

**Worker:** `momansy` (Codex) · **Owns:** `core/Runtime/Flight/`, `core/dotnet~/Tests/Flight/`

Needs the .NET 8 SDK (`dotnet --version`). If it is missing, install it from the official
Microsoft installer; it is a free build tool. This task uses no MCP server.

This is a bounded task. Work in the order below and finish and test each item before the
next, so that whatever exists when the run ends is usable.

## Goal

The physics the flight simulation runs on, in pure C# with no Unity dependency, exactly as
specified in design section 8.1 and 8.2. Follow `core/README.md` and
`orchestration/ARCHITECTURE.md` section 3: `netstandard2.1`, C# 9, SI units with unit
suffixes on every public name, no `System.Random`, no I/O, no wall-clock time. Use the
constants already in `core/Runtime/Constants/PhysicalConstants.cs`; do not duplicate them.

Task T002 is writing `core/Runtime/Build/` and `core/Runtime/Data/` at the same time. Do
not touch those folders. Define the small input types you need inside `Flight/`.

## Scope, in order

1. **Bodies and atmosphere.** `Body` (Earth, Mars: μ, radius, surface density, scale
   height, rotation). Gravity `g(r) = μ / r²`. Exponential atmosphere
   `ρ(h) = ρ0 · e^(−h/H)`, pressure ratio for thrust interpolation, speed of sound and
   Mach number (state the simplification you use).
2. **Forces.** Drag `D = ½ · ρ · v² · Cd · A` with Cd from a Mach lookup table that peaks
   near Mach 1 (table values are `game_value`; document them). Dynamic pressure
   `q = ½ · ρ · v²`. Thrust and Isp against altitude:
   `F(h) = F_vac − (F_vac − F_SL) · p(h)/p0`. Mass flow `ṁ = F / (Isp · g0)`.
3. **State and integration.** 2D state in the orbital plane (position, velocity, mass),
   as design section 8.3 prescribes. Fixed step 1/120 s, RK4, for powered and atmospheric
   flight. Deterministic: the same inputs give bit-identical outputs.
4. **Orbital mechanics.** Orbital elements from a state vector (semi-major axis by
   vis-viva, eccentricity, apoapsis, periapsis, period, true anomaly). Analytic Kepler
   propagation for unpowered vacuum coasts, used for time warp; switching between RK4
   and Kepler conserves energy within a stated tolerance.
5. **Entry.** Sutton–Graves heating `q̇ = k · √(ρ / r_n) · v³` with k ≈ 1.74 × 10⁻⁴ (SI,
   Earth), integrated heat load, g-load `|a_non-gravitational| / g0`, flight-path angle.
6. **Launch geometry.** Eastward rotation boost `465 m/s × cos(latitude)` and the
   launch-azimuth Δv penalty for inclination as the simplified model in section 8.3
   (define the formula, tag it `game_value`, document it).

## Acceptance

- `dotnet test core/dotnet~` passes. Tests use textbook values with the arithmetic shown
  in comments: circular orbit speed at 400 km (about 7.67 km/s), orbital period at 400 km
  (about 92.4 min), escape speed, density at one and two scale heights, a vertical coast
  compared with the closed-form solution, RK4 against Kepler over one full orbit (energy
  and position drift stated), Hohmann transfer Δv LEO to GEO compared with the textbook
  figure, peak heating of a ballistic entry within a sane range, determinism (two runs
  bit-identical).
- Public API has XML comments with units. Each game simplification is named in a comment
  and listed in your summary so the Codex can disclose it (design section 8.3).
- Summary lists every number you had to choose, tagged `game_value`.

## Not in this task

Flight phases, failure rolls, aborts, assist levels and autopilots (part 2).

## Design references

Sections 8.1, 8.2, 8.3, 19.
