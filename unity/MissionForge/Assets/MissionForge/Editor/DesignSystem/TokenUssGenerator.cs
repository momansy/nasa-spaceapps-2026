using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace MissionForge.Editor.DesignSystem
{
    /// <summary>
    /// Writes the USS side of the design tokens from <c>UI/Theme/tokens.json</c> (the single source):
    /// <c>UI/Theme/Tokens.uss</c> (custom properties) and <c>UI/Motion/Motion.uss</c> (transition classes).
    /// The EditMode test <c>TokenSyncTests</c> regenerates both in memory and fails if the files on disk differ.
    /// All values are game_value art choices (orchestration/VISUAL_TARGET.md 3.1).
    /// </summary>
    public static class TokenUssGenerator
    {
        public const string TokensJsonPath = "Assets/MissionForge/UI/Theme/tokens.json";
        public const string TokensUssPath = "Assets/MissionForge/UI/Theme/Tokens.uss";
        public const string MotionUssPath = "Assets/MissionForge/UI/Motion/Motion.uss";

        /// <summary>Motion tokens that become transition classes (stagger and reduced are handled separately).</summary>
        private static readonly string[] TransitionTokens = { "micro", "state", "enter", "exit", "screen", "count", "pulse", "celebrate" };

        [MenuItem("MissionForge/Design System/Generate Token USS")]
        public static void Generate()
        {
            string json = File.ReadAllText(TokensJsonPath);
            Write(TokensUssPath, BuildTokensUss(json));
            Write(MotionUssPath, BuildMotionUss(json));
            AssetDatabase.Refresh();
            Debug.Log("[MissionForge] Token USS generated from " + TokensJsonPath);
        }

        private static void Write(string path, string text)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            if (File.Exists(path) && File.ReadAllText(path) == text) return;
            File.WriteAllText(path, text);
        }

        /// <summary>Every custom property the token file defines, name (with leading --) to USS literal.</summary>
        public static SortedDictionary<string, string> Variables(string json)
        {
            JObject root = JObject.Parse(json);
            var vars = new SortedDictionary<string, string>(StringComparer.Ordinal);
            var colours = new Dictionary<string, Color32>();

            foreach (JProperty p in ((JObject)root["color"]).Properties())
            {
                string hex = (string)p.Value["value"];
                vars["--mf-" + p.Name] = hex.ToUpperInvariant();
                colours[p.Name] = ParseHex(hex);
            }
            foreach (JProperty p in ((JObject)root["color_alpha"]).Properties())
            {
                Color32 c = colours[(string)p.Value["base"]];
                double a = (double)p.Value["alpha"];
                vars["--mf-" + p.Name] = "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + a.ToString("0.00", CultureInfo.InvariantCulture) + ")";
            }
            foreach (JProperty p in ((JObject)root["font"]).Properties())
            {
                vars["--mf-font-" + p.Name] = "url(\"../Fonts/" + (string)p.Value["file"] + "\")";
            }
            foreach (JProperty p in ((JObject)root["type"]).Properties())
            {
                if (p.Value["size_px"] == null) continue;
                vars["--mf-fs-" + p.Name] = Px(p.Value["size_px"]);
            }
            foreach (JProperty p in ((JObject)root["space"]).Properties())
            {
                vars["--mf-sp-" + p.Name] = Px(p.Value["value_px"]);
            }
            foreach (JProperty p in ((JObject)root["radius"]).Properties())
            {
                vars["--mf-radius-" + p.Name] = Px(p.Value["value_px"]);
            }
            foreach (JProperty p in ((JObject)root["motion"]).Properties())
            {
                if (p.Value["ms"] != null) vars["--mf-dur-" + p.Name] = (int)p.Value["ms"] + "ms";
            }
            JObject viz = (JObject)root["dataviz"];
            vars["--mf-bar-height"] = Px(viz["bar_height_px"]["value"]);
            vars["--mf-bar-radius"] = Px(viz["bar_radius_px"]["value"]);
            vars["--mf-gantt-row"] = Px(viz["gantt_row_px"]["value"]);
            vars["--mf-gantt-radius"] = Px(viz["gantt_radius_px"]["value"]);
            return vars;
        }

        public static string BuildTokensUss(string json)
        {
            var sb = new StringBuilder();
            sb.Append("/* GENERATED from tokens.json by MissionForge > Design System > Generate Token USS. Do not edit by hand.\n");
            sb.Append("   Every value is a game_value art choice (orchestration/VISUAL_TARGET.md 3.1). TokenSyncTests checks this file.\n");
            sb.Append("   UI Toolkit has no line-height or calc(): line heights in tokens.json serve the React client; USS uses the\n");
            sb.Append("   faces' natural line gap. var() cannot appear inside rgba(), so translucent colours are separate tokens. */\n");
            sb.Append(":root {\n");
            foreach (KeyValuePair<string, string> v in Variables(json)) sb.Append("    ").Append(v.Key).Append(": ").Append(v.Value).Append(";\n");
            sb.Append("}\n");
            return sb.ToString();
        }

        public static string BuildMotionUss(string json)
        {
            JObject motion = (JObject)JObject.Parse(json)["motion"];
            var sb = new StringBuilder();
            sb.Append("/* GENERATED from tokens.json (motion) by MissionForge > Design System > Generate Token USS. Do not edit by hand.\n");
            sb.Append("   Add .mf-motion-<token> next to a transition-property list. Reduced motion (.mf-reduced-motion on the panel root)\n");
            sb.Append("   turns every movement into an opacity fade of <= 150 ms: only opacity transitions, the rest jumps. */\n");
            foreach (string name in TransitionTokens)
            {
                JToken t = motion[name];
                sb.Append(".mf-motion-").Append(name).Append(" { transition-duration: ").Append((int)t["ms"]).Append("ms; transition-timing-function: ")
                  .Append(UssCurve((string)t["curve"])).Append("; }\n");
            }
            JToken reduced = motion["reduced"];
            sb.Append(".mf-reduced-motion .mf-motion, .mf-reduced-motion .mf-btn, .mf-reduced-motion .mf-chip, .mf-reduced-motion .mf-card,\n");
            sb.Append(".mf-reduced-motion .mf-screen, .mf-reduced-motion .mf-seat, .mf-reduced-motion .mf-toast, .mf-reduced-motion .mf-segmented__item,\n");
            foreach (string name in TransitionTokens) sb.Append(".mf-reduced-motion .mf-motion-").Append(name).Append(name == TransitionTokens[TransitionTokens.Length - 1] ? " " : ",\n");
            sb.Append("{\n    transition-property: opacity;\n    transition-duration: ").Append((int)reduced["ms"]).Append("ms;\n    transition-timing-function: ")
              .Append((string)reduced["curve"]).Append(";\n}\n");
            sb.Append("/* Reduced motion never moves or scales: hover lift, press scale and enter offsets are cancelled. */\n");
            sb.Append(".mf-reduced-motion .mf-btn:hover, .mf-reduced-motion .mf-btn:active, .mf-reduced-motion .mf-card:hover,\n");
            sb.Append(".mf-reduced-motion .mf-enter, .mf-reduced-motion .mf-seat { translate: 0 0; scale: 1 1; }\n");
            return sb.ToString();
        }

        /// <summary>
        /// USS easing has no quartic curve and no tunable back overshoot, so two tokens map to the closest USS curve:
        /// ease-out-quart (count-ups) becomes ease-out-cubic (closest USS curve: at most 0.105 from the quartic, mean 0.050;
        /// ease-out-circ is 0.130 / 0.047 with a vertical start, expo 0.168 / 0.057), and ease-out-back (celebrate, at most
        /// 6 % overshoot) becomes ease-out-cubic because USS ease-out-back overshoots about 10 %. C# keeps the exact curves: MfMotion.CountUp (quartic) and
        /// MfMotion.Celebrate (back, 6 % overshoot). The React client reads the tokens as written.
        /// </summary>
        public static string UssCurve(string curve) =>
            curve == "ease-out-quart" || curve == "ease-out-back" ? "ease-out-cubic" : curve;

        private static string Px(JToken t) => ((double)t).ToString("0.##", CultureInfo.InvariantCulture) + "px";

        public static Color32 ParseHex(string hex)
        {
            if (!ColorUtility.TryParseHtmlString(hex, out Color c)) throw new FormatException("Bad colour token " + hex);
            return c;
        }
    }
}
