#if UNITY_EDITOR || DEVELOPMENT_BUILD
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Design-system specimen page (Scenes/Dev/MF_DesignSystem.unity, editor and development builds only): every token,
    /// type style, icon and component state on one 1920 × 1080 page. The copy here is specimen text, not game strings.
    /// Started with <c>-mfShot &lt;png&gt;</c> it waits for layout, writes a screenshot and quits (evidence capture).
    /// Hover/pressed/focus states are forced through UI Toolkit's internal pseudo-state flags so they can be seen statically.
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class MfDesignSystemSpecimen : MonoBehaviour
    {
        private VisualElement _root;
        /// <summary>Earth shader sun direction (world space, towards the sun): the backdrop's day side faces the camera.</summary>
        private static readonly int SunDirId = Shader.PropertyToID("_MF_SunDir");
        private static readonly Vector4 BackdropSunDir = new Vector4(-0.55f, 0.35f, -0.76f, 0f);

        private void OnEnable()
        {
            // Without a sun the Earth backdrop renders night-side city lights, which read as stray orange specks.
            Shader.SetGlobalVector(SunDirId, BackdropSunDir);
            _root = GetComponent<UIDocument>().rootVisualElement;
            _root.Clear();
            var page = new VisualElement { name = "specimen" };
            page.AddToClassList("mf-fill");
            page.style.flexDirection = FlexDirection.Row;
            page.style.paddingLeft = 40; page.style.paddingRight = 40; page.style.paddingTop = 28; page.style.paddingBottom = 28;
            _root.Add(page);

            page.Add(Column(Tokens()));
            page.Add(Column(TypeAndIcons()));
            page.Add(Column(Controls()));
            page.Add(Column(DataViz()));
            page.Add(Column(Surfaces(), last: true));
        }

        private IEnumerator Start()
        {
            string shot = Arg("-mfShot");
            if (string.IsNullOrEmpty(shot) || Application.isEditor) yield break;
            yield return new WaitForSecondsRealtime(3f);
            yield return new WaitForEndOfFrame();
            Texture2D frame = ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(shot, frame.EncodeToPNG());
            Debug.Log("[MissionForge] Specimen shot " + shot + " " + frame.width + "x" + frame.height);
            Application.Quit(0);
        }

        // ------------------------------------------------------------------ columns

        private static VisualElement Column(VisualElement content, bool last = false)
        {
            content.style.width = 344;
            content.style.flexShrink = 0;
            if (!last) content.style.marginRight = 24;
            return content;
        }

        private static VisualElement Tokens()
        {
            var col = new VisualElement();
            col.Add(Heading("Tokens"));
            col.Add(Meta("Palette (tokens.json color)"));
            var swatches = Row(wrap: true);
            foreach (var (name, c) in new (string, Color)[]
            {
                ("space", MfPalette.Space), ("console", MfPalette.Console), ("ocean", MfPalette.Ocean), ("ceramic", MfPalette.Ceramic),
                ("signal", MfPalette.Signal), ("sunlight", MfPalette.Sunlight), ("muted", MfPalette.Muted), ("meets", MfPalette.Meets),
                ("marginal", MfPalette.Marginal), ("fails", MfPalette.Fails), ("periwinkle", MfPalette.Periwinkle), ("rose", MfPalette.Rose),
            })
            {
                var cell = new VisualElement();
                // Three per row so every token name ("periwinkle") fits on one line.
                cell.style.width = 108; cell.style.marginRight = 4; cell.style.marginBottom = 6;
                var chip = new VisualElement();
                chip.style.height = 36; chip.style.backgroundColor = c;
                SetRadius(chip, 8);
                SetBorder(chip, 1, MfPalette.WithAlpha(MfPalette.Ceramic, 0.16f));
                cell.Add(chip);
                cell.Add(Meta(name));
                swatches.Add(cell);
            }
            col.Add(swatches);

            col.Add(Meta("Spacing 4-96 px"));
            foreach (int s in new[] { 4, 8, 12, 16, 24, 32, 48, 64, 96 })
            {
                var bar = new VisualElement();
                bar.style.width = s * 3; bar.style.height = 8; bar.style.marginBottom = 4;
                bar.style.backgroundColor = MfPalette.WithAlpha(MfPalette.Signal, 0.7f);
                SetRadius(bar, 4);
                col.Add(bar);
            }

            col.Add(Meta("Radii 8 / 16 / 24 / pill"));
            var radii = Row();
            foreach (int r in new[] { 8, 16, 24, 999 })
            {
                var box = new VisualElement();
                box.style.width = 72; box.style.height = 48; box.style.marginRight = 8;
                box.style.backgroundColor = MfPalette.Console;
                SetBorder(box, 1, MfPalette.WithAlpha(MfPalette.Ceramic, 0.32f));
                SetRadius(box, Mathf.Min(r, 24));
                radii.Add(box);
            }
            col.Add(radii);

            col.Add(Meta("Elevation e1-e4 (9-slice shadows)"));
            // A lit plate stands in for the scene so the shadows (darker than Space) read; radii follow each level's surface.
            var elev = Row();
            elev.style.backgroundColor = MfPalette.WithAlpha(MfPalette.Ocean, 0.55f);
            elev.style.paddingLeft = 16; elev.style.paddingRight = 4; elev.style.paddingTop = 14; elev.style.paddingBottom = 30;
            SetRadius(elev, 16);
            for (int e = 1; e <= 4; e++)
            {
                var card = new VisualElement();
                card.AddToClassList("mf-card");
                card.style.width = 64; card.style.height = 56; card.style.marginRight = 16;
                card.style.backgroundColor = MfPalette.Console;
                SetRadius(card, e == 2 || e == 3 ? 24 : 16);
                card.style.paddingLeft = 0; card.style.paddingRight = 0; card.style.paddingTop = 0; card.style.paddingBottom = 0;
                card.style.alignItems = Align.Center; card.style.justifyContent = Justify.Center;
                MfElevation.Attach(card, e);
                card.Add(Label("e" + e, "mf-label"));
                elev.Add(card);
            }
            col.Add(elev);

            col.Add(Meta("Motion: micro 120, state 200, enter 320 / exit 220, screen 600, count 1000, pulse 1600, celebrate 480 ms"));
            return col;
        }

        private static VisualElement TypeAndIcons()
        {
            var col = new VisualElement();
            col.Add(Heading("Type"));
            col.Add(Label("Display", "mf-display")); // 96 px; the size is in the H1-H3 lines below and tokens.json
            col.Add(Label("H1 title 64", "mf-h1"));
            col.Add(Label("H2 panel 44", "mf-h2"));
            col.Add(Label("H3 card title 36", "mf-h3"));
            var kpi = Label(MfText.WithUnit("9,718", "m/s"), "mf-kpi");
            col.Add(kpi);
            col.Add(Label("Body 32 Plex Sans", "mf-body"));
            col.Add(Label("Label 24, the minimum a player must read", "mf-label"));
            col.Add(Label("Meta 20, ticks and table heads only", "mf-meta"));
            col.Add(Label("ROOM QK7P", "mf-code"));
            col.Add(Label("Tabular 1111 / 8888 / " + MfText.Signed(-42.5, 1), "mf-body"));

            col.Add(Heading("Icons", top: 16));
            var grid = Row(wrap: true);
            foreach (string name in LucideIcons.Names)
            {
                var icon = new MfIcon { kind = name, tooltip = name };
                icon.AddToClassList("mf-icon--24");
                icon.style.marginRight = 10; icon.style.marginBottom = 10;
                grid.Add(icon);
            }
            col.Add(grid);
            return col;
        }

        private static VisualElement Controls()
        {
            var col = new VisualElement();
            col.Add(Heading("Controls"));
            foreach (string variant in new[] { "primary", "secondary", "ghost", "danger" })
            {
                var row = Row();
                row.style.marginBottom = 8;
                foreach (string state in new[] { "", "Hover", "Active", "Focus", "Disabled" })
                {
                    var b = new Button { text = state.Length == 0 ? "Go" : state.Substring(0, 3) };
                    b.AddToClassList("mf-btn");
                    b.AddToClassList("mf-btn--" + variant);
                    b.AddToClassList("mf-btn--s");
                    b.style.marginRight = 6;
                    if (state == "Disabled") b.SetEnabled(false);
                    else if (state.Length > 0) ForcePseudo(b, state);
                    row.Add(b);
                }
                col.Add(row);
            }
            var sizes = Row();
            foreach (string size in new[] { "l", "m", "s" })
            {
                var b = new Button { text = size.ToUpperInvariant() + " " + (size == "l" ? 72 : size == "m" ? 56 : 44) };
                b.AddToClassList("mf-btn");
                b.AddToClassList("mf-btn--primary");
                b.AddToClassList("mf-btn--" + size);
                b.style.marginRight = 8;
                if (size == "l") MfButtons.WithIcon(b, "rocket");
                sizes.Add(b);
            }
            col.Add(sizes);

            var chips = Row(wrap: true);
            chips.style.marginTop = 12;
            chips.Add(Chip("FLIGHT", "mf-chip--role", "user"));
            chips.Add(Chip("No role yet", "mf-chip--muted", "hourglass"));
            var tag = Label("LIVE", "mf-tag");
            tag.AddToClassList("mf-tag--live");
            chips.Add(tag);
            var key = Label("A", "mf-tag");
            key.AddToClassList("mf-tag--key");
            key.style.marginLeft = 8;
            chips.Add(key);
            col.Add(chips);

            var statuses = Row(wrap: true);
            statuses.style.marginTop = 8;
            foreach (var (s, label) in new[] { (MfStatus.Meets, "Meets"), (MfStatus.Marginal, "Marginal"), (MfStatus.Fails, "Fails"), (MfStatus.Pending, "Pending"), (MfStatus.Info, "Info") })
            {
                var badge = new MfStatusBadge();
                badge.Set(s, label);
                badge.style.marginRight = 6; badge.style.marginBottom = 6;
                statuses.Add(badge);
            }
            col.Add(statuses);

            var seg = new MfSegmented();
            seg.SetOptions("spec-seg", ("a", "Cadet"), ("b", "Engineer"), ("c", "Director"));
            seg.Select("b");
            ForcePseudo(seg.Item("c"), "Hover");
            seg.style.marginTop = 8;
            col.Add(seg);

            var toggles = Row();
            toggles.style.marginTop = 8;
            var t1 = new MfToggle { text = "Reduced motion", value = true };
            var t2 = new MfToggle { text = "Off" };
            t2.style.marginLeft = 16;
            toggles.Add(t1);
            toggles.Add(t2);
            col.Add(toggles);

            var field = new TextField { value = "Nova" };
            field.AddToClassList("mf-textfield");
            field.style.marginTop = 8;
            col.Add(Label("Nickname", "mf-field__label"));
            col.Add(field);
            var bad = new TextField { value = "x" };
            bad.AddToClassList("mf-textfield");
            bad.AddToClassList("mf-textfield--invalid");
            bad.style.marginTop = 8;
            col.Add(bad);
            col.Add(Label("Use 2-16 letters", "mf-field__error"));

            var kv = new MfKeyValue();
            kv.Set("Payload mass", "1,250", "kg");
            col.Add(kv);
            var kv2 = new MfKeyValue();
            kv2.Set("Power margin", MfText.Signed(-12, 0), "W");
            col.Add(kv2);
            return col;
        }

        private static VisualElement DataViz()
        {
            var col = new VisualElement();
            col.Add(Heading("Data"));
            AddBar(col, "Meets with requirement", 0.86f, MfStatus.Meets, 0.8f, "need 9,700 m/s", -1f, null);
            AddBar(col, "Marginal (45 deg hatch) + ghost", 0.62f, MfStatus.Marginal, 0.7f, "need 1.20", 0.74f, "+0.12");
            AddBar(col, "Fails (cross-hatch)", 0.36f, MfStatus.Fails, 0.8f, "budget $90 M", 0.30f, MfText.Minus + "$6 M");
            AddBar(col, "Info with band", 0.97f, MfStatus.Info, -1f, null, -1f, null, 0.95f, 0.99f);

            var gauges = Row();
            gauges.style.marginTop = 4;
            var g1 = new MfRadialGauge();
            g1.AddToClassList("mf-gauge--s");
            g1.Set(0.74f, MfStatus.Meets, "74", "%", 0.6f);
            var g2 = new MfRadialGauge();
            g2.AddToClassList("mf-gauge--s");
            g2.Set(0.4f, MfStatus.Marginal, "1.1", "TWR", 0.5f);
            var g3 = new MfRadialGauge();
            g3.AddToClassList("mf-gauge--s");
            g3.Set(0.2f, MfStatus.Fails, "4", "s", 0.25f);
            gauges.Add(g1); gauges.Add(g2); gauges.Add(g3);
            col.Add(gauges);

            var gantt = new MfGanttChart { Gutter = 110f };
            gantt.style.marginTop = 12;
            gantt.Set(new[] { "Lead time", "Integration" }, new List<MfGanttBar>
            {
                new MfGanttBar(0, 0, 90, true, "Engines"),
                new MfGanttBar(0, 0, 40, false, "Fairing"),
                new MfGanttBar(1, 90, 120, true, "Stack"),
                new MfGanttBar(1, 120, 140, true, "Tests", true),
            }, 180, 140, 170, "Deadline 170 d", 60, "Now");
            col.Add(gantt);

            var tally = new MfTallyBar { emptyText = "Waiting for the first vote" };
            tally.Set(new[] { new MfTallySegment("A", 3, true), new MfTallySegment("B", 2), new MfTallySegment("C", 1), new MfTallySegment("D", 1) });
            tally.style.marginTop = 8;
            col.Add(tally);
            var empty = new MfTallyBar { emptyText = "Waiting for the first vote" };
            empty.Set(new[] { new MfTallySegment("A", 0), new MfTallySegment("B", 0) });
            empty.style.marginTop = 8;
            col.Add(empty);

            var stepper = new MfPhaseStepper();
            stepper.SetSteps(new[] { "Concept", "PDR", "CDR" }); // three steps (done, current, locked) fit the 344 px column
            stepper.SetCurrent(1);
            stepper.style.marginTop = 12;
            stepper.style.marginLeft = 0;
            stepper.style.justifyContent = Justify.FlexStart;
            col.Add(stepper);
            return col;
        }

        private static VisualElement Surfaces()
        {
            var col = new VisualElement();
            col.Add(Heading("Surfaces"));
            var glass = new MfGlassPanel();
            glass.AddToClassList("mf-glass");
            glass.style.paddingLeft = glass.style.paddingRight = glass.style.paddingTop = glass.style.paddingBottom = 20;
            glass.Add(Label("Glass panel e2", "mf-h3"));
            glass.Add(Label("Blur + Console 76\u00A0%", "mf-label"));
            var inner = new VisualElement();
            inner.AddToClassList("mf-card");
            inner.AddToClassList("mf-card--flat");
            inner.style.marginTop = 10;
            inner.Add(Label("Flat card inside glass", "mf-label"));
            glass.Add(inner);
            col.Add(glass);

            var seats = Row();
            seats.style.marginTop = 16;
            var s1 = new MfSeatCard();
            s1.SetPlayer("suit_orange", "Nova", "FLIGHT", "No role yet", true, "Reconnecting");
            var s2 = new MfSeatCard();
            s2.SetEmpty("Waiting for crew");
            foreach (MfSeatCard s in new[] { s1, s2 })
            {
                s.style.width = 160; s.style.marginRight = 12;
                seats.Add(s);
            }
            col.Add(seats);

            col.Add(new MfSkeleton { style = { marginTop = 12 } });
            var sk = new MfSkeleton();
            sk.AddToClassList("mf-skeleton--mid");
            col.Add(sk);
            col.Add(new MfEmptyState { text = "Waiting for the first vote" });

            var stack = new VisualElement();
            var toast = new VisualElement();
            toast.AddToClassList("mf-toast");
            toast.AddToClassList("mf-toast--in");
            toast.AddToClassList("mf-toast--meets");
            toast.style.minWidth = 0;
            MfElevation.Attach(toast, 4);
            var ti = new MfIcon { kind = "meets" };
            ti.AddToClassList("mf-toast__icon");
            toast.Add(ti);
            toast.Add(Label("Engine chosen: Kerolox Workhorse", "mf-toast__text"));
            stack.Add(toast);
            col.Add(stack);

            var tip = new VisualElement();
            tip.AddToClassList("mf-tooltip");
            tip.style.position = Position.Relative;
            tip.style.marginTop = 20;
            MfElevation.Attach(tip, 4);
            var caret = new VisualElement();
            caret.AddToClassList("mf-tooltip__caret");
            tip.Add(caret);
            tip.Add(Label("Why TWR matters", "mf-tooltip__title"));
            tip.Add(Label("Thrust must beat weight at lift-off.", "mf-tooltip__text"));
            col.Add(tip);
            return col;
        }

        // ------------------------------------------------------------------ helpers

        private static void AddBar(VisualElement col, string title, float value, MfStatus s, float req, string reqText, float ghost, string ghostText,
            float bandLow = -1f, float bandHigh = -1f)
        {
            col.Add(Meta(title));
            var bar = new MfMetricBar();
            bar.Set(value, s, req, reqText, ghost, ghostText, bandLow, bandHigh);
            bar.style.marginTop = ghostText != null ? 20 : 0;
            bar.style.marginBottom = reqText != null ? 22 : 6;
            col.Add(bar);
        }

        private static VisualElement Chip(string text, string modifier, string icon)
        {
            var chip = new VisualElement();
            chip.AddToClassList("mf-chip");
            chip.AddToClassList(modifier);
            chip.style.marginRight = 8;
            var i = new MfIcon { kind = icon };
            i.AddToClassList("mf-icon--24");
            chip.Add(i);
            chip.Add(Label(text, "mf-chip__label"));
            return chip;
        }

        private static Label Heading(string text, int top = 0)
        {
            Label l = Label(text, "mf-h2");
            l.style.marginTop = top;
            l.style.marginBottom = 8;
            return l;
        }

        private static Label Meta(string text)
        {
            Label l = Label(text, "mf-meta");
            l.style.marginTop = 6;
            l.style.marginBottom = 4;
            l.style.whiteSpace = WhiteSpace.Normal;
            return l;
        }

        private static Label Label(string text, string cls)
        {
            var l = new Label(text);
            l.AddToClassList(cls);
            return l;
        }

        private static VisualElement Row(bool wrap = false)
        {
            var r = new VisualElement();
            r.style.flexDirection = FlexDirection.Row;
            r.style.alignItems = Align.Center;
            if (wrap) r.style.flexWrap = Wrap.Wrap;
            return r;
        }

        private static void SetRadius(VisualElement e, float r)
        {
            e.style.borderTopLeftRadius = e.style.borderTopRightRadius = e.style.borderBottomLeftRadius = e.style.borderBottomRightRadius = r;
        }

        private static void SetBorder(VisualElement e, float w, Color c)
        {
            e.style.borderTopWidth = e.style.borderBottomWidth = e.style.borderLeftWidth = e.style.borderRightWidth = w;
            e.style.borderTopColor = e.style.borderBottomColor = e.style.borderLeftColor = e.style.borderRightColor = c;
        }

        /// <summary>Shows a pseudo-state statically (dev specimen only) through UI Toolkit's internal pseudoStates flags.</summary>
        private static void ForcePseudo(VisualElement e, string state)
        {
            if (e == null) return;
            PropertyInfo p = typeof(VisualElement).GetProperty("pseudoStates", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            if (p == null || !p.CanWrite) return;
            try
            {
                object current = p.GetValue(e);
                object flag = Enum.Parse(p.PropertyType, state);
                int value = Convert.ToInt32(current) | Convert.ToInt32(flag);
                p.SetValue(e, Enum.ToObject(p.PropertyType, value));
            }
            catch (ArgumentException)
            {
                // Unknown flag name in this Unity version: the state is simply not forced.
            }
        }

        private static string Arg(string name)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return null;
        }
    }
}
#endif
