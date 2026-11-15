using System;
using System.Globalization;
using System.Linq;
using MissionForge.EndScreens.Sources;
using MissionForge.UI;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.Screens.Campaign
{
    /// <summary>Builds the Campaign Hub panels from a <see cref="CampaignView"/>. Presentation only.</summary>
    internal sealed class CampaignPanels
    {
        private readonly VisualElement _root;
        private readonly EndText _text;

        public CampaignPanels(VisualElement root, EndText text)
        {
            _root = root;
            _text = text;
        }

        public void Agency(CampaignView v)
        {
            VisualElement host = _root.Q("agency-patch");
            host.Clear();
            var patch = new HexPatch();
            patch.style.width = new Length(100, LengthUnit.Percent);
            patch.style.height = new Length(100, LengthUnit.Percent);
            patch.Set(Initials(v.AgencyName), MfPalette.Sunlight, MfPalette.WithAlpha(MfPalette.Ocean, 0.85f), 5f, true);
            patch.Label.AddToClassList("mf-hub__patch-label");
            host.Add(patch);

            Text("agency-name", MfText.Escape(v.AgencyName));
            Text("agency-site", string.IsNullOrEmpty(v.HomeSiteNameKey) ? "" : _text.Format("ui.host.campaign.home_site", _text[v.HomeSiteNameKey]));
            Text("rep-title", _text["ui.host.campaign.reputation"]);
            Text("rep-value", _text.Format("ui.host.campaign.reputation.value", v.Reputation));
            VisualElement fill = _root.Q("rep-fill");
            if (fill != null) fill.style.width = new Length(Mathf.Clamp(v.Reputation, 0, 100), LengthUnit.Percent);
            Text("rep-note", _text.Format("ui.host.campaign.reputation.note", Pct(v.SupplierDiscount)));

            VisualElement kpis = _root.Q("agency-kpis");
            kpis.Clear();
            kpis.Add(Kpi(v.KnowledgePoints.ToString(CultureInfo.InvariantCulture) + " " + _text["ui.host.debrief.unit.kp"], _text["ui.host.campaign.kp"], "mf-hub-kpi--kp"));
            kpis.Add(Kpi(Money(v.CarriedBudgetM), _text.Format("ui.host.campaign.carry", Pct(v.BudgetCarryFraction)), null));
            kpis.Add(Kpi(_text[v.Insured ? "ui.host.campaign.insured" : "ui.host.campaign.uninsured"],
                _text.Format("ui.host.campaign.insurance.terms", Money(v.InsurancePremiumM), Pct(v.InsuranceRecoveryFraction), Money(v.InsuranceCapM)),
                v.Insured ? "mf-hub-kpi--insured mf-hub-kpi--wide" : "mf-hub-kpi--wide"));
        }

        public void Board(CampaignView v)
        {
            Text("board-title", _text["ui.host.campaign.board"]);
            VisualElement host = _root.Q("offers");
            host.Clear();
            foreach (ContractOfferView o in v.Offers)
            {
                var card = new VisualElement { focusable = true, name = "offer-" + o.Id };
                card.AddToClassList("mf-hub-offer");
                var head = new VisualElement();
                head.AddToClassList("mf-hub-offer__head");
                var name = new Label(_text[o.NameKey]);
                name.AddToClassList("mf-hub-offer__name");
                var id = new Label(o.Id);
                id.AddToClassList("mf-hub-offer__id");
                head.Add(name);
                head.Add(id);
                card.Add(head);
                var dest = new Label(_text[o.DestinationKey]);
                dest.AddToClassList("mf-hub-offer__dest");
                card.Add(dest);
                var facts = new VisualElement();
                facts.AddToClassList("mf-hub-offer__facts");
                facts.Add(Fact(_text.Format("ui.host.campaign.offer.budget", Money(o.BudgetM))));
                facts.Add(Fact(_text.Format("ui.host.campaign.offer.schedule", o.ScheduleDays.ToString("0", CultureInfo.InvariantCulture))));
                facts.Add(Fact(_text.Format("ui.host.campaign.offer.reward", v.SuccessReputation, v.OnTimeBonus)));
                card.Add(facts);
                var diff = new VisualElement();
                diff.AddToClassList("mf-hub-diff");
                var label = new Label(_text.Format("ui.host.campaign.offer.dv", o.DeltaVKmS.ToString("0.0", CultureInfo.InvariantCulture)));
                label.AddToClassList("mf-hub-diff__label");
                var track = new VisualElement();
                track.AddToClassList("mf-hub-diff__track");
                var f = new VisualElement();
                f.AddToClassList("mf-hub-diff__fill");
                f.style.width = new Length((float)(o.Difficulty01 * 100.0), LengthUnit.Percent);
                track.Add(f);
                diff.Add(label);
                diff.Add(track);
                card.Add(diff);
                host.Add(card);
            }
        }

        public void Tech(CampaignView v, Func<string, bool> buy)
        {
            Text("tech-title", _text["ui.host.campaign.tech"]);
            Text("tech-kp", _text.Format("ui.host.campaign.tech.available", v.KnowledgePoints));
            VisualElement host = _root.Q("tech");
            host.Clear();
            foreach (TechNodeView n in v.Tech)
            {
                bool buyable = !n.Purchased && n.PrerequisitesMet && n.Affordable;
                var card = new Button(() => { if (buyable) buy(n.Id); }) { name = "tech-" + n.Id };
                card.AddToClassList("mf-hub-tech");
                card.AddToClassList(n.Purchased ? "mf-hub-tech--owned" : buyable ? "mf-hub-tech--buyable" : "mf-hub-tech--locked");
                var head = new VisualElement();
                head.AddToClassList("mf-hub-tech__head");
                var name = new Label(_text[n.NameKey]);
                name.AddToClassList("mf-hub-tech__name");
                var cost = new Label(n.CostKp + " " + _text["ui.host.debrief.unit.kp"]);
                cost.AddToClassList("mf-hub-tech__cost");
                head.Add(name);
                head.Add(cost);
                card.Add(head);
                var real = new Label(_text[n.RealTechKey]);
                real.AddToClassList("mf-hub-tech__real");
                card.Add(real);
                var parts = new Label(_text.Format("ui.host.campaign.tech.unlocks", string.Join(", ", n.PartNameKeys.Select(k => _text[k]))));
                parts.AddToClassList("mf-hub-tech__parts");
                card.Add(parts);
                var badge = new MfStatusBadge();
                if (n.Purchased) badge.Set(MfStatus.Meets, _text["ui.host.campaign.tech.owned"]);
                else if (!n.PrerequisitesMet) badge.Set(MfStatus.Pending, _text.Format("ui.host.campaign.tech.needs", string.Join(", ", n.Prerequisites.Select(p => _text["ui.host.campaign.tech." + p + ".name"]))));
                else if (!n.Affordable) badge.Set(MfStatus.Marginal, _text["ui.host.campaign.tech.more_kp"]);
                else badge.Set(MfStatus.Info, _text["ui.host.campaign.tech.buy"]);
                card.Add(badge);
                host.Add(card);
            }
        }

        public void Inventory(CampaignView v)
        {
            Text("inventory-title", _text["ui.host.campaign.inventory"]);
            VisualElement host = _root.Q("inventory");
            host.Clear();
            if (v.Inventory.Count == 0)
            {
                var empty = new Label(_text["ui.host.campaign.inventory.empty"]);
                empty.AddToClassList("mf-label");
                host.Add(empty);
                return;
            }
            foreach (InventoryItemView i in v.Inventory)
            {
                var row = new VisualElement { name = "item-" + i.ItemId };
                row.AddToClassList("mf-hub-item");
                var icon = new MfIcon { kind = i.Category.Contains("engine") ? "flame" : i.Category == "fairing" ? "shield" : i.Category == "capsule" ? "users" : "package" };
                icon.AddToClassList("mf-hub-item__icon");
                var text = new VisualElement();
                text.AddToClassList("mf-hub-item__text");
                var name = new Label(_text[i.PartNameKey]);
                name.AddToClassList("mf-hub-item__name");
                var meta = new Label(_text.Format("ui.host.campaign.inventory.meta", i.Flights,
                    Money(i.RefurbishCostM), i.RefurbishDays.ToString("0", CultureInfo.InvariantCulture)));
                meta.AddToClassList("mf-hub-item__meta");
                text.Add(name);
                text.Add(meta);
                var wear = new VisualElement();
                wear.AddToClassList("mf-hub-wear");
                bool fresh = i.ReuseReliabilityDelta >= -1e-9;
                wear.EnableInClassList("mf-hub-wear--fresh", fresh);
                wear.Add(new MfIcon { kind = fresh ? "meets" : "marginal" });
                wear.Add(new Label(fresh
                    ? _text[i.Refurbished ? "ui.host.campaign.inventory.refurbished" : "ui.host.campaign.inventory.no_wear"]
                    : _text.Format("ui.host.campaign.inventory.wear", (-i.ReuseReliabilityDelta * 100.0).ToString("0.0", CultureInfo.InvariantCulture))));
                text.Add(wear);
                row.Add(icon);
                row.Add(text);
                host.Add(row);
            }
        }

        public void Milestones(CampaignView v)
        {
            Text("milestones-title", _text["ui.host.campaign.milestones"]);
            VisualElement host = _root.Q("milestones");
            host.Clear();
            string[] icons = { "orbit", "rocket", "users", "globe", "flag" };
            int k = 0;
            foreach ((string id, bool reached) in v.Milestones)
            {
                var m = new VisualElement();
                m.AddToClassList("mf-hub-milestone");
                m.EnableInClassList("mf-hub-milestone--reached", reached);
                var badge = new VisualElement();
                badge.AddToClassList("mf-hub-milestone__badge");
                badge.Add(new MfIcon { kind = reached ? icons[k % icons.Length] : "lock" });
                var name = new Label(_text["ui.host.codex.milestone." + id + ".title"]);
                name.AddToClassList("mf-hub-milestone__name");
                m.Add(badge);
                m.Add(name);
                host.Add(m);
                k++;
            }
        }

        public void Hall(CampaignView v)
        {
            Text("hall-title", _text["ui.host.campaign.hall"]);
            VisualElement host = _root.Q("patches");
            host.Clear();
            foreach (MissionPatchView p in v.Patches)
            {
                var m = new VisualElement();
                m.AddToClassList("mf-hub-mission");
                var patch = new HexPatch();
                patch.AddToClassList("mf-hub-mission__patch");
                bool gold = p.Grade == "S" || p.Grade == "A";
                Color rim = p.Outcome == "Failure" ? MfPalette.Fails : p.Outcome == "Partial" ? MfPalette.Marginal : gold ? MfPalette.Sunlight : MfPalette.Meets;
                patch.Set(p.Grade, rim, MfPalette.WithAlpha(MfPalette.Console, 0.95f), p.Outcome == "Failure" ? 5f : 3f, gold);
                patch.Label.AddToClassList("mf-hub-mission__patch-label");
                var status = new MfIcon { kind = p.Outcome == "Success" ? "meets" : p.Outcome == "Partial" ? "marginal" : "fails" };
                status.style.position = Position.Absolute;
                status.style.right = 0;
                status.style.top = 0;
                status.style.width = 24;
                status.style.height = 24;
                status.style.color = rim;
                patch.Add(status);
                var label = new Label(_text.Format("ui.host.campaign.hall.mission", p.Number, p.ContractId) + "\n" + _text["ui.host.campaign.hall.outcome." + p.Outcome]);
                label.AddToClassList("mf-hub-mission__label");
                m.Add(patch);
                m.Add(label);
                host.Add(m);
            }
        }

        private string Money(double m) => _text.Format("ui.host.campaign.unit.money", m.ToString("0.0", CultureInfo.InvariantCulture));

        private string Pct(double f) => _text.Format("ui.host.campaign.unit.percent", (f * 100.0).ToString("0.#", CultureInfo.InvariantCulture));

        private VisualElement Kpi(string value, string label, string modifier)
        {
            var k = new VisualElement();
            k.AddToClassList("mf-hub-kpi");
            if (modifier != null) foreach (string c in modifier.Split(' ')) k.AddToClassList(c);
            var v = new Label(value);
            v.AddToClassList("mf-hub-kpi__value");
            var l = new Label(label);
            l.AddToClassList("mf-hub-kpi__label");
            k.Add(v);
            k.Add(l);
            return k;
        }

        private static Label Fact(string text)
        {
            var l = new Label(text);
            l.AddToClassList("mf-hub-offer__fact");
            return l;
        }

        private static string Initials(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "?";
            return new string(name.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries).Take(3).Select(w => char.ToUpperInvariant(w[0])).ToArray());
        }

        private void Text(string name, string value)
        {
            Label l = _root.Q<Label>(name);
            if (l != null) l.text = value;
        }
    }
}
