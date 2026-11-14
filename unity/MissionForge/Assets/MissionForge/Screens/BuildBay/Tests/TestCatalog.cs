using System.IO;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Data;
using MissionForge.Data.Editor;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>The real repository catalog (data/) synced, loaded and parsed by Core once per test run.</summary>
    internal static class TestCatalog
    {
        private static GameCatalog _catalog;
        private static GameDataSet _data;

        public static GameDataSet Data
        {
            get
            {
                if (_data != null) return _data;
                string target = Path.Combine(Path.GetTempPath(), "mf-t015-catalog-" + Path.GetRandomFileName());
                GameDataSync.Sync(GameDataSync.RepositoryDataPath, target);
                _data = GameDataLoader.LoadFromDirectory(target);
                Directory.Delete(target, true);
                return _data;
            }
        }

        public static GameCatalog Catalog => _catalog ??= CatalogLoader.Load(Data.JsonByPath);

        /// <summary>Seed used by every seeded build in these tests (any fixed value works).</summary>
        public const ulong Seed = 0x7015UL;

        /// <summary>C1 small launcher: Electric-Pump Mini ×9 under XS tanks (1.5 m), one Hydrolox Vacuum, small fairing.</summary>
        public static BuildState C1Small() => BuildState.New("C1", Seed)
            .WithChoice(Slots.LaunchSite, FirstOffered(Slots.LaunchSite))
            .WithChoice(Slots.Fairing, "fairing_small")
            .WithChoice(Slots.UpperStageEngine, "eng_hydrolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_xs")
            .WithChoice(Slots.StageSeparation, "sep_pyro_bolts_springs")
            .WithChoice(Slots.FirstStageEngine, "eng_electric_pump_mini")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_9")
            .WithChoice(Slots.FirstStageTank, "tank_xs");

        /// <summary>Mid-size three-engine build: three Methalox Full-Flow, M tanks, hot staging, standard fairing.</summary>
        public static BuildState MidThreeEngine() => BuildState.New("C2", Seed)
            .WithChoice(Slots.Fairing, "fairing_standard")
            .WithChoice(Slots.UpperStageEngine, "eng_methalox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_1")
            .WithChoice(Slots.UpperStageTank, "tank_m")
            .WithChoice(Slots.StageSeparation, "sep_hot_staging")
            .WithChoice(Slots.FirstStageEngine, "eng_methalox_full_flow")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_3")
            .WithChoice(Slots.FirstStageTank, "tank_m");

        /// <summary>Heavy build with strap-ons: hydrolox core (5.4 m tanks), two heavy solids, reusable large fairing.</summary>
        public static BuildState HeavyWithStrapOns() => BuildState.New("C5", Seed)
            .WithChoice(Slots.Fairing, "fairing_reusable_large")
            .WithChoice(Slots.UpperStageEngine, "eng_hydrolox_vacuum")
            .WithChoice(Slots.UpperStageEngineCount, "engcount_upper_2")
            .WithChoice(Slots.UpperStageTank, "tank_l")
            .WithChoice(Slots.StageSeparation, "sep_pneumatic_pushers")
            .WithChoice(Slots.FirstStageEngine, "eng_hydrolox_high_efficiency")
            .WithChoice(Slots.FirstStageEngineCount, "engcount_first_5")
            .WithChoice(Slots.FirstStageTank, "tank_l")
            .WithChoice(Slots.StrapOnBoosters, "strap_2_heavy_solid");

        private static string FirstOffered(string slot) =>
            VoteOptions.Offered(BuildState.New("C1", Seed), Catalog, slot)[0].Id;
    }
}
