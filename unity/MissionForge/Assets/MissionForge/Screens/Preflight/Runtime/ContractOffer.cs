using System.Collections.Generic;
using MissionForge.App;
using MissionForge.Core.Campaign;

namespace MissionForge.Screens.Preflight
{
    /// <summary>
    /// Which contracts the Briefing introduces and the Contract Vote offers (T027 steps 3–4). No rules here: a locked
    /// contract comes from the host (lobby lock in <see cref="MissionContext.LockedContractId"/>, or <c>-mfContract</c> for
    /// demos), otherwise Core's <see cref="ContractsBoard.Offer"/> for a fresh agency (2–3 ids) with the session seed.
    /// The result is cached in <see cref="MissionContext.OfferedContractIds"/> so both screens show the same offer.
    /// </summary>
    public static class ContractOffer
    {
        public static IReadOnlyList<string> Resolve(out bool locked)
        {
            string fixedId = PreflightArgs.Value("-mfContract") ?? MissionContext.LockedContractId;
            locked = !string.IsNullOrEmpty(fixedId);
            if (locked) return new[] { fixedId };
            if (MissionContext.OfferedContractIds == null || MissionContext.OfferedContractIds.Count == 0)
                MissionContext.OfferedContractIds = ContractsBoard.Offer(CampaignState.New("MissionForge", "default", "site"), MissionContext.Seed);
            return MissionContext.OfferedContractIds;
        }
    }
}
