using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>One option's share of a vote: letter, count, and whether it leads or won.</summary>
    public readonly struct MfTallySegment
    {
        public MfTallySegment(string letter, int count, bool leading = false, bool winner = false)
        {
            Letter = letter;
            Count = count;
            Leading = leading;
            Winner = winner;
        }

        public string Letter { get; }
        public int Count { get; }
        public bool Leading { get; }
        public bool Winner { get; }
    }

    /// <summary>
    /// Tally bar (VISUAL_TARGET 3.1): one segment per option, each with its letter badge and one dot per voter.
    /// Series colours in order (Signal, Sunlight, periwinkle, rose), and the letter tells options apart without hue.
    /// Segment widths grow with the count motion token through USS transitions on flex-grow.
    /// </summary>
    [UxmlElement]
    public partial class MfTallyBar : VisualElement
    {
        private readonly List<VisualElement> _segments = new List<VisualElement>();
        private readonly Label _empty;

        public MfTallyBar()
        {
            AddToClassList("mf-tally");
            _empty = new Label { pickingMode = PickingMode.Ignore };
            _empty.AddToClassList("mf-tally__empty");
            Add(_empty);
        }

        /// <summary>Shown while nobody has voted (an explicit localised message, never a grey stand-in bar).</summary>
        [UxmlAttribute] public string emptyText { get => _empty.text; set => _empty.text = value; }

        public void Set(IReadOnlyList<MfTallySegment> options)
        {
            int total = 0;
            foreach (MfTallySegment o in options) total += Mathf.Max(0, o.Count);
            _empty.style.display = total == 0 ? DisplayStyle.Flex : DisplayStyle.None;

            while (_segments.Count < options.Count) _segments.Add(CreateSegment());
            for (int i = 0; i < _segments.Count; i++)
            {
                VisualElement seg = _segments[i];
                bool used = i < options.Count && options[i].Count > 0;
                seg.style.display = used ? DisplayStyle.Flex : DisplayStyle.None;
                if (!used) continue;
                MfTallySegment o = options[i];
                seg.style.flexGrow = o.Count;
                Color series = MfPalette.Series[i % MfPalette.Series.Length];
                seg.style.backgroundColor = MfPalette.WithAlpha(series, o.Winner || o.Leading ? 0.95f : 0.7f);
                seg.EnableInClassList("mf-tally__seg--lead", o.Leading || o.Winner);
                ((Label)seg[0]).text = o.Letter;
                VisualElement dots = seg[1];
                while (dots.childCount < o.Count)
                {
                    var dot = new VisualElement { pickingMode = PickingMode.Ignore };
                    dot.AddToClassList("mf-tally__dot");
                    dots.Add(dot);
                }
                for (int d = 0; d < dots.childCount; d++) dots[d].style.display = d < o.Count ? DisplayStyle.Flex : DisplayStyle.None;
            }
        }

        private VisualElement CreateSegment()
        {
            var seg = new VisualElement { pickingMode = PickingMode.Ignore };
            seg.AddToClassList("mf-tally__seg");
            var letter = new Label { pickingMode = PickingMode.Ignore };
            letter.AddToClassList("mf-tally__letter");
            var dots = new VisualElement { pickingMode = PickingMode.Ignore };
            dots.AddToClassList("mf-tally__dots");
            seg.Add(letter);
            seg.Add(dots);
            Add(seg);
            return seg;
        }
    }
}
