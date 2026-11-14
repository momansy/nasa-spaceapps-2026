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
