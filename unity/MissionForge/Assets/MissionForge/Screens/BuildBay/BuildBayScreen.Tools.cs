using System;
using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Vehicle;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace MissionForge.Screens.BuildBay
{
    /// <summary>
    /// Preview tools of design 6.10 on the host (T015 step 8): on-screen chips and keys through the Input System —
    /// C compare, X exploded, R scale reference, M stability markers, Space skips an assembly. Labels are leader-line
    /// tags projected from the 3D view onto the stage layer.
    /// </summary>
    public sealed partial class BuildBayScreen
    {
        public enum Tool
        {
            Compare,
            Exploded,
            Scale,
            Stability,
        }

        private static readonly (Tool tool, Key key, string label, string stringKey)[] Tools =
        {
            (Tool.Compare, Key.C, "C", "ui.buildbay.tools.compare"),
            (Tool.Exploded, Key.X, "X", "ui.buildbay.tools.exploded"),
            (Tool.Scale, Key.R, "R", "ui.buildbay.tools.scale"),
            (Tool.Stability, Key.M, "M", "ui.buildbay.tools.stability"),
        };

        private readonly HashSet<Tool> _active = new HashSet<Tool>();
        private readonly Dictionary<Tool, VisualElement> _chips = new Dictionary<Tool, VisualElement>();
        private VisualElement _labels, _compare, _stabilityNote;
        private readonly List<(VisualElement tag, Func<Vector3?> anchor, bool left)> _tags = new List<(VisualElement, Func<Vector3?>, bool)>();
        private string _compareKey;

        public bool IsToolOn(Tool tool) => _active.Contains(tool);

        private void BindTools()
        {
            _labels = Screen.Q<VisualElement>("stage-labels");
            _compare = Screen.Q<VisualElement>("compare");
            _stabilityNote = Screen.Q<VisualElement>("stability-note");
            VisualElement container = Screen.Q<VisualElement>("tools");
            container.Clear();
            foreach (var t in Tools)
            {
                var chip = new VisualElement { name = "tool-" + t.tool.ToString().ToLowerInvariant(), focusable = true, pickingMode = PickingMode.Position };
                chip.AddToClassList("bb-tool");
                var key = new Label(t.label);
                key.AddToClassList("bb-tool__key");
                var label = new Label(_text.Get(t.stringKey));
                label.AddToClassList("bb-tool__label");
                chip.Add(key);
                chip.Add(label);
                Tool tool = t.tool;
                chip.RegisterCallback<ClickEvent>(_ => Toggle(tool));
                container.Add(chip);
                _chips[tool] = chip;
            }
        }

        private void UpdateTools()
        {
            Keyboard k = Keyboard.current;
            if (k != null)
            {
                foreach (var t in Tools) if (k[t.key].wasPressedThisFrame) Toggle(t.tool);
                if (k.spaceKey.wasPressedThisFrame && stage != null) stage.SkipAssembly();
            }
            if (_active.Contains(Tool.Compare)) RefreshCompareIfLeadChanged();
            PositionTags();
        }

        public void Toggle(Tool tool) => SetTool(tool, !_active.Contains(tool));

        public void SetTool(Tool tool, bool on)
        {
            if (on) _active.Add(tool); else _active.Remove(tool);
            if (_chips.TryGetValue(tool, out VisualElement chip)) chip.EnableInClassList("bb-tool--on", on);
            if (stage == null || Session == null) return;
            switch (tool)
            {
                case Tool.Compare:
                    _compareKey = null;
                    if (on) RefreshCompareIfLeadChanged(); else { stage.ShowCompare(null, null); _compare.EnableInClassList("bb-hidden", true); }
                    break;
                case Tool.Exploded:
                    stage.SetExploded(on);
                    break;
                case Tool.Scale:
                    stage.SetScaleReference(on);
                    break;
                case Tool.Stability:
                    _stabilityNote.EnableInClassList("bb-hidden", !on);
                    break;
            }
            RebuildTags();
        }

        // ------------------------------------------------------------------ compare

        /// <summary>The two candidates: the top two options of the open vote by tally (else the first two offered).</summary>
        private (string slot, string a, string b) CompareCandidates()
        {
            string slot = _round.IsOpen && _round.Kind == "PART" ? _roundSlot : Session.NextVote;
            if (slot == null) return (null, null, null);
            var ids = new List<string>();
            if (slot == _roundSlot && _round.IsOpen)
            {
                var ordered = new List<OptionState>(_round.Options);
                ordered.RemoveAll(o => o.Vetoed);
                ordered.Sort((x, y) => (y.Count ?? 0).CompareTo(x.Count ?? 0));
                foreach (OptionState o in ordered) ids.Add(o.Id);
            }
            else
            {
                foreach (PartDefRef p in OfferedIds(slot)) ids.Add(p.Id);
            }
            return ids.Count >= 2 ? (slot, ids[0], ids[1]) : (slot, null, null);
        }

        private readonly struct PartDefRef
        {
            public PartDefRef(string id) { Id = id; }
            public string Id { get; }
        }

        private IEnumerable<PartDefRef> OfferedIds(string slot)
        {
            foreach (var p in VoteOptions.Offered(Session.Build, Session.Catalog, slot)) yield return new PartDefRef(p.Id);
        }

        private void RefreshCompareIfLeadChanged()
        {
            (string slot, string a, string b) = CompareCandidates();
            string key = slot + ":" + a + ":" + b;
            if (key == _compareKey) return;
            _compareKey = key;
            if (a == null)
            {
                stage.ShowCompare(null, null);
                _compare.EnableInClassList("bb-hidden", true);
                return;
            }
            stage.ShowCompare(Session.Build.WithChoice(slot, a), Session.Build.WithChoice(slot, b));
            OptionPreview pa = Preview.Of(Session.Build, Session.Catalog, slot, a);
            OptionPreview pb = Preview.Of(Session.Build, Session.Catalog, slot, b);
            ShowCompareTable(Session.PartName(a), Session.PartName(b), pa.Metrics, pb.Metrics);
            RebuildTags();
        }

        private void ShowCompareTable(string nameA, string nameB, DashboardMetrics a, DashboardMetrics b)
        {
            _compare.Clear();
            _compare.EnableInClassList("bb-hidden", false);
            _compare.Add(CompareRow(true, "", nameA, nameB, _text.Get("ui.buildbay.tools.compare.diff")));
            void Row(string nameKey, double va, double vb, int dec, string unitKey, bool higherIsBetter)
            {
                string u = " " + _text.Get(unitKey);
                double diff = vb - va;
                string arrow = Math.Round(diff, dec) == 0 ? "" : (diff > 0 ? "↑ " : "↓ ");
                _compare.Add(CompareRow(false, _text.Get(nameKey), UiText.Number(va, dec) + u, UiText.Number(vb, dec) + u, arrow + UiText.Signed(diff, dec) + u));
            }
            Row("ui.buildbay.metric.dv.name", a.TotalDvMps, b.TotalDvMps, 0, "ui.buildbay.unit.m_s", true);
            if (a.LiftoffTwr.HasValue && b.LiftoffTwr.HasValue) Row("ui.buildbay.metric.liftoff_twr.name", a.LiftoffTwr.Value, b.LiftoffTwr.Value, 2, "ui.buildbay.unit.ratio", true);
            Row("ui.buildbay.metric.mass.name", a.TotalMassKg / 1000, b.TotalMassKg / 1000, 1, "ui.buildbay.unit.t", false);
            Row("ui.buildbay.metric.cost.name", a.CostM, b.CostM, 1, "ui.buildbay.unit.money_m", false);
            Row("ui.buildbay.metric.schedule.name", a.ScheduleDays, b.ScheduleDays, 0, "ui.buildbay.unit.days", false);
            Row("ui.buildbay.metric.success.name", a.Success.Success * 100, b.Success.Success * 100, 1, "ui.buildbay.unit.percent", true);
        }

        private static VisualElement CompareRow(bool head, string name, string a, string b, string diff)
        {
            var row = new VisualElement();
            row.AddToClassList("bb-compare__row");
            if (head) row.AddToClassList("bb-compare__head");
            foreach ((string text, bool isName) in new[] { (name, true), (a, false), (b, false), (diff, false) })
            {
                var cell = new Label(text);
                cell.AddToClassList("bb-compare__cell");
                if (isName) cell.AddToClassList("bb-compare__cell--name");
                row.Add(cell);
            }
            return row;
        }

        // ------------------------------------------------------------------ leader-line tags

        private void RebuildTags()
        {
            foreach (var t in _tags) t.tag.RemoveFromHierarchy();
            _tags.Clear();
            if (stage == null || stage.Rig == null) return;
            VehicleRig rig = stage.Rig;
            if (_active.Contains(Tool.Compare) && stage.CompareA != null)
            {
                VehicleRig a = stage.CompareA, b = stage.CompareB;
                (string slot, string ia, string ib) = CompareCandidates();
                AddTag("A · " + Session.PartName(ia), () => Top(a), true, "");
                AddTag("B · " + Session.PartName(ib), () => Top(b), false, "");
            }
            if (_active.Contains(Tool.Exploded) && !_active.Contains(Tool.Compare))
            {
                AddPartTag(rig, "tank1", "ui.buildbay.tools.label.tank1", false);
                AddPartTag(rig, "tank2", "ui.buildbay.tools.label.tank2", false);
                AddPartTag(rig, "e1", "ui.buildbay.tools.label.engines", true);
                AddPartTag(rig, "ue1", "ui.buildbay.tools.label.upper_engine", true);
                AddPartTag(rig, "inter", "ui.buildbay.tools.label.interstage", true);
                AddPartTag(rig, "b1", "ui.buildbay.tools.label.boosters", true);
                if (rig.PayloadRoot != null) AddTag(_text.Get("ui.buildbay.tools.label.payload"), () => rig.PayloadRoot.position + Vector3.up * 2f, false, "");
            }
            if (_active.Contains(Tool.Scale))
            {
                IReadOnlyList<GameObject> refs = stage.ScaleRefs;
                string[] keys = { "ui.buildbay.tools.scale.human", "ui.buildbay.tools.scale.building", "ui.buildbay.tools.scale.saturn" };
                for (int i = 0; i < refs.Count && i < keys.Length; i++)
                {
                    GameObject g = refs[i];
                    if (g == null) continue;
                    AddTag(_text.Get(keys[i]), () => VehicleAssembler.RendererBounds(g.transform).max, false, "");
                }
                AddTag(_text.Format("ui.buildbay.tools.scale.vehicle", UiText.Number(rig.LengthM, 1) + " " + _text.Get("ui.buildbay.unit.m")),
                    () => VehicleAssembler.RendererBounds(rig.Root).max, true, "");
            }
            if (_active.Contains(Tool.Stability))
            {
                DashboardMetrics m = Session.Metrics;
                Screen.Q<Label>("stability-note-text").text = _text.Get("ui.buildbay.stability.explain") + " " + _text.Get(m.StabilityTextKey);
                if (m.CenterOfMassM.HasValue && m.VehicleLengthM.HasValue)
                {
                    double len = m.VehicleLengthM.Value;
                    AddTag("• " + _text.Get("ui.buildbay.tools.com") + " · " + UiText.Number(m.CenterOfMassM.Value, 1) + " " + _text.Get("ui.buildbay.unit.m"),
                        () => stage.AxisPointFromNose(m.CenterOfMassM.Value, len), true, "bb-tag--com");
                    AddTag("• " + _text.Get("ui.buildbay.tools.cop") + " · " + UiText.Number(m.CenterOfPressureM.Value, 1) + " " + _text.Get("ui.buildbay.unit.m"),
                        () => stage.AxisPointFromNose(m.CenterOfPressureM.Value, len), false, "bb-tag--cop");
                }
            }
        }

        private static Vector3? Top(VehicleRig rig) => VehicleAssembler.RendererBounds(rig.Root).max;

        private void AddPartTag(VehicleRig rig, string key, string textKey, bool left)
        {
            Transform t = rig.PartByKey(key);
            if (t == null) return;
            AddTag(_text.Get(textKey), () => t == null ? (Vector3?)null : VehicleAssembler.RendererBounds(t).center, left, "");
        }

        private void AddTag(string text, Func<Vector3?> anchor, bool left, string cls)
        {
            var tag = new VisualElement { pickingMode = PickingMode.Ignore };
            tag.AddToClassList("bb-tag");
            if (!string.IsNullOrEmpty(cls)) tag.AddToClassList(cls);
            if (left ^ _a11y.RightToLeft) tag.AddToClassList("bb-tag--left");
            var line = new VisualElement { pickingMode = PickingMode.Ignore };
            line.AddToClassList("bb-tag__line");
            var label = new Label(text) { pickingMode = PickingMode.Ignore };
            label.AddToClassList("bb-tag__text");
            tag.Add(line);
            tag.Add(label);
            _labels.Add(tag);
            _tags.Add((tag, anchor, left ^ _a11y.RightToLeft));
        }

        private void PositionTags()
        {
            if (_tags.Count == 0 || _labels == null || _labels.panel == null) return;
            Camera cam = Camera.main;
            if (cam == null) return;
            Rect layer = _labels.worldBound;
            foreach (var (tag, anchor, left) in _tags)
            {
                Vector3? world = anchor();
                Vector3 sp = world.HasValue ? cam.WorldToScreenPoint(world.Value) : new Vector3(0, 0, -1);
                if (sp.z <= 0f)
                {
                    tag.style.display = DisplayStyle.None;
                    continue;
                }
                Vector2 panelPos = RuntimePanelUtils.ScreenToPanel(_labels.panel, new Vector2(sp.x, UnityEngine.Screen.height - sp.y));
                float width = tag.resolvedStyle.width > 1f ? tag.resolvedStyle.width : 300f;
                float height = tag.resolvedStyle.height > 1f ? tag.resolvedStyle.height : 30f;
                tag.style.display = DisplayStyle.Flex;
                tag.style.left = left ? panelPos.x - layer.x - width : panelPos.x - layer.x;
                tag.style.top = panelPos.y - layer.y - height * 0.5f;
            }
        }
    }
}
