using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MissionForge.Data
{
    /// <summary>
    /// List of the JSON files copied into StreamingAssets/data/. WebGL cannot list a directory,
    /// so the editor sync step writes this index and the runtime loader reads it first.
    /// </summary>
    [Serializable]
    public sealed class GameDataIndex
    {
        public const string FileName = "index.json";
        public const string FolderName = "data";

        /// <summary>Index format version.</summary>
        [JsonProperty("version")] public int Version = 1;

        /// <summary>Paths relative to the data folder, forward slashes, sorted (for example "parts/engines.json").</summary>
        [JsonProperty("files")] public List<string> Files = new List<string>();

        public static GameDataIndex Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) throw new FormatException("Data index is empty.");
            GameDataIndex index = JsonConvert.DeserializeObject<GameDataIndex>(json);
            if (index == null) throw new FormatException("Data index is not a JSON object.");
            if (index.Files == null) index.Files = new List<string>();
            return index;
        }

        public string ToJson() => JsonConvert.SerializeObject(this, Formatting.Indented);
    }
}
