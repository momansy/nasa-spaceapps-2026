using System;
using System.Collections.Generic;
using UnityEngine;

namespace MissionForge.Settings
{
    /// <summary>Key/value storage behind <see cref="HostPreferences"/> (PlayerPrefs in the app, memory in tests).</summary>
    public interface IPreferenceStore
    {
        bool HasKey(string key);
        float GetFloat(string key, float fallback);
        int GetInt(string key, int fallback);
        string GetString(string key, string fallback);
        void SetFloat(string key, float value);
        void SetInt(string key, int value);
        void SetString(string key, string value);
        void Save();
    }

    /// <summary>PlayerPrefs-backed store. Holds only display preferences of this host machine, no personal data.</summary>
    public sealed class PlayerPrefsStore : IPreferenceStore
    {
        public bool HasKey(string key) => PlayerPrefs.HasKey(key);
        public float GetFloat(string key, float fallback) => PlayerPrefs.GetFloat(key, fallback);
        public int GetInt(string key, int fallback) => PlayerPrefs.GetInt(key, fallback);
        public string GetString(string key, string fallback) => PlayerPrefs.GetString(key, fallback);
        public void SetFloat(string key, float value) => PlayerPrefs.SetFloat(key, value);
        public void SetInt(string key, int value) => PlayerPrefs.SetInt(key, value);
        public void SetString(string key, string value) => PlayerPrefs.SetString(key, value);
        public void Save() => PlayerPrefs.Save();
    }

    /// <summary>In-memory store for tests and for sessions that must not persist.</summary>
    public sealed class MemoryPreferenceStore : IPreferenceStore
    {
        private readonly Dictionary<string, object> _values = new Dictionary<string, object>();
        public int SaveCount { get; private set; }
        public bool HasKey(string key) => _values.ContainsKey(key);
        public float GetFloat(string key, float fallback) => _values.TryGetValue(key, out object v) && v is float f ? f : fallback;
        public int GetInt(string key, int fallback) => _values.TryGetValue(key, out object v) && v is int i ? i : fallback;
        public string GetString(string key, string fallback) => _values.TryGetValue(key, out object v) && v is string s ? s : fallback;
        public void SetFloat(string key, float value) => _values[key] = value;
        public void SetInt(string key, int value) => _values[key] = value;
        public void SetString(string key, string value) => _values[key] = value;
        public void Save() => SaveCount++;
    }

    /// <summary>
    /// Display preferences of the host machine (design 16): volumes, subtitles, text scale, high contrast, reduced motion
    /// and language (right-to-left mirrors the layout). Persisted with PlayerPrefs; every change raises <see cref="Changed"/>.
    /// This is the hook the audio (T023) reads for its mixer volumes. All values are game_value presentation settings.
    /// </summary>
    public sealed class HostPreferences
    {
        public const string KeyPrefix = "mf.host.";
        public const int MinTextScalePercent = 100;
        public const int MaxTextScalePercent = 200;
        /// <summary>Text scales the design system lays out (UI/DESIGN_SYSTEM.md: 100 % and the .mf-text-200 mode).</summary>
        public static readonly int[] TextScaleOptions = { 100, 200 };
        /// <summary>Host languages with string tables in data/strings.</summary>
        public static readonly string[] Languages = { "en", "ar", "es", "fr", "hi", "pt" };
        /// <summary>Languages written right to left.</summary>
        public static readonly string[] RightToLeftLanguages = { "ar" };

        private readonly IPreferenceStore _store;
        private float _master = 1f, _music = 0.8f, _effects = 0.9f, _voice = 1f;
        private bool _subtitles = true, _highContrast, _reducedMotion;
        private int _textScale = MinTextScalePercent;
        private string _language = "en";

        private static HostPreferences _current;

        /// <summary>The app-wide preferences, loaded from PlayerPrefs on first use.</summary>
        public static HostPreferences Current => _current ??= new HostPreferences(new PlayerPrefsStore());

        /// <summary>Replaces the app-wide instance (tests, evidence).</summary>
        public static void SetCurrent(HostPreferences preferences) => _current = preferences;

        public HostPreferences(IPreferenceStore store)
        {
            _store = store ?? throw new ArgumentNullException(nameof(store));
            Load();
        }

        public event Action<HostPreferences> Changed;

        /// <summary>Master volume, 0–1 (game_value).</summary>
        public float MasterVolume { get => _master; set => Set(ref _master, Clamp01(value)); }
        /// <summary>Music volume, 0–1.</summary>
        public float MusicVolume { get => _music; set => Set(ref _music, Clamp01(value)); }
        /// <summary>Sound effects volume, 0–1.</summary>
        public float EffectsVolume { get => _effects; set => Set(ref _effects, Clamp01(value)); }
        /// <summary>Voice (CAPCOM, Flight Director) volume, 0–1.</summary>
        public float VoiceVolume { get => _voice; set => Set(ref _voice, Clamp01(value)); }
        public bool Subtitles { get => _subtitles; set => Set(ref _subtitles, value); }
        public bool HighContrast { get => _highContrast; set => Set(ref _highContrast, value); }
        public bool ReducedMotion { get => _reducedMotion; set => Set(ref _reducedMotion, value); }

        /// <summary>Text scale, % (100–200, clamped).</summary>
        public int TextScalePercent { get => _textScale; set => Set(ref _textScale, ClampScale(value)); }

        /// <summary>Language code (one of <see cref="Languages"/>; anything else falls back to en).</summary>
        public string Language { get => _language; set => Set(ref _language, ValidLanguage(value)); }

        public bool RightToLeft => Array.IndexOf(RightToLeftLanguages, _language) >= 0;

        /// <summary>True when the text scale needs the design system's large-text layout (.mf-text-200).</summary>
        public bool LargeText => _textScale >= (MinTextScalePercent + MaxTextScalePercent) / 2;

        public bool IsDefault =>
            _master >= 1f && Mathf.Approximately(_music, 0.8f) && Mathf.Approximately(_effects, 0.9f) && _voice >= 1f && _subtitles &&
            !_highContrast && !_reducedMotion && _textScale == MinTextScalePercent && _language == "en";

        public void ResetToDefaults()
        {
            _master = 1f; _music = 0.8f; _effects = 0.9f; _voice = 1f;
            _subtitles = true; _highContrast = false; _reducedMotion = false;
            _textScale = MinTextScalePercent; _language = "en";
            SaveAndNotify();
        }

        private void Load()
        {
            _master = Clamp01(_store.GetFloat(KeyPrefix + "master", _master));
            _music = Clamp01(_store.GetFloat(KeyPrefix + "music", _music));
            _effects = Clamp01(_store.GetFloat(KeyPrefix + "effects", _effects));
            _voice = Clamp01(_store.GetFloat(KeyPrefix + "voice", _voice));
            _subtitles = _store.GetInt(KeyPrefix + "subtitles", _subtitles ? 1 : 0) != 0;
            _highContrast = _store.GetInt(KeyPrefix + "high_contrast", 0) != 0;
            _reducedMotion = _store.GetInt(KeyPrefix + "reduced_motion", 0) != 0;
            _textScale = ClampScale(_store.GetInt(KeyPrefix + "text_scale", _textScale));
            _language = ValidLanguage(_store.GetString(KeyPrefix + "language", _language));
        }

        private void SaveAndNotify()
        {
            _store.SetFloat(KeyPrefix + "master", _master);
            _store.SetFloat(KeyPrefix + "music", _music);
            _store.SetFloat(KeyPrefix + "effects", _effects);
            _store.SetFloat(KeyPrefix + "voice", _voice);
            _store.SetInt(KeyPrefix + "subtitles", _subtitles ? 1 : 0);
            _store.SetInt(KeyPrefix + "high_contrast", _highContrast ? 1 : 0);
            _store.SetInt(KeyPrefix + "reduced_motion", _reducedMotion ? 1 : 0);
            _store.SetInt(KeyPrefix + "text_scale", _textScale);
            _store.SetString(KeyPrefix + "language", _language);
            _store.Save();
            Changed?.Invoke(this);
        }

        private void Set<T>(ref T field, T value)
        {
            if (EqualityComparer<T>.Default.Equals(field, value)) return;
            field = value;
            SaveAndNotify();
        }

        private static float Clamp01(float v) => float.IsNaN(v) ? 0f : Mathf.Clamp01(v);

        private static int ClampScale(int v) => Mathf.Clamp(v, MinTextScalePercent, MaxTextScalePercent);

        private static string ValidLanguage(string code) => Array.IndexOf(Languages, code) >= 0 ? code : "en";
    }
}
