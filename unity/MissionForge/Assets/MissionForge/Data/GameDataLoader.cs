using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine.Networking;

namespace MissionForge.Data
{
    /// <summary>
    /// Reads StreamingAssets/data/. <see cref="LoadAsync"/> uses UnityWebRequest so it works in WebGL
    /// (where StreamingAssets is a URL); <see cref="LoadFromDirectory"/> is the synchronous path for
    /// the editor, desktop tools and tests.
    /// </summary>
    public static class GameDataLoader
    {
        /// <summary>Synchronous load from a folder that contains index.json.</summary>
        public static GameDataSet LoadFromDirectory(string dataDirectory)
        {
            string indexPath = Path.Combine(dataDirectory, GameDataIndex.FileName);
            if (!File.Exists(indexPath)) throw new FileNotFoundException("Game data index not found.", indexPath);
            GameDataIndex index = GameDataIndex.Parse(File.ReadAllText(indexPath));
            var files = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string relative in index.Files)
            {
                string path = Path.Combine(dataDirectory, relative.Replace('/', Path.DirectorySeparatorChar));
                if (!File.Exists(path)) throw new FileNotFoundException("Game data file listed in the index is missing.", path);
                files[relative] = File.ReadAllText(path);
            }
            return new GameDataSet(files);
        }

        /// <summary>
        /// Coroutine load from a base URL or path (for example Application.streamingAssetsPath + "/data").
        /// Calls exactly one of the callbacks.
        /// </summary>
        public static IEnumerator LoadAsync(string baseUrl, Action<GameDataSet> onLoaded, Action<string> onError)
        {
            string root = ToRequestUrl(baseUrl);
            string indexText = null;
            string error = null;
            yield return Fetch(root + "/" + GameDataIndex.FileName, text => indexText = text, e => error = e);
            if (error != null)
            {
                onError?.Invoke(error);
                yield break;
            }

            GameDataIndex index;
            try
            {
                index = GameDataIndex.Parse(indexText);
            }
            catch (Exception e) when (e is FormatException || e is Newtonsoft.Json.JsonException)
            {
                onError?.Invoke("Game data index is invalid: " + e.Message);
                yield break;
            }

            var files = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (string relative in index.Files)
            {
                string key = relative;
                yield return Fetch(root + "/" + relative, text => files[key] = text, e => error = e);
                if (error != null)
                {
                    onError?.Invoke(error);
                    yield break;
                }
            }
            onLoaded?.Invoke(new GameDataSet(files));
        }

        /// <summary>Local absolute paths need a file:// scheme for UnityWebRequest; URLs pass through.</summary>
        public static string ToRequestUrl(string baseUrl)
        {
            string trimmed = (baseUrl ?? string.Empty).TrimEnd('/');
            if (trimmed.Contains("://")) return trimmed;
            return "file://" + trimmed;
        }

        private static IEnumerator Fetch(string url, Action<string> onText, Action<string> onError)
        {
            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                {
                    onError("Could not load " + url + ": " + request.error);
                }
                else
                {
                    onText(request.downloadHandler.text);
                }
            }
        }
    }
}
