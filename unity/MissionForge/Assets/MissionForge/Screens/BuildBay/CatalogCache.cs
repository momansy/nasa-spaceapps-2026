using System;
using MissionForge.Core.Data;
using MissionForge.Data;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>One Core <see cref="GameCatalog"/> per loaded data set, parsed by Core.Data (Unity never interprets rules).</summary>
    public static class CatalogCache
    {
        private static GameDataSet _source;
        private static GameCatalog _catalog;

        public static GameCatalog Get(GameDataSet data)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            if (_catalog != null && ReferenceEquals(_source, data)) return _catalog;
            _catalog = CatalogLoader.Load(data.JsonByPath);
            _source = data;
            return _catalog;
        }
    }
}
