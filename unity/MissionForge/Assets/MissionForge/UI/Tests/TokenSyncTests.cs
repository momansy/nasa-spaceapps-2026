using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using MissionForge.Editor.DesignSystem;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace MissionForge.UI.Tests
{
    /// <summary>
    /// tokens.json is the single source of the design tokens. These tests fail when the generated USS, the motion
    /// classes or the C# palette drift from it (run MissionForge > Design System > Generate Token USS to fix the USS).
    /// </summary>
    public sealed class TokenSyncTests
    {
        private static string Json => File.ReadAllText(TokenUssGenerator.TokensJsonPath);

        private static Dictionary<string, string> ParseUssVariables(string uss)
        {
            var vars = new Dictionary<string, string>();
            foreach (Match m in Regex.Matches(uss, @"(--mf-[a-z0-9-]+)\s*:\s*([^;]+);"))
            {
                vars[m.Groups[1].Value] = m.Groups[2].Value.Trim();
            }
            return vars;
        }

        [Test]
        public void TokensUss_MatchesTokensJson_ValueForValue()
        {
            SortedDictionary<string, string> expected = TokenUssGenerator.Variables(Json);
            Dictionary<string, string> actual = ParseUssVariables(File.ReadAllText(TokenUssGenerator.TokensUssPath));

            foreach (KeyValuePair<string, string> e in expected)
            {
                Assert.IsTrue(actual.ContainsKey(e.Key), "Tokens.uss lacks " + e.Key);
                Assert.AreEqual(e.Value, actual[e.Key], "Tokens.uss disagrees with tokens.json for " + e.Key);
            }
            foreach (string key in actual.Keys)
            {
                Assert.IsTrue(expected.ContainsKey(key), "Tokens.uss defines " + key + " which tokens.json does not");
            }
        }

        [Test]
        public void GeneratedFiles_AreUpToDate()
        {
            Assert.AreEqual(TokenUssGenerator.BuildTokensUss(Json), File.ReadAllText(TokenUssGenerator.TokensUssPath));
            Assert.AreEqual(TokenUssGenerator.BuildMotionUss(Json), File.ReadAllText(TokenUssGenerator.MotionUssPath));
        }

        [Test]
        public void ThemeSheets_DoNotRedefineTokenVariables()
        {
            // Palette, type, spacing and radius live only in Tokens.uss; other sheets must reference them with var().
            SortedDictionary<string, string> tokens = TokenUssGenerator.Variables(Json);
            foreach (string path in new[] { "Assets/MissionForge/UI/Theme/MissionForgeTheme.uss", "Assets/MissionForge/UI/Theme/Screens.uss" })
            {
                // Only :root blocks define tokens; mode classes such as .mf-text-200 may rescale them on purpose.
                var rootBlocks = new System.Text.StringBuilder();
                foreach (Match block in Regex.Matches(File.ReadAllText(path), @":root\s*\{([^}]*)\}")) rootBlocks.Append(block.Groups[1].Value);
                foreach (string key in ParseUssVariables(rootBlocks.ToString()).Keys)
                {
                    Assert.IsFalse(tokens.ContainsKey(key), path + " redefines token " + key + " (fork of the theme)");
                }
            }
        }

        [Test]
        public void MfPalette_MatchesTokensJson()
        {
            JObject colours = (JObject)JObject.Parse(Json)["color"];
            void Check(string token, Color actual)
            {
                Color32 want = TokenUssGenerator.ParseHex((string)colours[token]["value"]);
                Assert.AreEqual(want, (Color32)actual, "MfPalette disagrees with tokens.json for " + token);
            }
            Check("space", MfPalette.Space);
            Check("console", MfPalette.Console);
            Check("ocean", MfPalette.Ocean);
            Check("ceramic", MfPalette.Ceramic);
            Check("signal", MfPalette.Signal);
            Check("sunlight", MfPalette.Sunlight);
            Check("muted", MfPalette.Muted);
            Check("meets", MfPalette.Meets);
            Check("marginal", MfPalette.Marginal);
            Check("fails", MfPalette.Fails);
            Check("periwinkle", MfPalette.Periwinkle);
            Check("rose", MfPalette.Rose);
        }

        [Test]
        public void EveryTokenLeaf_IsTaggedGameValue()
        {
            JObject root = JObject.Parse(Json);
            foreach (string section in new[] { "color", "color_alpha", "font", "type", "space", "radius", "elevation", "motion", "dataviz", "icon" })
            {
                foreach (JProperty p in ((JObject)root[section]).Properties())
                {
                    Assert.AreEqual("game_value", (string)p.Value["value_type"], section + "." + p.Name + " is not tagged game_value");
                }
            }
        }

        [Test]
        public void PlexSans_DigitsAreTabular()
        {
            // VISUAL_TARGET 3.1: numerals must be tabular. Plex Sans' default figures share one advance (600 units),
            // so no renamed derivative is needed. Checked at the glyph level in the shipped font files.
            foreach (string file in new[] { "ibm-plex-sans-400.ttf", "ibm-plex-sans-500.ttf", "ibm-plex-sans-600.ttf" })
            {
                byte[] font = File.ReadAllBytes("Assets/MissionForge/UI/Fonts/" + file);
                var widths = new HashSet<int>(TrueTypeMetrics.DigitAdvances(font));
                Assert.AreEqual(1, widths.Count, file + " digits have different advances: " + string.Join(",", widths));
            }
        }
    }
}
