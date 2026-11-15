using System.Collections.Generic;
using MissionForge.Core.Build;
using MissionForge.Screens.BuildBay;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// Player-visible text of the pre-flight screens: keys from <c>data/strings/en*.json</c> (existing keys first, new
    /// ones in <c>en.host_preflight.json</c>), numbers with their unit, the true minus sign.
    /// </summary>
    public sealed class PreflightText
    {
        private readonly UiText _text;

        public PreflightText(UiText text) => _text = text;

        public static PreflightText From(IReadOnlyDictionary<string, string> table) => new PreflightText(UiText.From(table));

        public string Get(string key) => _text.Get(key);
        public bool Has(string key) => _text.Has(key);
        public string Format(string key, params object[] args) => _text.Format(key, args);

        public string Money(double m) => UiText.Number(m, m < 10 && m != System.Math.Round(m) ? 1 : 0) + " " + _text.Get("ui.buildbay.unit.money_m");
        public string Days(double d) => UiText.Number(d, 0) + " " + _text.Get("ui.buildbay.unit.days");
        public string SignedDays(double d) => UiText.Signed(d, 0) + " " + _text.Get("ui.buildbay.unit.days");
        public string SignedMoney(double m) => UiText.Signed(m, 1) + " " + _text.Get("ui.buildbay.unit.money_m");
        public string KmPerS(double mps) => UiText.Number(mps / 1000.0, 2) + " " + _text.Get("ui.buildbay.unit.km_s");
        public string Percent(double fraction, int decimals = 0) => UiText.Number(fraction * 100.0, decimals) + " " + _text.Get("ui.buildbay.unit.percent");
        public string Seconds(int s) => s + " " + _text.Get("ui.buildbay.unit.s");

        public string RoleName(string role) => _text.Get("role." + role + ".name");

        /// <summary>Name of a vote option: label key, contract, quick-vote token or anomaly response.</summary>
        public string OptionName(VoteRoundModel round, OptionState o)
        {
            if (o.LabelKey != null) return _text.Get(o.LabelKey);
            switch (round.Kind)
            {
                case "CONTRACT": return _text.Get("contract." + o.Id + ".name");
                case "ANOMALY":
                {
                    string key = "anomaly." + round.SubjectId + ".response." + o.Id;
                    if (_text.Has(key)) return _text.Get(key);
                    break;
                }
            }
            string token = "ui.host.vote.option." + o.Id.ToLowerInvariant();
            return _text.Has(token) ? _text.Get(token) : o.Id;
        }

        public string Stage(string stage) => _text.Get("ui.host.vote.stage." + (stage ?? "reveal").ToLowerInvariant());

        public string Method(string method) => _text.Get("ui.buildbay.vote.method." + (method ?? "plurality").ToLowerInvariant());
    }
}
