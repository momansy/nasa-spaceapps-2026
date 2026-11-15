using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using MissionForge.App;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Codex
{
    /// <summary>
    /// Controller of <c>MF_Codex</c> (design 14.1 screen 14), an overlay: categories, entries with locked and unlocked states,
    /// and the entry view with its illustration slot, citation and verification badge. The optional imperial display
    /// (14.4) shows imperial values next to SI and the Mars Climate Orbiter lesson (fact F01).
    /// </summary>
    public sealed class CodexScreen : ScreenController
    {
        private const float DataTimeoutSeconds = 20f;
        private const string ImperialPref = "mf.host.codex_imperial";
        private const string McoFactId = "F01";

        [Tooltip("Screens/Codex/Data/codex_links.json")]
        [SerializeField] private TextAsset links;
        [Tooltip("Screens/Codex/Fixtures/codex_rehearsal.json: unlocks shown when no live session has any.")]
        [SerializeField] private TextAsset rehearsalUnlocks;

        private EndText _text;
        private CodexSource _source;
        private CodexCategory _category = CodexCategory.Physics;
        private string _selected;
        private bool _imperial;
        private Coroutine _loading;

        public CodexSource Source => _source;
        public event Action Built;

        protected override void OnEnter()
        {
            Button close = Screen.Q<Button>("btn-close");
            if (close != null) close.clicked += () => App?.Flow.CloseOverlay();
            MfToggle toggle = Screen.Q<MfToggle>("imperial-toggle");
            _imperial = PlayerPrefs.GetInt(ImperialPref, 0) != 0;
            if (toggle != null)
            {
                toggle.value = _imperial;
                toggle.Changed += SetImperial;
            }
            Screen.Query<ScrollView>(className: "mf-codex__scroll").ForEach(sv => MfScrollFade.Attach(sv));
            _loading = StartCoroutine(BuildWhenReady());
        }

        protected override void OnExit()
        {
            if (_loading != null) StopCoroutine(_loading);
        }

        private IEnumerator BuildWhenReady()
        {
            float until = Time.realtimeSinceStartup + DataTimeoutSeconds;
            while (App == null || App.Data == null || !App.Data.IsReady)
            {
                if (Time.realtimeSinceStartup > until)
                {
                    Debug.LogWarning("[MissionForge] Codex: game data did not load.");
                    yield break;
                }
                yield return null;
            }
            _text = new EndText(App.Data.Strings.Get);

            CodexUnlocks unlocks;
            bool rehearsal = EndScreenSession.PendingDebrief == null;
            unlocks = rehearsal && rehearsalUnlocks != null ? CodexSource.ParseUnlocks(rehearsalUnlocks.text) : new CodexUnlocks();
            unlocks.AddDebrief(EndScreenSession.LastDebrief);
            foreach (string id in EndScreenSession.UnlockedCodex) unlocks.EntryIds.Add(id);
            try
            {
                _source = new CodexSource(App.Data.Data.JsonByPath, links != null ? links.text : null, unlocks, rehearsal);
            }
            catch (Exception e)
            {
                Debug.LogError("[MissionForge] Codex: entries could not be built: " + e.Message);
                yield break;
            }

            SetText("codex-title", _text["ui.host.codex.title"]);
            SetText("codex-progress", _text.Format("ui.host.codex.progress", _source.Entries.Count(e => e.Unlocked), _source.Entries.Count));
            SetText("rehearsal-text", _text["ui.host.debrief.rehearsal"]);
            Screen.Q("rehearsal-tag")?.EnableInClassList("mf-codex__rehearsal--hidden", !(rehearsal && (Application.isEditor || Debug.isDebugBuild)));
            MfToggle toggle = Screen.Q<MfToggle>("imperial-toggle");
            if (toggle != null) toggle.text = _text["ui.host.codex.imperial"];
            Button close = Screen.Q<Button>("btn-close");
            if (close != null) { close.text = _text["ui.host.codex.close"]; MfButtons.WithIcon(close, "x"); }

            string focus = EndScreenSession.CodexFocus;
            EndScreenSession.CodexFocus = null;
            CodexEntryView focused = focus != null ? _source.Find(focus) : null;
            if (focused != null) _category = focused.Category;
            BuildCategories();
            SelectCategory(_category, focused?.Id);
            FocusWhenShown(Screen.Q<Button>("cat-" + _category));
            _loading = null;
            Built?.Invoke();
        }

        // ---------- public (evidence, links) ----------

        public void SelectCategory(CodexCategory category, string entryId = null)
        {
            _category = category;
            Screen.Query<Button>(className: "mf-codex-cat").ForEach(b => b.EnableInClassList("mf-codex-cat--on", b.name == "cat-" + category));
            SetText("list-title", _text["ui.host.codex.category." + category]);
            List<CodexEntryView> entries = _source.In(category).ToList();
            VisualElement list = Screen.Q("entries");
            list.Clear();
            foreach (CodexEntryView e in entries) list.Add(Item(e));
            string pick = entryId ?? entries.FirstOrDefault(e => e.Unlocked)?.Id ?? entries.FirstOrDefault()?.Id;
            if (pick != null) SelectEntry(pick);
        }

        public void SelectEntry(string id)
        {
            _selected = id;
            Button selectedItem = null;
            Screen.Query<Button>(className: "mf-codex-item").ForEach(b =>
            {
                bool on = b.name == "entry-" + id;
                b.EnableInClassList("mf-codex-item--on", on);
                if (on) selectedItem = b;
            });
            ScrollView listScroll = Screen.Q<ScrollView>("list-scroll");
            if (selectedItem != null && listScroll != null)
            {
                Button target = selectedItem;
                listScroll.schedule.Execute(() =>
                {
                    if (target.panel == null || target.parent == null) return;
                    float y = target.layout.y + target.parent.layout.y;
                    float view = listScroll.contentViewport.layout.height;
                    if (y + target.layout.height > listScroll.scrollOffset.y + view || y < listScroll.scrollOffset.y)
                        listScroll.scrollOffset = new Vector2(0f, Mathf.Max(0f, y - 16f));
                }).StartingIn(60);
            }
            CodexEntryView e = _source.Find(id);
            VisualElement host = Screen.Q("entry");
            host.Clear();
            if (e != null) CodexEntryRenderer.Render(host, e, _text, _imperial, _source.Facts.Find(McoFactId));
        }

        public void SetImperial(bool on)
        {
            _imperial = on;
            PlayerPrefs.SetInt(ImperialPref, on ? 1 : 0);
            MfToggle toggle = Screen.Q<MfToggle>("imperial-toggle");
            if (toggle != null) toggle.value = on;
            if (_selected != null && _source != null) SelectEntry(_selected);
        }

        // ---------- builders ----------

        private void BuildCategories()
        {
            VisualElement host = Screen.Q("categories");
            host.Clear();
            foreach (CodexCategory c in Enum.GetValues(typeof(CodexCategory)))
            {
                CodexCategory captured = c;
                List<CodexEntryView> all = _source.In(c).ToList();
                var b = new Button(() => SelectCategory(captured)) { name = "cat-" + c };
                b.AddToClassList("mf-codex-cat");
                var icon = new MfIcon { kind = CodexEntryRenderer.IconFor(c) };
                icon.AddToClassList("mf-codex-cat__icon");
                var text = new VisualElement();
                text.AddToClassList("mf-codex-cat__text");
                var name = new Label(_text["ui.host.codex.category." + c]);
                name.AddToClassList("mf-codex-cat__name");
                var count = new Label(_text.Format("ui.host.codex.progress", all.Count(e => e.Unlocked), all.Count));
                count.AddToClassList("mf-codex-cat__count");
                text.Add(name);
                text.Add(count);
                b.Add(icon);
                b.Add(text);
                host.Add(b);
            }
        }

        private Button Item(CodexEntryView e)
        {
            var b = new Button(() => SelectEntry(e.Id)) { name = "entry-" + e.Id };
            b.AddToClassList("mf-codex-item");
            b.EnableInClassList("mf-codex-item--locked", !e.Unlocked);
            var icon = new MfIcon { kind = e.Unlocked ? CodexEntryRenderer.IconFor(e.Category) : "lock" };
            icon.AddToClassList("mf-codex-item__icon");
            var text = new VisualElement();
            text.AddToClassList("mf-codex-item__text");
            var title = new Label(_text[e.TitleKey]);
            title.AddToClassList("mf-codex-item__title");
            text.Add(title);
            string sub = e.Unlocked ? (e.SubtitleKey != null ? _text[e.SubtitleKey] : null) : _text["ui.host.codex.locked"];
            if (!string.IsNullOrEmpty(sub))
            {
                var s = new Label(sub);
                s.AddToClassList("mf-codex-item__sub");
                text.Add(s);
            }
            b.Add(icon);
            b.Add(text);
            return b;
        }

        private void SetText(string name, string value)
        {
            Label l = Screen.Q<Label>(name);
            if (l != null) l.text = value;
        }

        /// <summary>Focuses <paramref name="target"/> once SceneFlow has enabled the screen (it is disabled while fading in).</summary>
        internal static void FocusWhenShown(VisualElement target)
        {
            if (target == null) return;
            int tries = 0;
            IVisualElementScheduledItem item = null;
            item = target.schedule.Execute(() =>
            {
                tries++;
                if (target.panel != null && target.enabledInHierarchy && target.resolvedStyle.display != DisplayStyle.None)
                {
                    target.Focus();
                    if (target.panel.focusController.focusedElement == target || tries > 40) item.Pause();
                }
                else if (tries > 40) item.Pause();
            }).Every(50);
        }
    }
}
