# MissionForge Core

Pure C# rules and simulation for MissionForge: build rules, flight physics, scoring and
session state. No `UnityEngine`. The same sources are a Unity local package and a .NET
class library, so every rule can be unit-tested without opening Unity.

`GAME_DESIGN.md` is the specification; `orchestration/ARCHITECTURE.md` section 3 fixes the
conventions repeated below.

## Layout

```
core/
  package.json                      Unity package manifest (com.missionforge.core)
  README.md
  Runtime/                          All shipped C#; compiled by Unity and by the .NET SDK
    MissionForge.Core.asmdef        Assembly MissionForge.Core, noEngineReferences, Newtonsoft.Json.dll
    Constants/PhysicalConstants.cs  Design section 8.1, SI units                 namespace MissionForge.Core
    Random/SeededRandom.cs          The one seeded PRNG, named streams           namespace MissionForge.Core.Random
    Build/RocketEquation.cs         Delta-v and lift-off TWR, design section 6.3  namespace MissionForge.Core.Build
  dotnet~/                          Invisible to Unity (folder name ends in ~)
    MissionForge.Core.sln
    MissionForge.Core.csproj        netstandard2.1, C# 9, nullable; compiles ../Runtime/**/*.cs
    Tests/
      MissionForge.Core.Tests.csproj   net8.0, xUnit
      Build/  Constants/  Random/      one test folder per Runtime folder
```

Namespaces to come (ARCHITECTURE.md section 3): `MissionForge.Core.Data` (catalog loading),
`.Build` (dashboard, budget, schedule, reliability, tests, anomalies, reviews, validation),
`.Flight` (physics, phases, failures, aborts), `.Scoring` (boosts, tiers, score, awards),
`.Session` (state machine, replay log), `.Campaign`, `.Protocol`. Each gets a folder of the
same name under `Runtime/` and under `dotnet~/Tests/`.

Do not hand-write Unity `.meta` files. Unity generates them the first time it imports the
package; commit the generated files from the Unity task.

## How Unity consumes it

`unity/MissionForge/Packages/manifest.json` references the package by relative path:

```json
{
  "dependencies": {
    "com.missionforge.core": "file:../../../core"
  }
}
```

The package depends on `com.unity.nuget.newtonsoft-json` 3.2.1, which Unity resolves
automatically. Unity assemblies that call Core add `MissionForge.Core` to the references of
their own asmdef. Because the asmdef sets `noEngineReferences`, any use of `UnityEngine` in
`Runtime/` fails to compile, which is intended.

## How to run the tests

Needs the **.NET 8 SDK** (`dotnet --version` should print 8.0.x; get it from <https://dotnet.microsoft.com/download/dotnet/8.0>).
The test project targets `net8.0`, so the test host needs the .NET 8 *runtime*. A machine that has only a newer SDK
(.NET 9 or 10) builds fine but stops with `Framework 'Microsoft.NETCore.App', version '8.0.0' not found`.
If you cannot install .NET 8, set `DOTNET_ROLL_FORWARD=Major` to run the tests on the newer runtime instead
(checked with the .NET 9 runtime: 568 of 568 passed). Install .NET 8 for the official result.
The determinism test compares exact hashes only between two runs on the same machine and uses a tolerance for recorded
values (floating-point results differ in the last bits between x64 and arm64), so the suite also passes on Apple silicon.

```
dotnet test core/dotnet~
```

The folder holds one solution and one project with the same base name
(`MissionForge.Core.sln`, `MissionForge.Core.csproj`); in that case MSBuild picks the
solution, which builds the library and runs the tests. If the two names ever differ, the
command above stops with error MSB1011 (ambiguous project), so keep them equal or pass the
solution path explicitly: `dotnet test core/dotnet~/MissionForge.Core.sln`.

New `.cs` files under `Runtime/` are picked up by the glob in the csproj; nothing to edit.

## Coding rules (ARCHITECTURE.md section 3)

- Target `netstandard2.1`, C# 9, nullable enabled.
- No `UnityEngine`, no file or network I/O, no wall-clock time, no `System.Random`.
  Callers pass JSON text and a seed.
- JSON through Newtonsoft.Json: the Unity package `com.unity.nuget.newtonsoft-json`, and the
  NuGet package `Newtonsoft.Json` 13.x in the .NET projects.
- SI units inside the code (kg, m, s, N, W). A unit suffix on every public numeric name
  (`thrustVacN`, `massKg`, `DeltaVMs`). Convert only at the data and UI boundaries: the data
  files use the units of the design tables (`thrust_sl_kN`, `mass_t`, `cost_M`), so the
  loader in `Core.Data` is where kN become N and tonnes become kg.
- One seeded PRNG type, `MissionForge.Core.Random.SeededRandom`. Every random draw names its
  stream, `rng.ForStream("anomaly")`, `"failure"`, `"tiebreak"`, so replays match (design
  section 17.6). A stream depends only on the session seed and its name.
- Flight integrator: fixed step 1/120 s, RK4 for powered and atmospheric flight, analytic
  Kepler propagation for unpowered vacuum coasts (design section 8.2).
- Every public calculation has unit tests with hand-checked or textbook values, with the
  arithmetic shown in a comment.
- Public API carries XML documentation that states units and cites the design section.

Practical notes:

- `netstandard2.1` has no `IsExternalInit`, so C# 9 `record` types and `init` accessors do
  not compile there without a shim. Use classes with constructors, or add the shim once in
  `Runtime/` if records are wanted.
- Inside `MissionForge.Core.*` namespaces the bare name `Random` refers to the
  `MissionForge.Core.Random` namespace, not to `System.Random`. That is deliberate.
- The golden values in `Tests/Random/SeededRandomTests.cs` pin the PRNG output. If they
  change, saved replays stop matching: treat a failure there as a bug in the change.
