using System;
using UnityEngine;

namespace MissionForge.Data
{
    /// <summary>
    /// Loads the game data once at start-up and keeps it for the session. Other systems wait for
    /// <see cref="IsReady"/> or subscribe to <see cref="Loaded"/>.
    /// </summary>
    public sealed class GameDataService : MonoBehaviour
    {
        public GameDataSet Data { get; private set; }

        /// <summary>Merged English string table (every strings/en*.json), ready when <see cref="IsReady"/> is true.</summary>
        public GameStrings Strings { get; private set; }
        public bool IsReady => Data != null;
        public string LastError { get; private set; }

        public event Action<GameDataSet> Loaded;
        public event Action<string> Failed;

        private void Start()
        {
            string baseUrl = Application.streamingAssetsPath + "/" + GameDataIndex.FolderName;
            StartCoroutine(GameDataLoader.LoadAsync(baseUrl, OnLoaded, OnFailed));
        }

        private void OnLoaded(GameDataSet data)
        {
            try
            {
                Strings = GameStrings.Merge(data);
            }
            catch (FormatException e)
            {
                OnFailed(e.Message);
                return;
            }
            foreach (string conflict in Strings.Conflicts) Debug.LogWarning("[MissionForge] Duplicate string key " + conflict);
            Data = data;
            LastError = null;
            Loaded?.Invoke(data);
        }

        private void OnFailed(string error)
        {
            LastError = error;
            Debug.LogWarning("[MissionForge] Game data did not load: " + error);
            Failed?.Invoke(error);
        }
    }
}
