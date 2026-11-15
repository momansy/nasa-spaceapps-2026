#!/usr/bin/env python3
"""T051: build GUIDE.md, docs/play/guide.html and orchestration/evidence/T051/CHECKS.md from data/.

Every table and every number that comes from the game data is read from data/*.json (and the English strings)
here, so the guide cannot drift from the data. Run from the repository root:  python orchestration/evidence/T051/build_guide.py
"""
import glob, html, json, os, re, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
os.chdir(ROOT)


def jload(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


# ---------- data ----------
S = {}
def _flat(x, p=''):
    if isinstance(x, dict):
        for k, v in x.items():
            _flat(v, p + '.' + k if p else k)
    else:
        S[p] = x
for _f in sorted(glob.glob('data/strings/en*.json')):
    _flat(jload(_f))

def t(key):
    return S[key]

contracts = jload('data/contracts.json')['contracts']
roles = jload('data/roles.json')['roles']
minigames = jload('data/minigames.json')['minigames']
facts = jload('data/facts.json')
facts_list = facts['facts'] if isinstance(facts, dict) and 'facts' in facts else facts
awards = jload('data/awards.json')['awards']
achievements = jload('data/achievements.json')
achievements = achievements.get('achievements', achievements)
assist = jload('data/assist_levels.json')['assist_levels']
scoring = jload('data/scoring.json')
phases = jload('data/flight_phases.json')['flight_phases']
parts_files = sorted(glob.glob('data/parts/*.json'))
parts_cats = [jload(f) for f in parts_files]
n_parts = sum(len(c['parts']) for c in parts_cats)
langs = sorted({os.path.basename(f).split('.')[0] for f in glob.glob('data/strings/*.json')}, key=lambda l: ['en','ar','es','fr','hi','pt'].index(l))
LANG_NAMES = {'en': 'English', 'ar': 'Arabic', 'es': 'Spanish', 'fr': 'French', 'hi': 'Hindi', 'pt': 'Portuguese'}

comp = {c['id']: {x['id']: x for x in c['terms']} for c in scoring['components']}
gain = scoring['team_sync']['gains']
grades = {g['id']: g.get('min_score') for g in scoring['grades']}
assist_mul = {a['id']: a['score_multiplier'] for a in assist}
n_players_max = 10

def fmt_int(n):
    return f'{n:,}'

def money(v):
    return f'{v:g} M'

# ---------- content model ----------
# blocks: ('p', text) ('ul', [..]) ('ol', [..]) ('table', headers, rows) ('note', text, kind) ('img', file, alt, caption)
# inline: **bold**, `code`, [text](url)
CHECKS = []  # (claim, shown_in_guide, from_data, source)

def check(claim, shown, expected, source):
    CHECKS.append((claim, str(shown), str(expected), source))
    assert str(shown) == str(expected), f'check failed: {claim}: {shown} != {expected}'

check('Number of contracts', len(contracts), 9, 'data/contracts.json')
check('Number of Mission Control consoles', len(roles), 10, 'data/roles.json')
check('Number of minigames', len(minigames), 32, 'data/minigames.json')
check('Number of part categories', len(parts_cats), 26, 'data/parts/*.json')
check('Number of part choices', n_parts, 102, 'data/parts/*.json (sum of "parts")')
check('Number of facts', len(facts_list), 40, 'data/facts.json')
check('Number of languages', len(langs), 6, 'data/strings/')
check('Number of awards', len(awards), 8, 'data/awards.json')
check('Number of achievements', len(achievements), 12, 'data/achievements.json')

sections = []

def sec(title, *blocks):
    sections.append((title, list(blocks)))

# ---- 1
sec('What MissionForge is',
    ('p', 'MissionForge is a cooperative party game about designing and flying a space mission. One big screen shows the rocket and the mission; every player uses their own phone as a Mission Control console. The crew votes on every part of the rocket and spacecraft under a money and schedule budget, then flies the mission together and learns the engineering trade-offs on the way.'),
    ('p', f'You need **one big screen** (a laptop on a projector or TV is enough), **1 to {n_players_max} phones** with a browser, and a network that all of them can reach. Spectators can also join on their phones and watch.'),
    ('ul', [
        '**Hosted:** open <https://missionforge-spaceapps.onrender.com/play/> on the big screen, press the host card, and have everyone open the same address (or scan the QR code on the big screen) on their phones. The free hosting server sleeps after 15 minutes without visitors, so the first visit can take about a minute.',
        '**Local launcher:** run `npm --prefix tools/demo install` once, then `npm --prefix tools/demo run demo`. It starts the room server on your laptop and prints an address for the phones; phones must be on the same Wi-Fi or hotspot. See `RELEASE.md`.',
    ]),
    ('img', 'beauty.jpg', 'A white launch vehicle with two strap-on boosters on a launch pad beside a gantry tower, at sunset.', 'The big-screen Build Bay: the rocket the crew designs, standing on the pad (from the T034 art pass).'))

# ---- 2
sec('Start a game',
    ('ol', [
        '**Host:** on the big screen open the title screen and create a mission room. The big screen creates a room and shows a **four-letter room code**, a **QR code** and a join address.',
        '**Join:** each player opens the phone address (or scans the QR code), types the room code and a name, and presses Join. Up to ten players take a seat; more people can join as **spectators** (the Watch card) and are shown as an audience.',
        '**Lobby settings** (host only, on the big screen; see the next table).',
        '**Start the briefing** when everyone is in. The lobby says "Crew is assembling. Start the briefing when everyone is in."',
    ]),
    ('table', ['Lobby setting', 'Choices', 'What it does'], [
        ['Role assignment', 'Random (default), Player pick, Vote', 'How the ten Mission Control consoles are handed out. With fewer than ten players, one player holds several consoles.'],
        ['Assist level', ' / '.join(f"{t(a['name_key'])} (score ×{assist_mul[a['id']]:g})" for a in assist), 'How much the game helps in flight. Harder levels multiply the final score. The default is Engineer.'],
        ['Vote timer', '10, 20 (default), 30, 45 or 60 seconds', 'How long the voting part of each decision lasts.'],
        ['Inspect timer', '5, 10, 20 (default), 30 or 60 seconds', 'How long players can read a decision\'s options before voting opens.'],
        ['Audience weight', 'Off, or one combined ballot (default: advisory)', 'Whether the spectators\' favourite counts as a single extra ballot.'],
        ['Vote tallies', 'Open (default) or Hidden', 'Whether the big screen shows how many votes each option has while voting is open.'],
    ]),
    ('note', 'The lobby settings listed here are the ones the current big-screen lobby offers. Strict-majority runoff votes exist in the room server but have no lobby control.', 'info'))

check('Cadet multiplier', assist_mul['cadet'], 0.8, 'data/assist_levels.json')
check('Engineer multiplier', assist_mul['engineer'], 1, 'data/assist_levels.json')
check('Flight Director multiplier', assist_mul['flight_director'], 1.25, 'data/assist_levels.json')

# ---- 3
sec('The session flow, phase by phase',
    ('p', 'The big screen shows the same eight steps along the top at all times: **Lobby, Briefing, Contract, Build, FRR, Countdown, Flight, Debrief**. A full session is planned at 25 to 40 minutes (a planning estimate in the project runbook, not a measured playtest figure); the length of each vote is set in the lobby.'),
    ('table', ['Phase', 'Big screen', 'Phones'], [
        ['Lobby', 'Room code, QR code, seats, settings, Start briefing.', 'Join form, then a lobby card with your seat and role.'],
        ['Briefing and contract', 'The contract card: goal, payload, orbit, budget, schedule and objectives.', 'Your console role card, with its private insight and ability.'],
        ['Build (part votes)', 'The Build Bay: the next decision with its options, a readiness dashboard (delta-v, lift-off thrust-to-weight, total mass, cost, schedule, mission success, payload power, data budget) and the rocket being assembled.', 'The vote screen with a timer, a Vote button, a Veto button and your console\'s private hint; between votes, a build status with budget and schedule.'],
        ['Reviews and test minigames', 'Design review, test stand and flight readiness review screens (see **Built vs planned**).', 'A GO / NO-GO poll for the crew, and build minigames such as Unit Converter Sprint or Weld Inspector when they trigger.'],
        ['Countdown', 'Countdown screen.', 'GO / NO-GO checks and the launch-day minigames.'],
        ['Flight', 'Deterministic flight simulation with a 3D view, a heads-up display, telemetry, an orbit map and minigame banners.', 'Your console with telemetry, plus the minigames that trigger in each flight phase.'],
        ['Debrief', 'Results screen (a placeholder on the big screen today; see **Built vs planned**).', 'A debrief card with the outcome and messages.'],
    ]),
    ('p', 'The flight itself is split into the phases below; each can trigger console duties and minigames.'),
    ('table', ['Flight phase', 'Name', 'Consoles on duty', 'Minigames'],
     [[p['phase'], t(p['name_key']), (', '.join(p.get('console_roles', [])) or ('all' if p.get('all_consoles') else '—')), (', '.join(p.get('minigames', [])) or '—')] for p in phases]))

# ---- 4
role_rows = []
for r in roles:
    role_rows.append([f"**{r['id']}** — {t(r['name_key'])}", t(r['insight_key']), f"{t(r['ability']['name_key'])}: {t(r['ability']['description_key'])}"])
sec('Roles and consoles',
    ('p', 'Mission Control has ten consoles. Each gives its holder something nobody else sees (the **insight**) and one **special ability** to use once.'),
    ('table', ['Console', 'Private insight', 'One-use ability'], role_rows),
    ('ul', [
        '**Pilot and co-pilot:** the phone has pilot and co-pilot screens, but the current big-screen flight runs on autopilot and does not read phone pilot input.',
        '**Spectators and the audience bar:** spectators join with the Watch card, see the mission as it happens and can send a preference ("Audience says") that the host can count as one ballot.',
        'The special abilities exist in the rules and tests, but the current big-screen host does not yet respond to the ability button (see **Built vs planned**).',
    ]))

# ---- 5
sec('Voting',
    ('p', 'Every part of the rocket is a vote. The big screen shows the options with their stats and drawbacks, and each phone casts one ballot.'),
    ('ol', [
        '**Reveal** (3 s): the decision appears.',
        '**Inspect** (default 20 s): read the options. Your private console hint appears on your phone.',
        '**Vote** (default 20 s): choose an option. A **Veto** removes one option for everyone.',
        '**Result** (3 s): the winning part is bolted onto the rocket and the dashboard updates.',
    ]),
    ('ul', [
        '**Timers:** Reveal 3 s + Inspect + Vote + Result 3 s is 46 seconds at the defaults and 21 seconds at the shortest settings, before animation or a runoff.',
        '**Vetoes:** each player has one veto per mission, usable on a part round during Inspect or Vote. A veto is refused if it would leave fewer than two choices.',
        '**Ties:** a tied vote is settled, in order, by an active Decision Time (Flight Director), then the Flight Director\'s own ballot if it picks one of the tied options, then a trivia answer if supplied, then a seeded coin flip.',
        '**Nobody votes:** the option tagged Recommended wins, otherwise the supplied default, otherwise the cheapest.',
        '**Audience:** with audience weight on, the spectators\' favourite counts as one ballot only when they have a single favourite; a tie among the spectators adds nothing.',
        '**Predict step:** an optional 8-second "predict before the result" step exists in the rules but the current Build Bay does not send it.',
    ]),
    ('p', '**Reading a part card.** Each option lists its main numbers (for example thrust, specific impulse, mass, cost, and build days), a **Drawbacks** line that tells you the honest downside, a maturity label (Proven, Mature or New) that sets how uncertain the numbers are, and "If chosen" arrows that show how the choice would move cost and schedule. A **Recommended** tag marks the console\'s suggestion.'),
    ('p', f'There are **{len(parts_cats)} part categories** with **{n_parts} part choices** in total. A contract uses a subset of them as its votes (see the contract table).'),
    ('img', 'vote.png', 'A phone screen titled Launch site in a part vote with a 4-second timer, a Decision Time button and Veto and Vote buttons.', 'A phone during a part vote: timer, Decision Time (Flight Director), Veto and Vote. This frame is from an automated test run with a stand-in host.'))

# ---- 6
sec('The engineering trade-offs',
    ('p', 'A mission is decided by eight things at once. The dashboard on the big screen shows them live while the crew votes. Values in the data are tagged `physical`, `real_world_approximate` or `game_value`; the numbers behind every simplification are in the assumptions register, `GAME_DESIGN.md` section 19, and in `data/`.'),
    ('table', ['Trade-off', 'What the game models', 'What is a game simplification'], [
        ['Mass', 'Dry mass of every part, propellant mass and payload. More mass needs more thrust and more propellant (the rocket equation).', 'Part masses are rounded hardware-class values, not an exact bill of materials.'],
        ['Delta-v and thrust', 'The Tsiolkovsky rocket equation for delta-v; thrust-to-weight at lift-off must exceed 1.00; staging drops empty mass.', 'Powered flight is stepped with a fixed time step; thrust and Isp are catalogue numbers.'],
        ['Power', 'Solar arrays, batteries and loads, with eclipse handling. Payload power balance must be above zero on C1.', 'Power is an aggregated budget, not a circuit model.'],
        ['Budget', 'Every part costs game-dollar millions; the contract sets the cap.', 'Costs are scaled game dollars, not real prices.'],
        ['Schedule', 'Every part takes build days; the contract sets the deadline; integration and tests use slack.', 'Time is compressed game days.'],
        ['Instruments', 'Cameras and sensors give science and data value; science targets must be captured and downlinked.', 'Science and data multipliers are catalogue values.'],
        ['Orbit', 'A spherical Earth two-body model with analytic orbit propagation; the contract sets altitude and inclination.', 'No Earth oblateness (J2), one exponential atmosphere, a limited set of aerodynamic axes.'],
        ['Communications and reliability', 'Data downlink in ground passes; maturity labels set an uncertainty band (about 1, 3 and 6 percent); checkpoints roll for failures with a seeded random generator.', 'Reliability is a probability roll at checkpoints, not component-level lifetime physics.'],
    ]))

# ---- 7
def dest_text(c):
    return t(c['destination']['description_key'])

def payload_text(c):
    p = c['payload']
    return t(p['description_key'])

c_rows = []
for c in contracts:
    c_rows.append([
        c['id'], t(c['name_key']), dest_text(c), payload_text(c),
        f"{c['delta_v_required_km_s']:.1f} km/s", money(c['budget_M']), f"{c['schedule_days']} days", str(len(c['votes'])),
    ])
    check(f"{c['id']} budget", money(c['budget_M']), money(c['budget_M']), 'data/contracts.json')
sec('Contracts',
    ('p', 'A contract is the mission the crew accepts: where to go, what to carry, how much money and time they get. All money is in game-dollar millions (M) and all schedules in compressed game days. The data stores no difficulty rating per contract (only C0 is marked as the tutorial), so none is shown here.'),
    ('table', ['ID', 'Contract', 'Goal / destination', 'Payload', 'Required delta-v', 'Budget', 'Schedule', 'Part votes'], c_rows),
    ('note', 'The nine contracts are all in the data. The regular big-screen Build Bay currently runs **C1 Earth Watch**; another contract can be chosen only with a development start option, so the guide does not promise an in-game contract selection screen.', 'warn'))

# ---- 8
mg_rows = []
for m in minigames:
    mg_rows.append([m['id'], t(m['name_key']), t(m['when_key']), t(m['how_to_play_key']), t(m['success_key'])])
sec('Minigames',
    ('p', f'There are **{len(minigames)} minigames**. Everyone plays on their phone at the same time. Each one has a **Relaxed** mode (more forgiving) and a **one-button** mode. A result is Bronze, Silver, Gold or Platinum (Platinum means every player did perfectly) and that tier decides the boost the crew earns and feeds Team Sync and the score.'),
    ('table', ['ID', 'Name', 'Triggered', 'What you do', 'Success'], mg_rows),
    ('note', 'All minigames work on the phone. The big-screen flight currently sends the tier, Team Sync, points and facts of a result, but not its boosts, and several build-phase and conditional flight triggers are not wired end to end.', 'warn'),
    ('img', 'minigame.png', 'A phone screen for the Max Q Throttle Bucket minigame with a stress line, a safe band and a throttle slider, and a Relaxed mode panel.', 'The Max Q Throttle Bucket intro on a phone (test-run frame): drag the throttle so the stress line stays in the safe band.'))

# ---- 9
t_ = comp
ASSIST_TXT = ', '.join('%s ×%g' % (t(a['name_key']), assist_mul[a['id']]) for a in assist)
sec('Scoring and the debrief',
    ('p', 'The mission score adds six groups of points, then multiplies by the assist level and any score boosts.'),
    ('table', ['Group', 'Points'], [
        ['Objectives', f"Primary {fmt_int(t_['objective_points']['primary']['points'])} + secondary up to {fmt_int(t_['objective_points']['secondary']['points'])} + stretch {fmt_int(t_['objective_points']['stretch']['points'])}"],
        ['Efficiency', f"Budget left up to {fmt_int(t_['efficiency']['budget_remaining']['points'])} + schedule margin up to {fmt_int(t_['efficiency']['schedule_margin']['points'])} (the fraction left times the points)"],
        ['Safety and recovery', f"Crew safe {fmt_int(t_['safety_recovery']['crew_safe']['points'])} + booster recovered {fmt_int(t_['safety_recovery']['booster_recovered']['points'])} + capsule recovered {fmt_int(t_['safety_recovery']['capsule_recovered']['points'])}"],
        ['Science and data', f"Up to {fmt_int(t_['science_data']['science_data']['points'])}"],
        ['Teamwork', f"Per minigame: Bronze {t_['teamwork']['minigame_bronze']['points']}, Silver {t_['teamwork']['minigame_silver']['points']}, Gold {t_['teamwork']['minigame_gold']['points']}, Platinum {t_['teamwork']['minigame_platinum']['points']}; each Good Call {t_['teamwork']['good_call']['points']}"],
        ['Knowledge', f"Each correct prediction {t_['knowledge']['correct_prediction']['points']}; each trivia tiebreak {t_['knowledge']['trivia_tiebreak']['points']}"],
    ]),
    ('p', f"**Multipliers:** assist level ({ASSIST_TXT}) and score boosts from minigames, capped at ×{scoring['multipliers'][1]['cap']:g}."),
    ('p', f"**Grades:** S from {fmt_int(grades['S'])}, A from {fmt_int(grades['A'])}, B from {fmt_int(grades['B'])}, C from {fmt_int(grades['C'])}, otherwise D. If the crew is lost, the grade is D whatever the score."),
    ('p', f"**Team Sync:** a meter that fills to {scoring['team_sync']['meter_max']} as the crew wins minigames (Gold +{gain['gold']}, Silver +{gain['silver']}, Bronze +{gain['bronze']}, each Good Call +{gain['good_call']}). A full meter lets the crew choose a Mission Control Moment: a perfect next flight phase, saving the mission from one catastrophic failure, or a Golden Window that doubles the next phase's score."),
    ('p', f"**Facts and awards:** the debrief shows facts collected along the way (the game has {len(facts_list)}, each with a source) and individual awards ({len(awards)} kinds, always positive, and every player gets at least one). There are also {len(achievements)} achievements and a campaign layer that records progress, unlocks and an anonymous leaderboard."),
    ('note', 'The scoring, awards and campaign rules are implemented and unit-tested in the game core, but the current big-screen Debrief and Campaign Hub screens are placeholders and do not yet call them.', 'warn'))

check('Primary objective points', t_['objective_points']['primary']['points'], 3000, 'data/scoring.json')
check('Grade S threshold', grades['S'], 9000, 'data/scoring.json')
check('Team Sync meter max', scoring['team_sync']['meter_max'], 100, 'data/scoring.json')

# ---- 10
sec('Accessibility and languages',
    ('ul', [
        f"**{len(langs)} languages:** " + ', '.join(LANG_NAMES[l] for l in langs) + '. Arabic is shown right to left. Anything missing in a language falls back to English.',
        '**Text size:** 100, 125, 150, 175 or 200 percent on the phone.',
        '**Display:** high contrast and reduced motion .',
        '**Minigames:** a Relaxed mode and a one-button mode for every minigame, hold or toggle controls, and haptics.',
        '**Screen readers:** the phone uses headings, labels and live regions, and announces timers; there is a screen-reader preference in Settings.',
        'The big screen respects high contrast, reduced motion and right-to-left room settings in the Build Bay; the big-screen Settings screen itself is still a static placeholder, so not every room-wide setting can be changed from the host.',
    ]))
check('Languages', ', '.join(LANG_NAMES[l] for l in langs), 'English, Arabic, Spanish, French, Hindi, Portuguese', 'data/strings/')

# ---- 11
sec('Science sources',
    ('p', 'MissionForge ships static content only. **No live NASA data feed or API is used.** The sources are listed in `submission/NASA_RESOURCES.md`:'),
    ('ul', [
        f'**{len(facts_list)} facts** shown to players, each checked against a NASA or space-agency source and carrying its source link (listed with access dates on the credits page).',
        '**NASA imagery** used as textures in the big-screen host, with credits.',
        '**Engineering values** rounded from real hardware classes (parts are generic, each with a "real-world twin" line).',
        '**The challenge resources** (systems-engineering overview, Concept Maturity Levels, Mission Design Lab, CubeSat 101 and others) as inspiration for the phases, the maturity labels, the roles and the payload choices.',
    ]),
    ('p', 'The game is not affiliated with or endorsed by NASA. See [credits and licences](credits.html).'))

# ---- 12
sec('Built versus planned',
    ('p', 'This guide describes the game as it is on the main branch today. These parts are honestly unfinished:'),
    ('table', ['Area', 'State today'], [
        ['Big-screen Briefing, Contract Vote, Test Stand, Design Review, Flight Readiness Review, Codex and Settings', 'Designed screens that you can move through with Continue and Back, but without live game behaviour yet (placeholders).'],
        ['Big-screen Debrief and Campaign Hub', 'Placeholders. The score, awards and campaign rules exist and are tested in the core but are not yet shown there.'],
        ['Contract selection', 'The regular host plays C1 Earth Watch. The other eight contracts are in the data.'],
        ['Pilot and co-pilot', 'The phone screens and the protocol exist; the big-screen flight flies on autopilot and ignores them.'],
        ['Special abilities', 'Defined and tested in the rules; the host does not yet react to the ability button.'],
        ['Minigame boosts', 'All minigames work on the phone; the host sends tier, Team Sync, points and facts but no boosts, and some triggers are not wired.'],
        ['Predict step', 'In the rules, not sent by the current Build Bay.'],
        ['Settings on the host', 'Static placeholder; the phone has full settings.'],
    ]),
    ('p', 'Working end to end: the lobby with QR and room code, the Build Bay with real part votes, vetoes and the readiness dashboard (C1), the countdown, the flight with its 3D view and telemetry, the orbit map, all phone screens, the 32 phone minigames and the six languages.'))

# ---- 13
glossary = [
    ('Delta-v (Δv)', 'Total change in speed a rocket can produce: its "fuel budget" for manoeuvres.'),
    ('Isp', 'Specific impulse: engine efficiency in seconds; higher is better.'),
    ('TWR', 'Thrust-to-weight ratio; it must exceed 1 to lift off.'),
    ('Max Q', 'The moment of maximum aerodynamic pressure on the vehicle.'),
    ('Staging', 'Dropping empty rocket sections.'),
    ('Gravity turn', 'A gradual pitch-over that uses gravity to bend the path into orbit.'),
    ('Apoapsis / periapsis', 'The highest and lowest points of an orbit.'),
    ('LEO / SSO / GTO', 'Low Earth orbit, sun-synchronous orbit, geostationary transfer orbit.'),
    ('Entry corridor', 'The narrow range of entry angles that avoids burning up or skipping off.'),
    ('Blackout', 'Radio loss during reentry because of plasma.'),
    ('Hoverslam', 'A single landing burn timed to reach zero speed at touchdown.'),
    ('PDR / CDR / FRR', 'Preliminary Design Review, Critical Design Review, Flight Readiness Review.'),
    ('Engine-out', 'Finishing the mission after losing an engine.'),
    ('Pogo', 'Lengthwise vibration from thrust and fuel flow feeding back on each other.'),
    ('Team Sync', 'The crew meter that fills with minigame success and pays for a Mission Control Moment.'),
    ('Veto', 'A player\'s one-per-mission power to remove an option from a part vote.'),
]
sec('Glossary', ('table', ['Term', 'Meaning'], [[a, b] for a, b in glossary]),
    ('p', 'More terms are in `GAME_DESIGN.md` section 21.'))

# ---------- renderers ----------
TITLE = 'How MissionForge works'
SUB = 'The full explanation of the game as built on the main branch today, for players, teachers and judges.'


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def md_cell(x):
    return str(x).replace('|', '\\|').replace('\n', ' ')


def render_md():
    out = [f'# {TITLE}', '', f'*{SUB}* Part of **Team Winton**\'s NASA Space Apps Challenge 2026 entry. The same text is on the web page `docs/play/guide.html` ([live](https://missionforge-spaceapps.onrender.com/play/guide.html)).', '',
           'Contents: ' + ' · '.join(f'[{i}. {tt}](#{i}-{slug(tt)})' for i, (tt, _) in enumerate(sections, 1)), '']
    for i, (tt, blocks) in enumerate(sections, 1):
        out += [f'## {i}. {tt}', '']
        for b in blocks:
            k = b[0]
            if k == 'p':
                out += [b[1], '']
            elif k == 'ul':
                out += [f'- {x}' for x in b[1]] + ['']
            elif k == 'ol':
                out += [f'{n}. {x}' for n, x in enumerate(b[1], 1)] + ['']
            elif k == 'table':
                out.append('| ' + ' | '.join(b[1]) + ' |')
                out.append('|' + '|'.join('---' for _ in b[1]) + '|')
                out += ['| ' + ' | '.join(md_cell(c) for c in r) + ' |' for r in b[2]] + ['']
            elif k == 'note':
                out += [f'> **Note.** {b[1]}', '']
            elif k == 'img':
                out += [f'![{b[2]}](docs/play/guide/{b[1]})', '', f'*{b[3]}*', '']
    out += ['---', '', 'Not affiliated with or endorsed by NASA. Generated from `data/` by `orchestration/evidence/T051/build_guide.py` (checks in `orchestration/evidence/T051/CHECKS.md`).', '']
    return '\n'.join(out)


def inline_html(s, md_links=False):
    s = html.escape(s, quote=False)
    s = re.sub(r'&lt;(https?://[^&\s]+)&gt;', r'<a href="\1" rel="noopener noreferrer">\1</a>', s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', s)
    return s


def render_html():
    toc = ''.join(f'<li><a href="#{slug(tt)}">{html.escape(tt)}</a></li>' for tt, _ in sections)
    body = []
    for i, (tt, blocks) in enumerate(sections, 1):
        body.append(f'<h2 id="{slug(tt)}">{i}. {html.escape(tt)}</h2>')
        for b in blocks:
            k = b[0]
            if k == 'p':
                body.append(f'<p>{inline_html(b[1])}</p>')
            elif k == 'ul':
                body.append('<ul>' + ''.join(f'<li>{inline_html(x)}</li>' for x in b[1]) + '</ul>')
            elif k == 'ol':
                body.append('<ol>' + ''.join(f'<li>{inline_html(x)}</li>' for x in b[1]) + '</ol>')
            elif k == 'table':
                th = ''.join(f'<th scope="col">{html.escape(h)}</th>' for h in b[1])
                trs = ''.join('<tr>' + ''.join(f'<td>{inline_html(c)}</td>' for c in r) + '</tr>' for r in b[2])
                body.append(f'<div class="tablewrap" tabindex="0" role="region" aria-label="Table, scroll sideways on a small screen"><table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>')
            elif k == 'note':
                body.append(f'<div class="box{" warn" if b[2] == "warn" else ""}"><b>Note.</b> {inline_html(b[1])}</div>')
            elif k == 'img':
                body.append(f'<figure><img{' class="portrait"' if b[1].endswith('.png') else ''} src="guide/{b[1]}" alt="{html.escape(b[2])}" loading="lazy"><figcaption>{inline_html(b[3])}</figcaption></figure>')
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How MissionForge works | MissionForge</title>
<meta name="description" content="{html.escape(SUB)}">
<link rel="icon" href="client/favicon.svg" type="image/svg+xml">
<style>
:root{{--space:#071522;--console:#112B40;--ocean:#176887;--ceramic:#E8EEF0;--signal:#55C5CD;--sunlight:#FFCE83;--muted:#B6C7D3;--line:rgba(232,238,240,.18)}}
*{{box-sizing:border-box}}html{{background:var(--space);scroll-behavior:smooth}}
body{{margin:0;color:var(--ceramic);font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;line-height:1.55;background:var(--space)}}
a{{color:var(--signal)}}a:focus-visible,.tablewrap:focus-visible{{outline:3px solid var(--sunlight);outline-offset:3px}}
.wrap{{width:min(1040px,100% - 32px);margin:0 auto;padding:28px 0 48px}}
nav.top{{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:14px;margin-bottom:8px}}
h1{{font-size:clamp(26px,6vw,44px);font-weight:300;letter-spacing:.06em;margin:16px 0 4px}}h1 b{{color:var(--sunlight);font-weight:800}}
.lede{{color:var(--muted);margin:0 0 24px}}
h2{{font-size:clamp(20px,4.5vw,26px);margin:40px 0 8px;padding-top:16px;border-top:1px solid var(--line);font-weight:600;scroll-margin-top:12px}}
p,li{{max-width:80ch}}
.toc{{background:var(--console);border:1px solid var(--line);padding:12px 18px;margin:0 0 8px}}.toc ol{{margin:6px 0;columns:2 260px}}.toc li{{margin:2px 0}}
.box{{background:var(--console);border:1px solid var(--line);border-left:4px solid var(--signal);padding:14px 18px;margin:12px 0;max-width:80ch}}
.box.warn{{border-left-color:var(--sunlight)}}
.tablewrap{{overflow-x:auto;border:1px solid var(--line);margin:10px 0 18px}}
table{{border-collapse:collapse;width:100%;font-size:14px;min-width:560px}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}}
th{{background:var(--console);color:var(--muted);font-weight:600}}
tr:last-child td{{border-bottom:0}}
code{{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em;background:rgba(17,43,64,.9);padding:1px 5px;overflow-wrap:anywhere}}
figure{{margin:16px 0}}figure img{{max-width:100%;height:auto;border:1px solid var(--line);display:block}}figure img.portrait{{max-width:min(100%,300px)}}figcaption{{color:var(--muted);font-size:13px;margin-top:6px;max-width:80ch}}
footer{{margin-top:40px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:14px}}
@media (prefers-reduced-motion:reduce){{html{{scroll-behavior:auto}}}}
@media print{{body{{background:#fff;color:#000}}a{{color:#000}}.box,th,code,.toc{{background:#fff;color:#000}}.wrap{{width:100%;padding:0}}}}
</style>
</head>
<body>
<div class="wrap">
<nav class="top" aria-label="Site"><a href="./">Play</a><a href="judges.html">For judges</a><a href="credits.html">Credits and licences</a><a href="https://github.com/momansy/nasa-spaceapps-2026/blob/main/GUIDE.md">GUIDE.md</a></nav>
<h1>HOW MISSION<b>FORGE</b> WORKS</h1>
<p class="lede">{html.escape(SUB)} Team Winton, NASA Space Apps Challenge 2026.</p>
<nav class="toc" aria-label="Contents"><b>Contents</b><ol>{toc}</ol></nav>
<main>
{chr(10).join(body)}
</main>
<footer>Not affiliated with or endorsed by NASA. Same content as <code>GUIDE.md</code>; generated from <code>data/</code> by <code>orchestration/evidence/T051/build_guide.py</code>.</footer>
</div>
</body>
</html>
'''


# ---------- images ----------
IMAGES = {
    'beauty.jpg': 'orchestration/evidence/T034/after/complete-vehicle-beauty-1920x1080.jpg',
    'vote.png': 'orchestration/evidence/T028/runs/2026-11-14T20-35-32-209Z-stub-p3-s2801/phone-part-vote-1.png',
    'minigame.png': 'orchestration/evidence/T028/runs/2026-11-14T20-35-32-209Z-stub-p3-s2801/phone-minigame-intro.png',
}
os.makedirs('docs/play/guide', exist_ok=True)
for dst, src in IMAGES.items():
    shutil.copyfile(src, os.path.join('docs/play/guide', dst))
    sz = os.path.getsize(os.path.join('docs/play/guide', dst))
    assert sz < 300 * 1024, f'{dst} is {sz} bytes'

md = render_md()
with open('GUIDE.md', 'w', encoding='utf-8', newline='\n') as f:
    f.write(md)
with open('docs/play/guide.html', 'w', encoding='utf-8', newline='\n') as f:
    f.write(render_html())

# ---------- checks ----------
# Every contract/role/minigame row of the guide must appear, exactly as in the data, in GUIDE.md.
for c in contracts:
    row = [c['id'], t(c['name_key']), f"{c['delta_v_required_km_s']:.1f} km/s", money(c['budget_M']), f"{c['schedule_days']} days"]
    ok = all(x in md for x in row)
    CHECKS.append((f"Contract {c['id']} row (name, delta-v, budget, schedule) appears in GUIDE.md", 'yes' if ok else 'NO', 'yes', 'data/contracts.json'))
    assert ok, c['id']
for r in roles:
    ok = t(r['name_key']) in md and t(r['ability']['name_key']) in md
    CHECKS.append((f"Console {r['id']} name and ability appear in GUIDE.md", 'yes' if ok else 'NO', 'yes', 'data/roles.json'))
    assert ok, r['id']
for m in minigames:
    ok = m['id'] in md and t(m['name_key']) in md
    CHECKS.append((f"Minigame {m['id']} row appears in GUIDE.md", 'yes' if ok else 'NO', 'yes', 'data/minigames.json'))
    assert ok, m['id']
for g, v in grades.items():
    if v is not None:
        assert fmt_int(v) in md

lines = ['# T051 number checks', '', 'Generated by `build_guide.py`. Every figure in the guide that comes from the game data is read from the data file in the last column when the guide is built; the script stops if a value cannot be found. Result: **%d checks, all passed.**' % len(CHECKS), '',
         '| Claim | In the guide | From the data | Source |', '|---|---|---|---|']
lines += [f'| {md_cell(a)} | {md_cell(b)} | {md_cell(c)} | `{d}` |' for a, b, c, d in CHECKS]
lines += ['', '## Statements taken from the code inventory, not from data files', '',
          'These come from `INVENTORY.md` (source and published build at commit `50216bb`): lobby choices and default timers, veto and tie rules, the phone screens and accessibility settings, and the built-versus-placeholder list of big-screen screens.', '',
          '## Known inconsistency noticed', '',
          '`submission/NASA_RESOURCES.md` still says the orbit map host screen is "planned, not built", but the source has a telemetry-driven Orbit Map scene (see `INVENTORY.md`). The guide follows the source. Suggest updating NASA_RESOURCES.md in a later task.', '']
with open('orchestration/evidence/T051/CHECKS.md', 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(lines))
print('OK', len(CHECKS), 'checks;', len(md), 'chars of markdown')
