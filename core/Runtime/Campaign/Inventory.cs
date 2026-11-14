#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using MissionForge.Core.Build;
using MissionForge.Core.Data;

namespace MissionForge.Core.Campaign
{
    /// <summary>Reusable recovered hardware, with pure host-controlled inventory transitions.</summary>
    public sealed class Inventory
    {
        private readonly CampaignState _state;

        /// <summary>Creates an inventory view of an immutable agency state.</summary>
        public Inventory(CampaignState state) { _state = state ?? throw new ArgumentNullException(nameof(state)); }

        /// <summary>Items recoverable between missions.</summary>
        public IReadOnlyList<InventoryItem> Items => _state.InventoryItems;

        /// <summary>
        /// Applies the price refund and a per-flight reliability loss to the matching chosen
        /// part slots. Both operations are non-destructive and once-only for a given item ID.
        /// </summary>
        public BuildState ApplyReuse(BuildState build, GameCatalog catalog, string itemId)
        {
            if (build == null || catalog == null) throw new ArgumentNullException(
                build == null ? nameof(build) : nameof(catalog));
            InventoryItem item = Find(itemId);
            string flag = "campaign_reused:" + item.ItemId;
            if (build.HasFlag(flag)) return build;
            var slots = build.Choices.Where(c => c.Value == item.PartId).Select(c => c.Key).ToArray();
            if (slots.Length == 0) throw new InvalidOperationException(
                "Recovered hardware is not selected in this build: " + item.PartId);
            double costM = catalog.Part(item.PartId).CostM;
            var result = build.WithLedger(new LedgerEntry(LedgerKind.Budget,
                "campaign_reuse:" + item.ItemId,
                -costM * CampaignConstants.ReuseRefundFraction, 0));
            // A refurbished item resets accumulated wear, otherwise flights increase its penalty.
            double penalty = item.Refurbished ? 0 :
                item.Flights * CampaignConstants.WearReliabilityPenalty;
            foreach (string slot in slots)
            {
                PartCondition old = result.Condition(slot);
                result = result.WithCondition(slot, old.With(
                    reliabilityDelta: old.ReliabilityDelta - penalty));
            }
            return result.WithFlag(flag);
        }

        /// <summary>Charges refurbishment (cost in $M, days) to the build once, without changing hardware identity.</summary>
        public BuildState ApplyRefurbishment(BuildState build, GameCatalog catalog, string itemId)
        {
            if (build == null || catalog == null) throw new ArgumentNullException(
                build == null ? nameof(build) : nameof(catalog));
            var item = Find(itemId);
            string flag = "campaign_refurbished:" + item.ItemId;
            if (build.HasFlag(flag)) return build;
            double costM = catalog.Part(item.PartId).CostM * CampaignConstants.RefurbishmentCostFraction;
            return build.WithLedger(new LedgerEntry(LedgerKind.Budget, flag, costM,
                CampaignConstants.RefurbishmentDays)).WithFlag(flag);
        }

        /// <summary>Returns new state with an item refurbished; call only after applying its build cost.</summary>
        public CampaignState MarkRefurbished(string itemId)
        {
            var item = Find(itemId);
            var updated = _state.InventoryItems.Select(x => x.ItemId == item.ItemId ?
                x.With(refurbished: true) : x).ToArray();
            return _state.With(inventoryItems: updated);
        }

        /// <summary>Consumes a recovered item when installed for a mission; the host later records its recovery.</summary>
        public CampaignState Consume(string itemId)
        {
            Find(itemId);
            return _state.With(inventoryItems: _state.InventoryItems.Where(i => i.ItemId != itemId));
        }

        private InventoryItem Find(string itemId)
        {
            var item = _state.InventoryItems.FirstOrDefault(i => i.ItemId == itemId);
            return item ?? throw new KeyNotFoundException("Unknown reusable inventory item: " + itemId);
        }
    }
}
