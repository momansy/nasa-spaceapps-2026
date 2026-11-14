using System;
using System.Collections.Generic;
using System.IO;
using MissionForge.Core.Data;
using Newtonsoft.Json.Linq;

namespace MissionForge.Core.Tests.Data
{
    /// <summary>
    /// Test data for the loader and the Appendix A walkthrough. Reads the real <c>data/</c> files that exist
    /// (launch sites, first-stage engines, contracts, roles, boosts, strings) and fills every part category that
    /// is not written yet (task T003) with schema-format JSON copied from the design tables of GAME_DESIGN.md
    /// section 7. A real file always wins over the fixture, so the tests check the real data as it arrives.
    /// Only test code reads files; Core itself never does.
    /// </summary>
    public static class DesignFixture
    {
        /// <summary>The repository <c>data/</c> folder, found by walking up from the test binaries.</summary>
        public static string DataDir
        {
            get
            {
                var dir = new DirectoryInfo(AppContext.BaseDirectory);
                while (dir != null)
                {
                    var candidate = Path.Combine(dir.FullName, "data", "contracts.json");
                    if (File.Exists(candidate)) return Path.Combine(dir.FullName, "data");
                    dir = dir.Parent;
                }
                throw new InvalidOperationException("data/contracts.json not found above " + AppContext.BaseDirectory);
            }
        }

        /// <summary>Every real data file (relative path → text) plus the fixture part files for missing categories.</summary>
        public static Dictionary<string, string> Files()
        {
            var files = RealFiles();
            foreach (var kv in FixtureParts())
                if (!files.ContainsKey(kv.Key)) files[kv.Key] = kv.Value;
            return files;
        }

        /// <summary>The real data files only: <c>*.json</c> at the top level, <c>parts/</c> and <c>strings/</c>.</summary>
        public static Dictionary<string, string> RealFiles()
        {
            var root = DataDir;
            var files = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var f in Directory.GetFiles(root, "*.json")) files[Path.GetFileName(f)] = File.ReadAllText(f);
            foreach (var sub in new[] { "parts", "strings" })
            {
                var d = Path.Combine(root, sub);
                if (!Directory.Exists(d)) continue;
                foreach (var f in Directory.GetFiles(d, "*.json")) files[sub + "/" + Path.GetFileName(f)] = File.ReadAllText(f);
            }
            return files;
        }

        /// <summary>The loaded catalog for the walkthrough (strict: every reference must resolve).</summary>
        public static GameCatalog Catalog() => CatalogLoader.Load(Files());

        // ------------------------------------------------------------------ fixture builders

        private static JObject Stats(params (string key, object value)[] kv)
        {
            var o = new JObject();
            foreach (var (k, v) in kv) o[k] = JToken.FromObject(v);
            return o;
        }

        private static JObject Game(double? cost = null, double? lead = null, double? integ = null, double? rel = null, string? maturity = null)
        {
            var o = new JObject();
            if (cost.HasValue) o["cost_M"] = cost.Value;
            if (lead.HasValue) o["lead_days"] = lead.Value;
            if (integ.HasValue) o["integ_days"] = integ.Value;
            if (rel.HasValue) o["reliability"] = rel.Value;
            if (maturity != null) o["maturity"] = maturity;
            return o;
        }

        private static JObject Mod(string target, string op, double value, string scope) =>
            new JObject { ["target"] = target, ["op"] = op, ["value"] = value, ["scope"] = scope };

        private static JObject Part(string id, string category, JObject stats, JObject game,
            JArray? modifiers = null, JArray? rules = null, string[]? contracts = null)
        {
            var o = new JObject
            {
                ["id"] = id,
                ["category"] = category,
                ["name_key"] = "part." + id + ".name",
                ["strengths"] = new JArray(),
                ["drawbacks"] = new JArray(),
                ["stats"] = stats,
                ["game"] = game,
                ["value_types"] = new JObject { ["stats"] = "real_world_approximate", ["game"] = "game_value" },
            };
            if (modifiers != null) o["modifiers"] = modifiers;
            if (rules != null) o["rules"] = rules;
            if (contracts != null) o["contracts"] = new JArray(contracts);
            return o;
        }

        private static string PartFile(string category, JObject? categoryParams, params JObject[] parts) =>
            new JObject
            {
                ["category"] = category,
                ["name_key"] = "category." + category + ".name",
                ["category_params"] = categoryParams,
                ["parts"] = new JArray(parts),
            }.ToString();

        private static JArray A(params JObject[] items) => new JArray(items);

        private static JObject Flag(string flag) => new JObject { ["kind"] = "flag", ["flag"] = flag };

        /// <summary>
        /// Part files for the categories of design section 7 that are not in <c>data/parts/</c> yet. Numbers are the
        /// design-table values (units in the key names, like the real files); cells the design leaves empty are left out.
        /// </summary>
        public static Dictionary<string, string> FixtureParts()
        {
            var f = new Dictionary<string, string>(StringComparer.Ordinal);
            const string ins = "instrument";
            f["parts/instrument.json"] = PartFile(ins, null,                                                   // 7.2.1
                Part("inst_wide_field_optical_camera", ins, Stats(("mass_kg", 8), ("power_W", 15), ("data_GB_per_day", 4)), Game(cost: 3)),
                Part("inst_multispectral_imager", ins, Stats(("mass_kg", 15), ("power_W", 30), ("data_GB_per_day", 10)), Game(cost: 8)),
                Part("inst_thermal_infrared_camera", ins, Stats(("mass_kg", 18), ("power_W", 40), ("data_GB_per_day", 6)), Game(cost: 10)),
                Part("inst_synthetic_aperture_radar", ins, Stats(("mass_kg", 45), ("power_W", 300), ("data_GB_per_day", 25)), Game(cost: 20)));
            const string sp = "satellite_power";
            f["parts/satellite_power.json"] = PartFile(sp, null,
                Part("satpwr_body_mounted_solar_cells", sp, Stats(("mass_kg", 3), ("generation_avg_W", 40)), Game()),
                Part("satpwr_deployable_solar_wings", sp, Stats(("mass_kg", 9), ("generation_avg_W", 150)), Game()),
                Part("satpwr_large_deployable_array", sp, Stats(("mass_kg", 20), ("generation_avg_W", 400)), Game()));
            const string ac = "attitude_control";
            f["parts/attitude_control.json"] = PartFile(ac, null,
                Part("adcs_magnetorquers_only", ac, Stats(("pointing_accuracy_deg", 5), ("mass_kg", 1)), Game()),
                Part("adcs_reaction_wheels", ac, Stats(("pointing_accuracy_deg", 0.1), ("mass_kg", 6)), Game()),
                Part("adcs_reaction_wheels_star_tracker", ac, Stats(("pointing_accuracy_deg", 0.01), ("mass_kg", 9)), Game()));
            const string fa = "fairing";                                                                     // 7.5
            f["parts/fairing.json"] = PartFile(fa, null,
                Part("fairing_small", fa, Stats(("diameter_m", 1.5), ("mass_t", 0.4)), Game(cost: 2)),
                Part("fairing_standard", fa, Stats(("diameter_m", 4), ("mass_t", 1.5)), Game(cost: 5)),
                Part("fairing_large", fa, Stats(("diameter_m", 5.4), ("mass_t", 2.4)), Game(cost: 9)),
                Part("fairing_reusable_large", fa, Stats(("diameter_m", 5.4), ("mass_t", 2.6), ("reusable", true)), Game(cost: 14)));
            const string ec = "engine_count";                                                                // 7.6
            f["parts/engine_count.json"] = PartFile(ec, null,
                Part("engcount_first_1", ec, Stats(("stage", "first"), ("engine_count", 1), ("engine_out_capability", "no")), Game()),
                Part("engcount_first_3", ec, Stats(("stage", "first"), ("engine_count", 3), ("engine_out_capability", "partial")), Game(integ: 3),
                    A(Mod("reliability", "add", -0.003, "stage"))),
                Part("engcount_first_5", ec, Stats(("stage", "first"), ("engine_count", 5), ("engine_out_capability", "usually")), Game(integ: 5),
                    A(Mod("reliability", "add", -0.006, "stage"))),
                Part("engcount_first_9", ec, Stats(("stage", "first"), ("engine_count", 9), ("engine_out_capability", "yes")), Game(integ: 8),
                    A(Mod("reliability", "add", -0.010, "stage"))),
                Part("engcount_upper_1", ec, Stats(("stage", "upper"), ("engine_count", 1), ("engine_out_capability", "no")), Game()),
                Part("engcount_upper_2", ec, Stats(("stage", "upper"), ("engine_count", 2), ("engine_out_capability", "partial")), Game()));
            const string ue = "upper_stage_engine";                                                          // 7.8
            f["parts/upper_stage_engine.json"] = PartFile(ue, null,
                Part("eng_hydrolox_vacuum", ue, Stats(("propellant", "LH2_LOX"), ("thrust_vac_kN", 110), ("isp_vac_s", 460), ("mass_t", 0.30), ("restarts", 15)),
                    Game(cost: 10, rel: 0.993, maturity: "proven")),
                Part("eng_kerolox_vacuum", ue, Stats(("propellant", "RP1_LOX"), ("thrust_vac_kN", 980), ("isp_vac_s", 348), ("mass_t", 0.60), ("restarts", 4)),
                    Game(cost: 3, rel: 0.985, maturity: "proven")),
                Part("eng_methalox_vacuum", ue, Stats(("propellant", "CH4_LOX"), ("thrust_vac_kN", 2000), ("isp_vac_s", 375), ("mass_t", 1.6), ("restarts", 6)),
                    Game(cost: 4, rel: 0.955, maturity: "new")),
                Part("eng_hypergolic_storable", ue, Stats(("propellant", "A50_N2O4"), ("thrust_vac_kN", 90), ("isp_vac_s", 315), ("mass_t", 0.30), ("restarts", 50)),
                    Game(cost: 6, rel: 0.996, maturity: "proven"), A(Mod("cost_M", "add", 2, "this_part"), Mod("integ_days", "add", 3, "this_part"))),
                Part("eng_solid_kick_motor", ue, Stats(("propellant", "SOLID"), ("thrust_vac_kN", 68), ("isp_vac_s", 290), ("mass_t", 0.12), ("fixed_propellant_t", 2), ("restarts", 0)),
                    Game(cost: 2, rel: 0.992, maturity: "proven")));
            const string ts = "tank_size";                                                                   // 7.9
            var ratios = new JObject
            {
                ["structural_ratio_by_propellant"] = new JObject { ["RP1_LOX"] = 0.05, ["CH4_LOX"] = 0.06, ["A50_N2O4"] = 0.06, ["LH2_LOX"] = 0.10 },
                ["value_type"] = "game_value",
            };
            f["parts/tank_size.json"] = PartFile(ts, ratios,
                Part("tank_xs", ts, Stats(("size", "XS"), ("first_stage_propellant_t", 12), ("upper_stage_propellant_t", 2.5)), Game(), contracts: new[] { "C0", "C1" }),
                Part("tank_s", ts, Stats(("size", "S"), ("first_stage_propellant_t", 120), ("upper_stage_propellant_t", 25)), Game(), contracts: new[] { "C0", "C1", "C2", "C8" }),
                Part("tank_m", ts, Stats(("size", "M"), ("first_stage_propellant_t", 280), ("upper_stage_propellant_t", 60)), Game(), contracts: new[] { "C1", "C2", "C3", "C4", "C5", "C8" }),
                Part("tank_l", ts, Stats(("size", "L"), ("first_stage_propellant_t", 420), ("upper_stage_propellant_t", 110)), Game(), contracts: new[] { "C3", "C4", "C5", "C6", "C7", "C8" }),
                Part("tank_xl", ts, Stats(("size", "XL"), ("first_stage_propellant_t", 1000), ("upper_stage_propellant_t", 250)), Game(), contracts: new[] { "C5", "C6", "C7" }));
            const string sm = "structural_material";                                                         // 7.10
            f["parts/structural_material.json"] = PartFile(sm, null,
                Part("mat_aluminum_2219", sm, Stats(), Game(integ: 0), A(Mod("dry_mass_t", "mul", 1.0, "vehicle"), Mod("cost_M", "mul", 1.0, "vehicle"))),
                Part("mat_aluminum_lithium_2195", sm, Stats(), Game(integ: 4), A(Mod("dry_mass_t", "mul", 0.88, "vehicle"), Mod("cost_M", "mul", 1.4, "vehicle"))),
                Part("mat_carbon_composite", sm, Stats(), Game(integ: 12), A(Mod("dry_mass_t", "mul", 0.75, "vehicle"), Mod("cost_M", "mul", 2.2, "vehicle"))),
                Part("mat_stainless_steel", sm, Stats(), Game(integ: -5), A(Mod("dry_mass_t", "mul", 1.25, "vehicle"), Mod("cost_M", "mul", 0.6, "vehicle"))));
            const string sb = "strap_on_booster";                                                            // 7.11
            f["parts/strap_on_booster.json"] = PartFile(sb, null,
                Part("strap_none", sb, Stats(("booster_count", 0)), Game(cost: 0)),
                Part("strap_2_small_solid", sb, Stats(("booster_count", 2), ("thrust_sl_each_kN", 1600), ("burn_time_s", 90), ("mass_each_t", 49), ("cost_each_M", 6)), Game()),
                Part("strap_4_small_solid", sb, Stats(("booster_count", 4), ("thrust_sl_each_kN", 1600), ("burn_time_s", 90), ("mass_each_t", 49), ("cost_each_M", 6)), Game()),
                Part("strap_2_heavy_solid", sb, Stats(("booster_count", 2), ("thrust_sl_each_kN", 12500), ("burn_time_s", 124), ("mass_each_t", 590), ("cost_each_M", 40)), Game()),
                Part("strap_2_liquid_side", sb, Stats(("booster_count", 2), ("mirrors_first_stage", true), ("cost_first_stage_mult", 2)), Game(integ: 15),
                    A(Mod("reliability", "add", -0.01, "strap_on_boosters"))));
            const string ss = "separation_system";                                                           // 7.12
            f["parts/separation_system.json"] = PartFile(ss, null,
                Part("sep_pyro_bolts_springs", ss, Stats(("mass_t", 0.2)), Game(rel: 0.995)),
                Part("sep_pneumatic_pushers", ss, Stats(("mass_t", 0.3)), Game(cost: 1.5, rel: 0.993)),
                Part("sep_hot_staging", ss, Stats(("mass_t", 0.6)), Game(rel: 0.985), A(Mod("delta_v_m_s", "add_fraction", 0.015, "vehicle"))));
            const string av = "avionics";                                                                    // 7.13
            f["parts/avionics.json"] = PartFile(av, null,
                Part("avi_commercial_single", av, Stats(("mass_kg", 10), ("computer_count", 1)), Game(cost: 1, rel: 0.97)),
                Part("avi_triple_redundant_commercial", av, Stats(("mass_kg", 30), ("computer_count", 3)), Game(cost: 3, rel: 0.992)),
                Part("avi_radiation_hardened", av, Stats(("mass_kg", 15), ("computer_count", 1), ("radiation_hardened", true)), Game(cost: 8, rel: 0.995)),
                Part("avi_rad_hard_backup", av, Stats(("mass_kg", 30), ("computer_count", 2), ("radiation_hardened", true)), Game(cost: 12, rel: 0.998)));
            const string nv = "navigation_sensor";                                                           // 7.14
            f["parts/navigation_sensor.json"] = PartFile(nv, null,
                Part("nav_imu_only", nv, Stats(("insertion_error_km", 25)), Game(cost: 0.5)),
                Part("nav_imu_gnss", nv, Stats(("insertion_error_km", 3)), Game(cost: 1)),
                Part("nav_imu_gnss_star_tracker", nv, Stats(("insertion_error_km", 1), ("precise_attitude", true)), Game(cost: 3)),
                Part("nav_terrain_relative", nv, Stats(), Game(cost: 6), contracts: new[] { "C7", "C8" }));
            const string ae = "aero_control";                                                                // 7.15
            f["parts/aero_control.json"] = PartFile(ae, null,
                Part("aero_gimbal_only", ae, Stats(), Game()),
                Part("aero_fins", ae, Stats(), Game(), rules: A(Flag("fins"))),
                Part("aero_grid_fins", ae, Stats(), Game(cost: 2)));
            const string rc = "rcs";
            f["parts/rcs.json"] = PartFile(rc, null,
                Part("rcs_cold_gas", rc, Stats(("isp_s", 70)), Game()),
                Part("rcs_monopropellant_hydrazine", rc, Stats(("isp_s", 225)), Game()),
                Part("rcs_bipropellant", rc, Stats(("isp_s", 290)), Game()));
            const string ps = "power_system";                                                                // 7.16
            f["parts/power_system.json"] = PartFile(ps, null,
                Part("pwr_primary_batteries", ps, Stats(), Game()),
                Part("pwr_liion_body_solar", ps, Stats(), Game()),
                Part("pwr_deployable_solar_liion", ps, Stats(), Game()),
                Part("pwr_fuel_cells", ps, Stats(), Game()),
                Part("pwr_rtg", ps, Stats(), Game(), A(Mod("schedule_days", "add", 60, "this_part")), contracts: new[] { "C7" }));
            const string cm = "communications";                                                              // 7.17
            f["parts/communications.json"] = PartFile(cm, null,
                Part("comm_uhf", cm, Stats(("data_rate_GB_per_pass", 0.01), ("pointing", "omni")), Game()),
                Part("comm_s_band", cm, Stats(("data_rate_GB_per_pass", 0.2), ("pointing", "omni_wide")), Game()),
                Part("comm_x_band", cm, Stats(("data_rate_GB_per_pass", 2), ("pointing", "precise")), Game()),
                Part("comm_ka_band", cm, Stats(("data_rate_GB_per_pass", 8), ("pointing", "very_precise")), Game()),
                Part("comm_relay_network", cm, Stats(("continuous_coverage", true)), Game(cost: 3)),
                Part("comm_laser", cm, Stats(("data_rate_GB_per_pass", 30), ("pointing", "extreme")), Game()));
            const string br = "booster_recovery";                                                            // 7.18
            f["parts/booster_recovery.json"] = PartFile(br, null,
                Part("brec_expendable", br, Stats(), Game()),
                Part("brec_parachute_splashdown", br, Stats(), Game(),
                    A(Mod("delta_v_m_s", "add_fraction", -0.02, "first_stage"), Mod("cost_refund_fraction", "add", 0.20, "first_stage"))),
                Part("brec_propulsive_rtls", br, Stats(), Game(),
                    A(Mod("delta_v_m_s", "add_fraction", -0.15, "first_stage"), Mod("cost_refund_fraction", "add", 0.60, "first_stage")),
                    A(new JObject { ["kind"] = "requires_part", ["part"] = "aero_grid_fins" })),
                Part("brec_propulsive_drone_ship", br, Stats(), Game(),
                    A(Mod("delta_v_m_s", "add_fraction", -0.08, "first_stage"), Mod("cost_refund_fraction", "add", 0.55, "first_stage"), Mod("cost_M", "add", 1, "mission"))));
            const string ma = "mission_assurance";                                                           // 7.20
            f["parts/mission_assurance.json"] = PartFile(ma, null,
                Part("assur_faster_cheaper", ma, Stats(), Game(),
                    A(Mod("cost_M", "add_fraction", -0.15, "mission"), Mod("schedule_days", "add_fraction", -0.10, "mission"), Mod("uncertainty_band", "mul", 1.5, "all_parts"))),
                Part("assur_standard", ma, Stats(), Game()),
                Part("assur_class_a", ma, Stats(), Game(),
                    A(Mod("cost_M", "add_fraction", 0.20, "mission"), Mod("schedule_days", "add_fraction", 0.15, "mission"),
                      Mod("uncertainty_band", "mul", 0.5, "all_parts"), Mod("reliability", "add", 0.01, "all_parts"))));
            return f;
        }
    }
}
