using System.Linq;
using MissionForge.Core.Campaign;
using MissionForge.Core.Data;
using MissionForge.EndScreens.Sources;
using NUnit.Framework;

namespace MissionForge.EndScreens.Tests
{
    public sealed class CampaignSourceTests
    {
        private static CoreCampaignAdapter _adapter;
        private static CoreCampaignAdapter Adapter => _adapter ??= new CoreCampaignAdapter(EndTestData.Data.JsonByPath);

        private static FixtureCampaignSource Fixture() => new FixtureCampaignSource(Adapter, EndTestData.Fixture("Campaign", "campaign_midway"));

        [Test]
        public void MidCampaignFixture_MapsToTheHub()
        {
            CampaignView v = Fixture().Load();

            Assert.That(v.AgencyName, Is.EqualTo("Aurora Launch Collective"));
            Assert.That(v.Reputation, Is.EqualTo(34));
            Assert.That(v.KnowledgePoints, Is.EqualTo(15));
            Assert.That(v.CarriedBudgetM, Is.EqualTo(6.5).Within(1e-9));
            Assert.That(v.Insured, Is.True);
            Assert.That(v.SupplierDiscount, Is.EqualTo(0.034).Within(1e-9), "0.10 × 34 / 100 (Core)");
            Assert.That(v.Patches.Select(p => p.ContractId), Is.EqualTo(new[] { "C0", "C1", "C1", "C2" }));
            Assert.That(v.Milestones.Where(m => m.reached).Select(m => m.id), Is.EqualTo(new[] { "first_orbit", "first_recovery" }));
            Assert.That(v.IsRehearsal, Is.True);
        }

        [Test]
        public void Board_IsCoresOffer()
        {
            FixtureCampaignSource source = Fixture();
            CampaignView v = source.Load();

            Assert.That(v.Offers.Select(o => o.Id), Is.EqualTo(ContractsBoard.Offer(source.State, source.Seed)));
            Assert.That(v.Offers.Count, Is.EqualTo(3), "an even mission count offers three contracts");
            foreach (ContractOfferView o in v.Offers)
            {
                Assert.That(o.BudgetM, Is.GreaterThan(0), o.Id);
                Assert.That(o.Difficulty01, Is.InRange(0.0, 1.0), o.Id);
            }
        }

        [Test]
        public void TechTree_StatesFollowKpAndPrerequisites()
        {
            CampaignView v = Fixture().Load();
            TechNodeView Node(string id) => v.Tech.Single(n => n.Id == id);

            Assert.That(v.Tech.Count, Is.EqualTo(TechTree.Nodes.Count));
            Assert.That(Node("hot_staging").Purchased, Is.True);
            Assert.That(Node("methalox").Affordable && Node("methalox").PrerequisitesMet, Is.True);
            Assert.That(Node("terrain_relative").PrerequisitesMet, Is.False);
            Assert.That(Node("hiad").Affordable, Is.False);
            Assert.That(Node("methalox").CostKp, Is.EqualTo(CampaignConstants.MethaloxTechCostKp));
        }

        [Test]
        public void Inventory_WearAndRefurbishmentComeFromCore()
        {
            FixtureCampaignSource source = Fixture();
            CampaignView v = source.Load();
            GameCatalog catalog = CatalogLoader.Load(EndTestData.Data.JsonByPath, "en", lenient: true);
            InventoryItemView booster = v.Inventory.Single(i => i.ItemId == "inv_booster_1");
            InventoryItemView fairing = v.Inventory.Single(i => i.ItemId == "inv_fairing_1");

            Assert.That(booster.ReuseReliabilityDelta, Is.EqualTo(-2 * CampaignConstants.WearReliabilityPenalty).Within(1e-9), "two flights, not refurbished");
            Assert.That(booster.RefurbishCostM, Is.EqualTo(catalog.Part("eng_kerolox_workhorse").CostM * CampaignConstants.RefurbishmentCostFraction).Within(1e-9));
            Assert.That(booster.RefurbishDays, Is.EqualTo(CampaignConstants.RefurbishmentDays).Within(1e-9));
            Assert.That(fairing.ReuseReliabilityDelta, Is.EqualTo(0.0).Within(1e-9), "refurbished hardware has no wear penalty");
        }

        [Test]
        public void BuyingTech_GoesThroughCore()
        {
            FixtureCampaignSource source = Fixture();
            CampaignState after = Campaign.PurchaseTech(source.State, "methalox");
            CampaignView v = Adapter.Build(after, source.Seed, true);

            Assert.That(v.KnowledgePoints, Is.EqualTo(15 - CampaignConstants.MethaloxTechCostKp));
            Assert.That(v.Tech.Single(n => n.Id == "methalox").Purchased, Is.True);
            Assert.That(source.State.KnowledgePoints, Is.EqualTo(15), "the fixture state is not mutated");
        }
    }
}
