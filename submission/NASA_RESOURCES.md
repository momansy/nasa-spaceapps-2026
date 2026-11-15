# NASA and space-agency resources used

For the "NASA data and resources used" part of the NASA Space Apps Challenge 2026 submission, challenge
**Space Mission Design Game**. Each entry says how the resource was used, and where it was **not** used,
so the list can be pasted without overstating anything. Checked 2026-11-15 against the repository
(`orchestration/evidence/T042/README.md`).

**No live NASA data feed, API or private dataset is used.** The game ships static content: public NASA
imagery used as textures, and public NASA and agency documents used to check facts and to set rounded
engineering values. No NASA logo, insignia or mission patch is used as branding; in-game parts are generic
hardware with a "real-world twin" line. MissionForge is not affiliated with or endorsed by NASA.

## 1. The challenge's nine listed resources

Titles and links as listed on the HackAthlone mirror of the challenge page
(<https://hackathlone.com/challenges/space-mission-design-game>); the official spaceappschallenge.org page
could not be opened by the agent that wrote this file, so confirm the links against it.

| # | Resource | Used? | How |
|---|---|---|---|
| 1 | Design and Develop Science Missions (NASA systems-engineering overview) <https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf> | Concept only | The game's phases (contract and requirements, design votes, test campaign, design review, Flight Readiness Review, launch, operations, debrief) follow the project-lifecycle idea in `GAME_DESIGN.md` 2.3, which cites the NASA Systems Engineering Handbook. No text is copied. The agent that wrote this package did not re-read the handbook; the mapping is the design's own and is a simplification |
| 2 | General Mission Analysis Tool (GMAT) <https://software.nasa.gov/software/GSC-19468-1> | **No** | `GAME_DESIGN.md` 20.2 planned to cross-check contract delta-v numbers with GMAT. No GMAT run or output exists in the repository, so contract delta-v values are **not** GMAT-validated. They are rounded textbook and published values tagged `real_world_approximate` (assumptions register, `GAME_DESIGN.md` 19) |
| 3 | Concept Maturity Levels (JPL) <https://dataverse.jpl.nasa.gov/dataset.xhtml?persistentId=hdl:2014/44299> | Inspiration | Parts carry a maturity label (Proven, Mature, New) that sets an uncertainty band (about 1, 3 and 6 percent, game values). This is inspired by maturity and technology-readiness thinking, not an implementation of CMLs |
| 4 | Mission Design Lab (NASA Goddard) <https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/> | Inspiration | Team members with different roles trade off one shared design (10 mission-control roles, one vote per round). No MDL data or tool is used |
| 5 | NASA Mission Viz <https://nasa.github.io/mission-viz/> | Inspiration | Reference for the orbit-map and dashboard idea. The orbit map host screen is **planned**, not built. No code or data is used |
| 6 | A Learning Game About Telescopes (Webb "build it yourself") <https://science.nasa.gov/mission/webb/game-build-it-yourself/> | Inspiration | Same idea as the Payload Bay: choose instruments that match science goals. No content is copied |
| 7 | CubeSat 101 <https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf> | Concept only | The C1 Earth Watch satellite and the Payload Bay options (camera, power, UHF and other links) are generic small-satellite choices in the style of CubeSat and smallsat missions. Values are game values or rounded approximations; the document was not re-read for this package |
| 8 | Visualize a Space Mission Using Virtual Reality (2023 Space Apps challenge) <https://www.spaceappschallenge.org/2023/challenges/visualize-a-space-mission-using-virtual-reality/> | No | Listed only |
| 9 | Digital Games and Activities (Canadian Space Agency) <https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp> | No | Listed only. The CSA is the challenge's partner agency; no CSA content is used |

## 2. Facts shown to players: 40 facts, each checked against a NASA or agency source (task T025)

`data/facts.json` holds 40 facts. Each has a source URL, and each was checked against the cited page on
2026-11-14 (UTC) by a fact-verification task: 25 were confirmed as written and 15 were corrected to match the
source. None was rejected. Excerpts and the correction log are in `orchestration/evidence/T025/fact-sources.md`;
the generated list with access dates is on the credits page `docs/play/credits.html`. Checking script:
`node orchestration/evidence/T025/check-facts.mjs` (run again for this package: 40 facts, 40 verified, 0 errors).

How they are used: a fact appears inside the mechanic it explains (for example F04 Max Q in the Max Q Throttle
Bucket minigame, F11 solar irradiance in Solar Wing Deploy), in part-card "Did you know?" lines, in the Codex and
in the debrief. Facts in the "used in" column are minigame ids (`MG-xx`), flight phases or part categories.

Sources are NASA pages unless noted: USGS (F16 Landsat), ESA (F22 Ariane 501 inquiry report). Several facts
list second and third supporting NASA pages in `design_notes` (for example the SLS and CRS-6 press kits for F04).

| Id | Topic | Source (as shown in game) | Primary URL | Used in |
|---|---|---|---|---|
| F01 | Units | NASA, Mars Climate Orbiter Mishap Investigation Board Phase I Report, 1999 | <https://llis.nasa.gov/llis_lib/pdf/1009464main1_0641-mr.pdf> | minigames: MG-01 |
| F02 | Rocket equation | NASA Science, Basics of Space Flight, Chapter 3: Gravity & Mechanics; NASA Glenn, Beginner's Guide to Aeronautics: Ideal Rocket Equation and Stages | <https://science.nasa.gov/learn/basics-of-space-flight/chapter3-2/> | minigames: MG-02; channels: dashboard |
| F03 | Staging | NASA Glenn, Beginner's Guide to Rockets: Balloon Staging; NASA, Saturn I SA-8 Functional Systems Description Vol. X (SDES-64-414), 1964 | <https://www.grc.nasa.gov/www/K-12/rocket/TRCRocket/balloon_staging.html> | minigames: MG-10a |
| F04 | Max Q | NASA/USA, Space Shuttle Day-of-Launch Trajectory Design Operations, 2011; NASA, CHANGO: Boost Stage Guidance of the Space Launch System; NASA, SpaceX CRS-6 Press Kit, 2015 | <https://ntrs.nasa.gov/api/citations/20110003654/downloads/20110003654.pdf> | minigames: MG-08 |
| F05 | Orbit speed | NASA Orbital Debris Program Office, Frequently Asked Questions | <https://orbitaldebris.jsc.nasa.gov/faq/> | flight phases: F7 |
| F06 | ISS gravity | NASA, What Is Microgravity? (Grades 5-8) | <https://www.nasa.gov/learning-resources/for-kids-and-students/what-is-microgravity-grades-5-8/> | channels: myth_or_fact |
| F07 | Pogo | NASA, C. Larsen, NASA Experience with Pogo in Human Spaceflight Vehicles (NTRS 20080018689), 2008; NASA, Report of Apollo 13 Review Board, 1970 | <https://ntrs.nasa.gov/api/citations/20080018689/downloads/20080018689.pdf> | minigames: MG-11 |
| F08 | Engine-out | NASA Office of Inspector General, Commercial Cargo: NASA's Management of COTS and ISS Commercial Resupply Contracts (IG-13-016), 2013 | <https://oig.nasa.gov/wp-content/uploads/2024/02/ig-13-016.pdf> | minigames: MG-12 |
| F09 | DSN | NASA Space Communications and Navigation, What is the Deep Space Network? and Where is the DSN Located? | <https://www.nasa.gov/directorates/somd/space-communications-navigation-program/what-is-the-deep-space-network/> | minigames: MG-13 |
| F10 | Debris | NASA Orbital Debris Program Office, Frequently Asked Questions (2026) | <https://orbitaldebris.jsc.nasa.gov/faq/> | minigames: MG-14 |
| F11 | Solar | NASA Goddard, Solar Irradiance Science; NASA Small Spacecraft Systems Virtual Institute, State-of-the-Art: 3.0 Power | <https://earth.gsfc.nasa.gov/climate/projects/solar-irradiance/science> | minigames: MG-15 |
| F12 | Docking | NASA, STS-96 Press Kit: First Visit to an Outpost in Orbit, 1999 | <https://www.nasa.gov/wp-content/uploads/2023/05/sts-096-press-kit.pdf> | minigames: MG-16 |
| F13 | Apollo 11 | NASA, Apollo 11 Lunar Surface Journal: Program Alarms; NASA History, 50 Years Ago: One Small Step, One Giant Leap, 2019 | <https://www.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.1201-pa.html> | minigames: MG-17 |
| F14 | Eclipse | NASA Glenn, Raffaelle et al., Mission Applicability Assessment of Integrated Power Components and Systems (NASA/CP-2002-211831), 2002; NASA Science, Hubble Electrical Power | <https://ntrs.nasa.gov/api/citations/20030000609/downloads/20030000609.pdf> | minigames: MG-18 |
| F15 | Apollo 13 | NASA History, "Houston, We've Had a Problem" | <https://www.nasa.gov/history/houston-weve-had-a-problem/> | minigames: MG-19 |
| F16 | Landsat | USGS, Landsat Missions | <https://www.usgs.gov/landsat-missions> | minigames: MG-21 |
| F17 | Entry corridor | NASA JSC, Apollo 13 Guidance, Navigation, and Control Challenges (AIAA 2009-6455), 2009 | <https://ntrs.nasa.gov/api/citations/20090026451/downloads/20090026451.pdf> | minigames: MG-22 |
| F18 | Orion chutes | NASA, Orion Parachute Tests Prove Out Complex System for Human Deep Space Missions | <https://www.nasa.gov/missions/artemis/orion/orion-parachute-tests-prove-out-complex-system-for-human-deep-space-missions/> | minigames: MG-23 |
| F19 | Blackout | NASA JPL, Morabito, The Spacecraft Communications Blackout Problem Encountered during Passage or Entry of Planetary Atmospheres (IPN Progress Report 42-150), 2002 | <https://ipnpr.jpl.nasa.gov/progress_report/42-150/150C.pdf> | minigames: MG-25 |
| F20 | Mars delay | NASA Science, Speaking Percy's Language: How to Talk so Perseverance Will Listen | <https://science.nasa.gov/blog/speaking-percys-language-how-to-talk-so-perseverance-will-listen/> | minigames: MG-26 |
| F21 | Genesis | NASA Science, Genesis mission page; NASA, Genesis Mishap Investigation Board Report, 2006 | <https://science.nasa.gov/mission/genesis/> | minigames: MG-04 |
| F22 | Ariane 5 | ESA/CNES, Ariane 5 Flight 501 Failure: Report by the Inquiry Board, 1996 | <https://sci.esa.int/science-e/www/object/doc.cfm?fobjectid=38888> | channels: failure_model |
| F23 | Fairings | NASA, NASA Investigative Summary: Taurus XL T8 and T9 Mission Failures, 2019 | <https://www.nasa.gov/wp-content/uploads/2019/04/oco_glory_public_summary_update_-_for_the_web_-_04302019.pdf> | part categories: fairing |
| F24 | ISS inclination | NASA, Stockman, International Space Station Systems Engineering Case Study (Air Force Center for Systems Engineering); NASA Earth Observatory, Catalog of Earth Satellite Orbits | <https://www.nasa.gov/wp-content/uploads/2015/05/design_iss_systems_engineering_case_study.pdf> | part categories: launch_site |
| F25 | Hypergolics | NASA History, 60 Years Ago: First Test Firing of the Apollo Service Propulsion System, 2024 | <https://www.nasa.gov/history/60-years-ago-first-test-firing-of-the-apollo-service-propulsion-system/> | part categories: upper_stage_engine |
| F26 | F-1 | NASA History, Solving Combustion Instability and Saving America's First Trips to the Moon | <https://www.nasa.gov/history/solving-combustion-instability-and-saving-americas-first-trips-to-the-moon/> | part categories: first_stage_engine |
| F27 | N1 | NASA History, Mir Hardware Heritage, Part 1: Soyuz | <https://www.nasa.gov/wp-content/uploads/static/history/SP-4225/documentation/mhh/mirhh-part1.pdf> | part categories: engine_count |
| F28 | Stardust | NASA/JPL, Stardust Sample Return Press Kit, January 2006; NASA Langley, Reconstruction of the Stardust Entry, 2007 | <https://www.jpl.nasa.gov/news/press_kits/stardust-return.pdf> | part categories: heat_shield |
| F29 | LOFTID | NASA Ames, LOFTID Inflatable Heat Shield Test A Success, Early Results Show, 2022 | <https://www.nasa.gov/centers-and-facilities/ames/loftid-inflatable-heat-shield-test-a-success-early-results-show/> | part categories: heat_shield |
| F30 | Soyuz MS-10 | NASA Space Station blog, Statement on Soyuz MS-10 Launch Abort, Launch Update and Station Crew Busy With Science After Aborted Launch Ascent, October 2018 | <https://www.nasa.gov/blogs/spacestation/2018/10/11/statement-on-soyuz-ms-10-launch-abort/> | part categories: escape_system |
| F31 | Apollo 12 | NASA, A History of the Lightning Launch Commit Criteria and the Lightning Advisory Panel for America's Space Program (NASA/SP-2010-216283), 2010 | <https://ntrs.nasa.gov/api/citations/20110000675/downloads/20110000675.pdf> | minigames: MG-07 |
| F32 | Apollo 15 | NASA NSSDCA, The Apollo 15 Hammer-Feather Drop | <https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_15_feather_drop.html> | minigames: MG-29 |
| F33 | RTG | NASA/JPL, Mars Science Laboratory/Curiosity Fact Sheet | <https://mars.nasa.gov/system/internal_resources/details/original/605_MSL_Fact_Sheet.pdf> | part categories: power_system |
| F34 | TDRS | NASA Space Communications and Navigation, History of the Networks | <https://www.nasa.gov/communicating-with-missions/history-of-the-networks/> | part categories: communications |
| F35 | Laser comms | NASA, Laser Communications Relay Demonstration (LCRD) Overview; NASA/JPL, Psyche Launch Press Kit: Deep Space Optical Communications | <https://www.nasa.gov/directorates/stmd/tech-demo-missions-program/laser-communications-relay-demonstration-lcrd-overview/> | part categories: communications |
| F36 | Patches | NASA, Gemini V: Paving the Way for Long Duration Spaceflight; NASA History, Symbols of NASA | <https://www.nasa.gov/missions/gemini/gemini-v/gemini-v-paving-the-way-for-long-duration-spaceflight/> | minigames: MG-30 |
| F37 | STS-51F | NASA, STS-51F mission page; NASA JSC, Henderson and Nguyen, Space Shuttle Abort Evolution (AIAA SPACE 2011) | <https://www.nasa.gov/mission/sts-51f/> | channels: abort_modes |
| F38 | TRN | NASA STMD, Impact Story: Terrain Relative Navigation; NASA/JPL, Mars 2020 Perseverance Landing Press Kit, 2021 | <https://www.nasa.gov/directorates/stmd/impact-story-terrain-relative-navigation/> | part categories: navigation_sensor |
| F39 | Saturn V | NASA, What Was the Saturn V? (Grades 5-8) | <https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-saturn-v-grades-5-8/> | channels: rocket_preview |
| F40 | Mars windows | NASA JPL, The Launch Is Approaching for NASA's Next Mars Rover, Perseverance, 2020 | <https://www.jpl.nasa.gov/news/the-launch-is-approaching-for-nasas-next-mars-rover-perseverance/> | contracts: C7 |

## 3. NASA imagery used as textures (Unity host)

From `unity/MissionForge/THIRD_PARTY.md`, downloaded 2026-11-14. Used as surface data for the Earth in the host;
the title screen shows an imagery credit line.

| Asset | Source | Licence as recorded |
|---|---|---|
| Earth day map, Blue Marble Next Generation (December, topography and bathymetry), resized to 4096x2048 | NASA Earth Observatory / Visible Earth | Public domain (NASA) |
| Earth night lights, Black Marble 2012, resized to 2048x1024 | NASA Earth Observatory | Public domain (NASA) |
| Bathymetry (GEBCO 08 via Blue Marble Next Generation), used as the ocean mask | NASA Earth Observatory | Public domain (NASA / GEBCO) |
| Cloud map 2048x1024 | Solar System Scope (derived from NASA data) | CC BY 4.0. **Not a space agency**: listed for completeness |

NASA media library images (<https://images.nasa.gov/>) and NASA 3D models (<https://science.nasa.gov/3d-resources/>)
are **not** used; the 3D hardware is generic and was built from Blender scripts.

## 4. Engineering values rounded from real hardware classes

Engine thrust and Isp, propellant densities, delta-v budgets per destination and similar numbers are rounded from
published hardware classes and textbook values and are tagged `real_world_approximate` in the data and in the
assumptions register (`GAME_DESIGN.md` 19). They are **not** copied from a single NASA table, and no dataset was
imported; part names are generic with a "real-world twin" line. Costs, lead times, reliabilities, boosts and score
weights are `game_value`, not NASA figures.

Physical constants used in Core (standard gravity, Earth GM and radius, sea-level density, atmospheric scale height,
Sutton-Graves coefficient) are listed in `GAME_DESIGN.md` 8.1 and 8.2.

## 5. Mission and event references in game text

Real missions appear as teaching points, always with a source in the fact bank and never as a joke or a gameplay
failure of a real crew (design section 12.1): Mars Climate Orbiter, Apollo 11, 12, 13 and 15, Genesis, Stardust, LOFTID,
Orion parachutes, Soyuz MS-10, STS-51F, OCO and Glory, Landsat, TDRS, LCRD and DSOC, Perseverance terrain-relative
navigation, the Deep Space Network, the ISS and the Saturn V. Their sources are the rows of section 2.

## 6. Other credits (not space agencies)

Fonts IBM Plex and Oxanium (SIL OFL 1.1), Poly Haven HDRIs (CC0), Lucide icons (ISC), QrCodeGenerator (MIT), React,
three.js, `ws` and other npm packages (MIT and similar). Full list with licences: `docs/play/credits.html` and
`unity/MissionForge/THIRD_PARTY.md`.
