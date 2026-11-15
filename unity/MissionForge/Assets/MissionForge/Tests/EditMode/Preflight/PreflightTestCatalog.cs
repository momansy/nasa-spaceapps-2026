using System.IO;
using MissionForge.Core.Build;
using MissionForge.Core.Data;
using MissionForge.Data;
using MissionForge.Data.Editor;
using MissionForge.Screens.BuildBay;

namespace MissionForge.Screens.Preflight.Tests
{
    /// <summary>The real repository catalog (data/) synced, loaded and parsed by Core once per test run.</summary>
    internal static class PreflightTestCatalog
    {
        public const ulong Seed = 0x7027UL;
        private static GameCatalog _catalog;

        public static GameCatalog Catalog
        {
            get
            {
                if (_catalog != null) return _catalog;
                string target = Path.Combine(Path.GetTempPath(), "mf-t027-catalog-" + Path.GetRandomFileName());
                GameDataSync.Sync(GameDataSync.RepositoryDataPath, target);
                GameDataSet data = GameDataLoader.LoadFromDirectory(target);
                Directory.Delete(target, true);
                return _catalog = CatalogLoader.Load(data.JsonByPath);
            }
        }

        /// <summary>A C1 build with the first <paramref name="votes"/> votes decided by the seeded rehearsal picker.</summary>
        public static BuildState C1(int votes) => SeededBuilds.Partial(Catalog, "C1", Seed, votes);

        /// <summary>The slot of the n-th (0-based) C1 vote.</summary>
        public static string C1Slot(int index)
        {
            BuildState b = BuildState.New("C1", Seed);
            for (int i = 0; ; i++)
            {
                string slot = VoteOptions.NextVote(b, Catalog);
                if (slot == null) return null;
                if (i == index) return slot;
                b = VoteOptions.Commit(b, Catalog, slot, SeededBuilds.Pick(b, Catalog, slot, i));
            }
        }
    }
}
