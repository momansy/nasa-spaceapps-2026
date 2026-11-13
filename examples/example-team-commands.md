# Variable-size team example

Start two workers using separate authenticated machines or isolated working trees:

```powershell
$env:MESH_REPO = "momansy/nasa-spaceapps-2026"
python mesh.py worker --agent mohamed --provider codex --capabilities simulation,backend --mode plan
```

```powershell
$env:MESH_REPO = "momansy/nasa-spaceapps-2026"
python mesh.py worker --agent ramy --provider claude --capabilities frontend,design --mode plan
```

A third worker may join at any time:

```powershell
$env:MESH_REPO = "momansy/nasa-spaceapps-2026"
python mesh.py worker --agent yahya --provider codex --capabilities testing,frontend --mode plan
```

Show online workers and send a task to the least-busy eligible agent:

```powershell
python mesh.py roster
python mesh.py send --to auto --capability frontend --subject "Mission dashboard" --message "Propose the HUD for mass, power and data constraints."
```

Run a *single* coordinator separately:

```powershell
python mesh.py coordinator
```

**Prerequisite:** `mesh.py` must have been uploaded from Dynamic Agent Mesh v2. These commands are documentation, not running services.
