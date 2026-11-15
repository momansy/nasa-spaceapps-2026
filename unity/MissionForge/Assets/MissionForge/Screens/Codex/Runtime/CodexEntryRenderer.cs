using System.Collections.Generic;
using System.Linq;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Codex
{
    /// <summary>Draws one Codex entry: illustration slot, title, body, simplification, strengths and drawbacks, key numbers, citations.</summary>
    public static class CodexEntryRenderer
    {
        public static void Render(VisualElement host, CodexEntryView e, EndText text, bool imperial, FactView mcoFact)
        {
            host.Add(Art(e, text));
            var title = new Label(text[e.TitleKey]);
            title.AddToClassList("mf-h2");
            title.AddToClassList("mf-codex-entry__title");
            host.Add(title);

            if (!e.Unlocked)
            {
                var box = Box("lock", text["ui.host.codex.locked"], "mf-codex-box--locked");
                box.Add(BoxText(text[e.UnlockHintKey]));
                host.Add(box);
                return;
            }

            if (e.SubtitleKey != null)
            {
                var sub = new Label(text[e.SubtitleKey]);
                sub.AddToClassList("mf-label");
                sub.AddToClassList("mf-codex-entry__sub");
                host.Add(sub);
            }
            if (e.Sensitive) host.Add(Badge("hand", text["ui.host.codex.sensitive"], "mf-codex-badge--respect"));

            if (e.Category == CodexCategory.Physics && e.BodyKey != null)
            {
                var reality = Box("globe", text["ui.host.codex.reality"], null);
                reality.Add(BoxText(text[e.BodyKey]));
                host.Add(reality);
            }
            else if (e.BodyKey != null)
            {
                string body = e.BodyArgKeys.Count > 0 ? text.Format(e.BodyKey, e.BodyArgKeys.Select(k => (object)Lower(text[k])).ToArray()) : text[e.BodyKey];
                var b = new Label(body);
                b.AddToClassList("mf-body");
                b.AddToClassList("mf-codex-entry__body");
                host.Add(b);
            }
            if (e.SimplificationKey != null)
            {
                var simp = Box("layers", text["ui.host.codex.simplification"], "mf-codex-box--simplification");
                simp.Add(BoxText(text[e.SimplificationKey]));
                host.Add(simp);
            }
            if (e.Stats.Count > 0)
            {
                var stats = Box("ruler", text["ui.host.codex.stats"], null);
                foreach (CodexStat s in e.Stats) stats.Add(Stat(s, text, imperial));
                host.Add(stats);
                if (imperial && mcoFact != null) host.Add(McoLesson(text, mcoFact));
            }
            AddList(host, e.StrengthKeys, "meets", text["ui.host.codex.strengths"], "mf-codex-box--strengths", text);
            AddList(host, e.DrawbackKeys, "fails", text["ui.host.codex.drawbacks"], "mf-codex-box--drawbacks", text);

            if (e.Facts.Count > 0)
            {
                bool own = e.Category == CodexCategory.Facts;
                var cites = Box("book-open", text[e.Category == CodexCategory.Lessons ? "ui.host.codex.parallel" : "ui.host.codex.sources"], null);
                foreach (FactView f in e.Facts) cites.Add(Citation(f, text, !own));
                host.Add(cites);
            }
        }

        private static string Lower(string s) => string.IsNullOrEmpty(s) ? s : char.ToLowerInvariant(s[0]) + s.Substring(1);

        private static VisualElement Art(CodexEntryView e, EndText text)
        {
            var art = new VisualElement { name = "codex-art" };
            art.AddToClassList("mf-codex-art");
            art.EnableInClassList("mf-codex-art--locked", !e.Unlocked);
            var ring2 = new VisualElement();
            ring2.AddToClassList("mf-codex-art__ring");
            ring2.AddToClassList("mf-codex-art__ring--2");
            var ring = new VisualElement();
            ring.AddToClassList("mf-codex-art__ring");
            var glyph = new MfIcon { kind = e.Unlocked ? IconFor(e.Category) : "lock" };
            glyph.AddToClassList("mf-codex-art__glyph");
            var caption = new Label(text["ui.host.codex.category." + e.Category]);
            caption.AddToClassList("mf-codex-art__caption");
            art.Add(ring2);
            art.Add(ring);
            art.Add(glyph);
            art.Add(caption);
            return art;
        }

        private static VisualElement McoLesson(EndText text, FactView f)
        {
            var box = Box("ruler", text["ui.host.codex.imperial.lesson.title"], "mf-codex-box--mco");
            box.Add(BoxText(text["ui.host.codex.imperial.lesson.body"]));
            box.Add(Citation(f, text, true));
            return box;
        }

        private static VisualElement Stat(CodexStat s, EndText text, bool imperial)
        {
            var row = new VisualElement();
            row.AddToClassList("mf-codex-stat");
            var name = new Label(text[s.NameKey]);
            name.AddToClassList("mf-codex-stat__name");
            row.Add(name);
            var value = new Label(MfText.WithUnit(s.SiText, s.SiUnit)) { enableRichText = true };
            value.AddToClassList("mf-codex-stat__value");
            row.Add(value);
            if (imperial && s.HasImperial)
            {
                var imp = new Label("(" + s.ImperialText + " " + s.ImperialUnit + ")");
                imp.AddToClassList("mf-codex-stat__imperial");
                row.Add(imp);
            }
            return row;
        }

        private static void AddList(VisualElement host, IReadOnlyList<string> keys, string icon, string title, string modifier, EndText text)
        {
            if (keys == null || keys.Count == 0) return;
            var box = Box(icon, title, modifier);
            foreach (string k in keys) box.Add(BoxText("• " + text[k]));
            host.Add(box);
        }

        public static VisualElement Citation(FactView f, EndText text, bool withText)
        {
            var cite = new VisualElement();
            cite.AddToClassList("mf-codex-cite");
            if (withText)
            {
                var t = new Label(text[f.TextKey]);
                t.AddToClassList("mf-codex-cite__text");
                cite.Add(t);
            }
            var src = new Label(text.Format("ui.host.debrief.facts.source", text[f.SourceKey]));
            src.AddToClassList("mf-codex-cite__source");
            cite.Add(src);
            cite.Add(f.NeedsBadge
                ? Badge("hourglass", text["ui.host.debrief.facts.checking"], "mf-codex-badge--checking")
                : Badge("shield-check", text["ui.host.codex.verified"], "mf-codex-badge--verified"));
            return cite;
        }

        private static VisualElement Badge(string icon, string label, string modifier)
        {
            var badge = new VisualElement();
            badge.AddToClassList("mf-codex-badge");
            badge.AddToClassList(modifier);
            badge.Add(new MfIcon { kind = icon });
            badge.Add(new Label(label));
            return badge;
        }

        private static VisualElement Box(string icon, string title, string modifier)
        {
            var box = new VisualElement();
            box.AddToClassList("mf-codex-box");
            if (modifier != null) box.AddToClassList(modifier);
            var head = new VisualElement();
            head.AddToClassList("mf-codex-box__head");
            head.Add(new MfIcon { kind = icon });
            var t = new Label(title);
            t.AddToClassList("mf-codex-box__title");
            head.Add(t);
            box.Add(head);
            return box;
        }

        private static Label BoxText(string s)
        {
            var l = new Label(s);
            l.AddToClassList("mf-codex-box__text");
            return l;
        }

        public static string IconFor(CodexCategory c)
        {
            switch (c)
            {
                case CodexCategory.Physics: return "orbit";
                case CodexCategory.Parts: return "rocket";
                case CodexCategory.Facts: return "book-open";
                case CodexCategory.Lessons: return "list-checks";
                case CodexCategory.Milestones: return "flag";
                case CodexCategory.Minigames: return "star";
                default: return "circle";
            }
        }
    }
}
