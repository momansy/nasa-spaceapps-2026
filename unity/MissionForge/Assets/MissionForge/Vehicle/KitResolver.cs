using System;
using System.Collections.Generic;
using System.Globalization;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Vehicle
{
    /// <summary>How a kit part is attached (the rules of <c>assets/blender/scripts/mfkit/assemble.py</c>).</summary>
    public enum KitAttach
    {
        /// <summary>First part of the stack: origin at the stack origin.</summary>
        Root,
        /// <summary>The part's origin sits on <see cref="KitStep.RefKey"/>.<see cref="KitStep.RefPoint"/> (build upward).</summary>
        StackOn,
        /// <summary>The part's <c>attach_top</c> sits on the reference point (hang below).</summary>
        HangFrom,
        /// <summary>Strap-on booster: <c>attach_side</c> on the core skin at <see cref="KitStep.AzimuthDeg"/>.</summary>
        Side,
    }

    /// <summary>Which group of the <see cref="VehicleRig"/> a kit part belongs to.</summary>
    public enum KitGroup
    {
        Stage1,
        Stage1Engines,
        Boosters,
        Interstage,
        Stage2,
        Stage2Engines,
        Adapter,
        Fairing,
    }

    /// <summary>One placement of the plan, bottom-up.</summary>
    public sealed class KitStep
    {
        public KitStep(string key, string kitId, KitAttach attach, KitGroup group, string category,
            string refKey = null, string refPoint = null, float azimuthDeg = 0f, string baseKey = null, string basePoint = null,
            bool provisional = false)
        {
            Key = key;
            KitId = kitId;
            Attach = attach;
            Group = group;
            Category = category;
            RefKey = refKey;
            RefPoint = refPoint;
            AzimuthDeg = azimuthDeg;
            BaseKey = baseKey;
            BasePoint = basePoint;
            Provisional = provisional;
        }

        /// <summary>Unique key within the plan (e.g. <c>mount1</c>, <c>e3</c>, <c>tank2</c>).</summary>
        public string Key { get; }
        /// <summary>Kit part id (FBX name), e.g. <c>tank_s1_m_hydrolox</c>.</summary>
        public string KitId { get; }
        public KitAttach Attach { get; }
        public KitGroup Group { get; }
        /// <summary>Vote slot this part shows (<see cref="Slots"/>), or null for derived parts (adapters).</summary>
        public string Category { get; }
        public string RefKey { get; }
        /// <summary><c>origin</c> or an attach empty name of the reference part.</summary>
        public string RefPoint { get; }
        public float AzimuthDeg { get; }
        public string BaseKey { get; }
        public string BasePoint { get; }
        /// <summary>
        /// True when the part stands in for an undecided vote (e.g. one engine while the engine count is open).
        /// Game simplification for display only.
        /// </summary>
        public bool Provisional { get; }

        public override string ToString() => Key + "=" + KitId + " " + Attach + (RefKey != null ? " " + RefKey + "." + RefPoint : "");
    }

    /// <summary>The kit parts for one build, bottom-up, plus every data id that has no kit model.</summary>
    public sealed class KitPlan
    {
        internal KitPlan(List<KitStep> steps, List<string> missing)
        {
            Steps = steps;
            MissingDataIds = missing;
        }

        public IReadOnlyList<KitStep> Steps { get; }

        /// <summary>Data part ids chosen in the build that have no kit model (shown nowhere; never an error).</summary>
        public IReadOnlyList<string> MissingDataIds { get; }

        public KitStep Find(string key)
        {
            foreach (KitStep s in Steps) if (s.Key == key) return s;
            return null;
        }
    }

    /// <summary>
    /// Maps a Core <see cref="BuildState"/> to kit part ids following the T015 brief and
    /// <c>assets/blender/data_part_map.json</c>: engines and fairings by id, engine counts to mounts, tanks by
    /// <c>spec.tank_id(stage, size, family)</c>, interstages by separation system and diameter pair, adapters where
    /// diameters differ. The vehicle grows in vote order (top first), so undecided sections are left out and the
    /// stack closes up; an engine whose count is still open is shown once (provisional, display only).
    /// </summary>
    public static class KitResolver
    {
        /// <summary>Default stack diameter while nothing decides it, m (kit game_value: the 3.7 m medium class).</summary>
        public const float DefaultStackDiameterM = 3.7f;

        /// <summary>Kit diameter classes, m (kit game_value, spec.DIAMETERS), small to large.</summary>
        public static readonly float[] DiameterClasses = { 1.5f, 3.7f, 5.4f, 8.4f };

        /// <summary>Data id → kit id where the names differ. The brief's known mismatch is kept as an alias both ways.</summary>
        private static readonly Dictionary<string, string> Aliases = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            { "fairing_large_reusable", "fairing_reusable_large" },
        };

        /// <summary>Separation system data id → kit interstage system (data_part_map.json, design 7.12).</summary>
        private static readonly Dictionary<string, string> SeparationSystems = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            { "sep_pyro_bolts_springs", "pyro" },
            { "sep_pneumatic_pushers", "pneumatic" },
            { "sep_hot_staging", "hot_staging" },
        };

        /// <summary>Strap-on data id → kit booster id (data_part_map.json). Liquid side boosters have no kit model yet.</summary>
        private static readonly Dictionary<string, string> BoosterModels = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            { "strap_2_small_solid", "booster_small_solid" },
            { "strap_4_small_solid", "booster_small_solid" },
            { "strap_2_heavy_solid", "booster_heavy_solid" },
        };

        private static readonly HashSet<int> FirstStageMountCounts = new HashSet<int> { 1, 3, 5, 9 };
        private static readonly HashSet<int> UpperStageMountCounts = new HashSet<int> { 1, 2 };

        public static string KitIdFor(string dataId) => dataId != null && Aliases.TryGetValue(dataId, out string kit) ? kit : dataId;

        /// <summary><c>spec.tank_id</c>: tank_s{stage}_{size}[_hydrolox].</summary>
        public static string TankId(int stage, string size, bool hydrolox) =>
            "tank_s" + stage + "_" + size + (hydrolox ? "_hydrolox" : "");

        /// <summary>Size letter of a tank data id (<c>tank_m</c> → <c>m</c>), or null.</summary>
        public static string TankSize(string tankDataId) =>
            tankDataId != null && tankDataId.StartsWith("tank_", StringComparison.Ordinal) ? tankDataId.Substring(5) : null;

        /// <summary><c>spec.dkey</c>: 3.7 → d37.</summary>
        public static string DiameterKey(float diameterM) =>
            "d" + Math.Round(diameterM * 10f).ToString(CultureInfo.InvariantCulture);

        public static string InterstageId(string system, float bottomM, float topM) =>
            "interstage_" + system + "_" + PairSuffix(bottomM, topM);

        public static string AdapterId(float bottomM, float topM) => "adapter_" + PairSuffix(bottomM, topM);

        public static string MountId(int stage, int count, float diameterM) =>
            "mount_s" + stage + "_" + count + "_" + DiameterKey(diameterM);

        private static string PairSuffix(float bottomM, float topM)
        {
            string b = DiameterKey(bottomM), t = DiameterKey(topM);
            return b == t ? b : b + "_to_" + t;
        }

        /// <summary>Index of the diameter class nearest to <paramref name="diameterM"/>.</summary>
        public static int ClassIndex(float diameterM)
        {
            int best = 0;
            for (int i = 1; i < DiameterClasses.Length; i++)
            {
                if (Math.Abs(DiameterClasses[i] - diameterM) < Math.Abs(DiameterClasses[best] - diameterM)) best = i;
            }
            return best;
        }

        /// <summary>Resolves the kit plan of <paramref name="build"/>. Never throws for unknown or unmodelled parts.</summary>
        public static KitPlan Resolve(BuildState build, GameCatalog catalog, KitLibrary library)
        {
            if (build == null) throw new ArgumentNullException(nameof(build));
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (library == null) throw new ArgumentNullException(nameof(library));
            var steps = new List<KitStep>();
            var missing = new List<string>();

            PartDef Chosen(string slot)
            {
                string id = build.Choice(slot);
                if (id == null) return null;
                return catalog.Parts.TryGetValue(id, out PartDef p) ? p : null;
            }

            PartDef firstEngine = Chosen(Slots.FirstStageEngine);
            PartDef firstCount = Chosen(Slots.FirstStageEngineCount);
            PartDef firstTank = Chosen(Slots.FirstStageTank);
            PartDef upperEngine = Chosen(Slots.UpperStageEngine);
            PartDef upperCount = Chosen(Slots.UpperStageEngineCount);
            PartDef upperTank = Chosen(Slots.UpperStageTank);
            PartDef separation = Chosen(Slots.StageSeparation);
            PartDef fairing = Chosen(Slots.Fairing);
            PartDef boosters = Chosen(Slots.StrapOnBoosters);

            // ---- kit ids of the decided parts
            string firstEngineKit = KnownOrMissing(firstEngine?.Id, library, missing);
            string upperEngineKit = KnownOrMissing(upperEngine?.Id, library, missing);
            string firstTankKit = firstTank == null ? null : KnownOrMissing(
                TankId(1, TankSize(firstTank.Id), IsHydrolox(firstEngine)), library, missing, firstTank.Id);
            string upperTankKit = upperTank == null ? null : KnownOrMissing(
                TankId(2, TankSize(upperTank.Id), IsHydrolox(upperEngine)), library, missing, upperTank.Id);
            string fairingKit = KnownOrMissing(KitIdFor(fairing?.Id), library, missing, fairing?.Id);

            KitPartEntry Entry(string kitId) => kitId != null && library.TryGet(kitId, out KitPartEntry e) ? e : null;

            float? tank1D = Entry(firstTankKit)?.diameterBottomM;
            float? tank2D = Entry(upperTankKit)?.diameterBottomM;
            float? fairingD = Entry(fairingKit)?.diameterBottomM;
            float stage2D = Snap(tank2D ?? fairingD ?? tank1D ?? DefaultStackDiameterM);
            float stage1D = Snap(tank1D ?? stage2D);

            // ---- stage 1: mount + engines, tank, strap-ons
            string cursorKey = null;          // the part whose attach_top the next stack part sits on
            string mount1Key = null;
            int count1 = firstCount?.Stats.Count ?? (firstEngine != null ? 1 : 0);
            bool count1Provisional = firstCount == null;
            if (count1 > 0)
            {
                int mountCount = NearestCount(count1, FirstStageMountCounts);
                string mountId = MountId(1, mountCount, stage1D);
                if (library.Contains(mountId))
                {
                    mount1Key = "mount1";
                    steps.Add(new KitStep(mount1Key, mountId, KitAttach.Root, KitGroup.Stage1, Slots.FirstStageEngineCount, provisional: count1Provisional));
                    cursorKey = mount1Key;
                    if (firstEngineKit != null)
                    {
                        for (int i = 1; i <= mountCount; i++)
                        {
                            steps.Add(new KitStep("e" + i, firstEngineKit, KitAttach.HangFrom, KitGroup.Stage1Engines, Slots.FirstStageEngine,
                                mount1Key, "attach_engine_" + i));
                        }
                    }
                }
                else
                {
                    AddMissing(missing, mountId);
                }
            }

            string tank1Key = null;
            if (firstTankKit != null)
            {
                tank1Key = "tank1";
                steps.Add(cursorKey == null
                    ? new KitStep(tank1Key, firstTankKit, KitAttach.Root, KitGroup.Stage1, Slots.FirstStageTank)
                    : new KitStep(tank1Key, firstTankKit, KitAttach.StackOn, KitGroup.Stage1, Slots.FirstStageTank, cursorKey, "attach_top"));
                cursorKey = tank1Key;
            }

            if (boosters != null)
            {
                int n = boosters.Stats.Count ?? 0;
                if (n > 0 && BoosterModels.TryGetValue(boosters.Id, out string boosterKit) && library.Contains(boosterKit))
                {
                    if (tank1Key != null)
                    {
                        string baseKey = mount1Key ?? tank1Key;
                        float[] azimuths = n == 2 ? new[] { 0f, 180f } : new[] { 45f, 135f, 225f, 315f };
                        for (int i = 0; i < n && i < azimuths.Length; i++)
                        {
                            steps.Add(new KitStep("b" + (i + 1), boosterKit, KitAttach.Side, KitGroup.Boosters, Slots.StrapOnBoosters,
                                tank1Key, null, azimuths[i], baseKey, "origin"));
                        }
                    }
                }
                else if (n > 0)
                {
                    AddMissing(missing, boosters.Id);
                }
            }

            // ---- interstage
            if (separation != null)
            {
                if (SeparationSystems.TryGetValue(separation.Id, out string system))
                {
                    float bottom = Snap(cursorKey != null ? Entry(KitIdOf(steps, cursorKey)).diameterTopM : stage1D);
                    float top = stage2D;
                    // Interstages exist for straight pairs and one class up or down; larger steps add adapters.
                    float interTop = StepToward(bottom, top);
                    string interId = InterstageId(system, bottom, interTop);
                    if (library.Contains(interId))
                    {
                        steps.Add(Stack("inter", interId, KitGroup.Interstage, Slots.StageSeparation, cursorKey));
                        cursorKey = "inter";
                        cursorKey = AddAdapters(steps, library, missing, cursorKey, interTop, top, KitGroup.Interstage, "inter_adapter");
                    }
                    else
                    {
                        AddMissing(missing, interId);
                    }
                }
                else
                {
                    AddMissing(missing, separation.Id);
                }
            }

            // ---- stage 2: tank, mount + engines hanging under it
            string tank2Key = null;
            string stage2Below = cursorKey; // what the upper mount hangs from when there is no tank yet
            if (upperTankKit != null)
            {
                if (cursorKey != null)
                {
                    float below = Snap(Entry(KitIdOf(steps, cursorKey)).diameterTopM);
                    cursorKey = AddAdapters(steps, library, missing, cursorKey, below, Snap(tank2D.Value), KitGroup.Stage2, "s2_adapter");
                }
                tank2Key = "tank2";
                steps.Add(Stack(tank2Key, upperTankKit, KitGroup.Stage2, Slots.UpperStageTank, cursorKey));
                cursorKey = tank2Key;
            }

            int count2 = upperCount?.Stats.Count ?? (upperEngine != null ? 1 : 0);
            if (count2 > 0)
            {
                int mountCount = NearestCount(count2, UpperStageMountCounts);
                string mountId = MountId(2, mountCount, stage2D);
                if (library.Contains(mountId))
                {
                    string hangKey = tank2Key ?? stage2Below;
                    string hangPoint = tank2Key != null ? "origin" : "attach_top";
                    steps.Add(hangKey == null
                        ? new KitStep("mount2", mountId, KitAttach.Root, KitGroup.Stage2, Slots.UpperStageEngineCount, provisional: upperCount == null)
                        : new KitStep("mount2", mountId, KitAttach.HangFrom, KitGroup.Stage2, Slots.UpperStageEngineCount, hangKey, hangPoint, provisional: upperCount == null));
                    if (upperEngineKit != null)
                    {
                        for (int i = 1; i <= mountCount; i++)
                        {
                            steps.Add(new KitStep("ue" + i, upperEngineKit, KitAttach.HangFrom, KitGroup.Stage2Engines, Slots.UpperStageEngine,
                                "mount2", "attach_engine_" + i));
                        }
                    }
                    if (cursorKey == null) cursorKey = "mount2";
                }
                else
                {
                    AddMissing(missing, mountId);
                }
            }

            // ---- adapter + fairing
            if (fairingKit != null)
            {
                if (cursorKey != null)
                {
                    float below = Snap(Entry(KitIdOf(steps, cursorKey)).diameterTopM);
                    if (below > 0.01f) cursorKey = AddAdapters(steps, library, missing, cursorKey, below, Snap(fairingD.Value), KitGroup.Adapter, "adapter");
                }
                steps.Add(Stack("fairing", fairingKit, KitGroup.Fairing, Slots.Fairing, cursorKey));
            }

            return new KitPlan(steps, missing);
        }

        private static KitStep Stack(string key, string kitId, KitGroup group, string category, string onKey) =>
            onKey == null
                ? new KitStep(key, kitId, KitAttach.Root, group, category)
                : new KitStep(key, kitId, KitAttach.StackOn, group, category, onKey, "attach_top");

        /// <summary>Adds one adapter per diameter class step from <paramref name="fromM"/> to <paramref name="toM"/>.</summary>
        private static string AddAdapters(List<KitStep> steps, KitLibrary library, List<string> missing, string cursorKey,
            float fromM, float toM, KitGroup group, string keyPrefix)
        {
            float d = fromM;
            int guard = 0;
            while (ClassIndex(d) != ClassIndex(toM) && guard++ < DiameterClasses.Length)
            {
                float next = StepToward(d, toM);
                string id = AdapterId(d, next);
                if (!library.Contains(id))
                {
                    AddMissing(missing, id);
                    return cursorKey;
                }
                string key = keyPrefix + guard;
                steps.Add(Stack(key, id, group, null, cursorKey));
                cursorKey = key;
                d = next;
            }
            return cursorKey;
        }

        /// <summary>The diameter class one step from <paramref name="fromM"/> towards <paramref name="toM"/> (or <paramref name="fromM"/> itself).</summary>
        public static float StepToward(float fromM, float toM)
        {
            int a = ClassIndex(fromM), b = ClassIndex(toM);
            if (a == b) return DiameterClasses[a];
            return DiameterClasses[a + Math.Sign(b - a)];
        }

        private static float Snap(float diameterM) => DiameterClasses[ClassIndex(diameterM)];

        private static int NearestCount(int count, HashSet<int> available)
        {
            if (available.Contains(count)) return count;
            int best = -1;
            foreach (int c in available)
            {
                if (best < 0 || Math.Abs(c - count) < Math.Abs(best - count)) best = c;
            }
            return best;
        }

        private static string KitIdOf(List<KitStep> steps, string key)
        {
            foreach (KitStep s in steps) if (s.Key == key) return s.KitId;
            return null;
        }

        private static bool IsHydrolox(PartDef engine) =>
            engine != null && Propellants.Normalize(engine.Propellant) == Propellants.Hydrolox;

        private static string KnownOrMissing(string kitId, KitLibrary library, List<string> missing, string dataId = null)
        {
            if (kitId == null) return null;
            if (library.Contains(kitId)) return kitId;
            AddMissing(missing, dataId ?? kitId);
            return null;
        }

        private static void AddMissing(List<string> missing, string id)
        {
            if (id != null && !missing.Contains(id)) missing.Add(id);
        }
    }
}
