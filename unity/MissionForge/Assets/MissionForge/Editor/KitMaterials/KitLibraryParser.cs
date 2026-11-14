using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>
    /// Reads and validates assets/blender/materials/library.json (version 1, contract in the T032 brief).
    /// Every problem becomes an error or warning in the <see cref="ImportReport"/>; nothing is thrown for
    /// bad input. Returns null only when the file cannot be used at all.
    /// </summary>
    public static class KitLibraryParser
    {
        public const int SupportedVersion = 1;
        public const string GameValue = "game_value";

        private static readonly Regex IdPattern = new Regex("^[A-Za-z0-9_-]+$");
        private static readonly Regex HexPattern = new Regex("^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$");

        public static KitLibraryData Parse(string libraryJsonPath, ImportReport report)
        {
            if (string.IsNullOrEmpty(libraryJsonPath) || !File.Exists(libraryJsonPath))
            {
                report.Error("library.json not found: " + libraryJsonPath);
                return null;
            }

            JObject root;
            try
            {
                root = JObject.Parse(File.ReadAllText(libraryJsonPath));
            }
            catch (JsonException e)
            {
                report.Error("library.json is not valid JSON: " + e.Message);
                return null;
            }

            JToken version = root["version"];
            if (version == null || version.Type != JTokenType.Integer || version.Value<int>() != SupportedVersion)
            {
                report.Error("library.json: \"version\" must be " + SupportedVersion + " (got " + (version?.ToString() ?? "nothing") + ").");
                return null;
            }

            if (!(root["materials"] is JObject materials))
            {
                report.Error("library.json: \"materials\" object is missing.");
                return null;
            }

            var data = new KitLibraryData(Path.GetDirectoryName(Path.GetFullPath(libraryJsonPath)));
            JObject trimTextures = (root["trim"] as JObject)?["textures"] as JObject;
            JObject decalTextures = (root["decals"] as JObject)?["textures"] as JObject;

            foreach (JProperty property in materials.Properties())
            {
                KitSlotSpec slot = ParseSlot(property, data.RootDirectory, trimTextures, decalTextures, report);
                if (slot != null) data.Slots.Add(slot);
            }

            if (root["parts"] is JObject parts)
            {
                foreach (JProperty property in parts.Properties())
                {
                    KitPartSpec part = ParsePart(property, data.RootDirectory, report);
                    if (part != null) data.Parts.Add(part);
                }
            }
            else if (root["parts"] != null)
            {
                report.Error("library.json: \"parts\" must be an object.");
            }
            return data;
        }

        private static KitSlotSpec ParseSlot(JProperty property, string rootDir, JObject trimTextures, JObject decalTextures, ImportReport report)
        {
            string slotName = property.Name;
            string at = "materials." + slotName;
            if (!IdPattern.IsMatch(slotName))
            {
                report.Error(at + ": slot name must match " + IdPattern + ".");
                return null;
            }
            if (!(property.Value is JObject entry))
            {
                report.Error(at + ": entry must be an object.");
                return null;
            }

            var slot = new KitSlotSpec(slotName);
            // trim and decal may keep their maps in the shared "trim" / "decals" sections.
            JObject fallback = slotName == KitSlotSpec.TrimSlot ? trimTextures
                             : slotName == KitSlotSpec.DecalSlot ? decalTextures
                             : null;
            slot.Albedo = TextureField(entry, fallback, "albedo", at, rootDir, KitTextureRole.Albedo, report);
            slot.Normal = TextureField(entry, fallback, "normal", at, rootDir, KitTextureRole.Normal, report);
            slot.Orm = TextureField(entry, fallback, "orm", at, rootDir, KitTextureRole.Orm, report);

            float? tiling = ReadFloat(entry, "tiling_m", at, report);
            if (tiling.HasValue && tiling.Value > 0f) slot.TilingM = tiling.Value;
            else if (tiling.HasValue) report.Error(at + ".tiling_m must be > 0 (got " + tiling.Value + "); using 1 m.");
            else report.Warn(at + ".tiling_m missing; using 1 m.");

            if (entry["tint"] is JValue tintValue && tintValue.Type == JTokenType.String)
            {
                string hex = tintValue.Value<string>();
                if (HexPattern.IsMatch(hex) && ColorUtility.TryParseHtmlString(hex, out Color tint)) slot.Tint = tint;
                else report.Warn(at + ".tint \"" + hex + "\" is not #RRGGBB; using white.");
            }
            else if (entry["tint"] != null)
            {
                report.Warn(at + ".tint must be an sRGB hex string; using white.");
            }

            slot.Metallic = ReadRange(entry, "metallic", at, report);
            slot.Roughness = ReadRange(entry, "roughness", at, report);
            slot.NormalStrength = ReadFloat(entry, "normal_strength", at, report) ?? 1f;
            slot.AlphaCutoff = Mathf.Clamp01(ReadFloat(entry, "alpha_cutoff", at, report) ?? 0.5f);

            JToken hero = entry["hero"];
            if (hero != null && hero.Type == JTokenType.Boolean) slot.Hero = hero.Value<bool>();
            else slot.Hero = slotName == KitSlotSpec.TrimSlot || slotName == KitSlotSpec.DecalSlot; // VISUAL_TARGET 2.1

            if (entry["source"] == null) report.Warn(at + ".source missing (licence record, VISUAL_TARGET 2.6).");
            string valueType = (entry["value_type"] as JValue)?.Value as string;
            if (valueType != GameValue) report.Warn(at + ".value_type should be \"" + GameValue + "\".");
            return slot;
        }

        private static KitPartSpec ParsePart(JProperty property, string rootDir, ImportReport report)
        {
            string at = "parts." + property.Name;
            if (!IdPattern.IsMatch(property.Name))
            {
                report.Error(at + ": part id must match " + IdPattern + ".");
                return null;
            }
            if (!(property.Value is JObject entry))
            {
                report.Error(at + ": entry must be an object.");
                return null;
            }

            var part = new KitPartSpec(property.Name)
            {
                Lod0Mask = TextureField(entry, null, "lod0_mask", at, rootDir, KitTextureRole.Mask, report),
                Lod1Mask = TextureField(entry, null, "lod1_mask", at, rootDir, KitTextureRole.Mask, report),
            };
            if (part.Lod0Mask == null) report.Error(at + ".lod0_mask missing.");
            if (part.Lod1Mask == null) report.Warn(at + ".lod1_mask missing; LOD1 keeps the plain slot materials.");

            JToken res = entry["mask_res"];
            if (res != null && res.Type == JTokenType.Integer && res.Value<int>() > 0) part.MaskResolution = res.Value<int>();
            else if (res != null) report.Warn(at + ".mask_res must be a positive integer; using 2048.");

            string maskB = (entry["mask_b"] as JValue)?.Value as string;
            if (maskB == "frost") part.MaskBIsFrost = true;
            else if (maskB != "heat") report.Warn(at + ".mask_b should be \"heat\" or \"frost\"; using heat.");

            if (entry["slots"] is JArray slots)
            {
                part.Slots = new List<string>();
                foreach (JToken s in slots)
                {
                    if (s.Type == JTokenType.String && IdPattern.IsMatch(s.Value<string>())) part.Slots.Add(s.Value<string>());
                    else report.Warn(at + ".slots: ignoring invalid entry " + s);
                }
            }
            return part;
        }

        /// <summary>
        /// Reads a relative texture path from <paramref name="entry"/> (or <paramref name="fallback"/>).
        /// Absent → null with no message. Present but unusable → a ref with Exists=false plus an error.
        /// </summary>
        private static KitTextureRef TextureField(JObject entry, JObject fallback, string key, string at, string rootDir,
                                                  KitTextureRole role, ImportReport report)
        {
            JToken token = entry[key];
            string field = at + "." + key;
            if (token == null && fallback != null)
            {
                token = fallback[key];
                field = at + " (shared textures)." + key;
            }
            if (token == null || token.Type == JTokenType.Null) return null;
            if (token.Type != JTokenType.String || string.IsNullOrWhiteSpace(token.Value<string>()))
            {
                report.Error(field + ": must be a relative file path.");
                return new KitTextureRef(field, null, null, role, false);
            }

            string relative = token.Value<string>();
            string rootFull = Path.GetFullPath(rootDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string full;
            try
            {
                full = Path.GetFullPath(Path.Combine(rootDir, relative));
            }
            catch (Exception e) when (e is ArgumentException || e is NotSupportedException || e is PathTooLongException)
            {
                report.Error(field + ": invalid path \"" + relative + "\" (" + e.Message + ").");
                return new KitTextureRef(field, relative, null, role, false);
            }
            if (!full.StartsWith(rootFull, StringComparison.Ordinal))
            {
                report.Error(field + ": path \"" + relative + "\" leaves the library folder.");
                return new KitTextureRef(field, relative, null, role, false);
            }
            if (!File.Exists(full))
            {
                report.Error(field + ": file not found: " + relative);
                return new KitTextureRef(field, relative, full, role, false);
            }
            return new KitTextureRef(field, relative, full, role, true);
        }

        private static float? ReadFloat(JObject entry, string key, string at, ImportReport report)
        {
            JToken token = entry[key];
            if (token == null || token.Type == JTokenType.Null) return null;
            if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float) return token.Value<float>();
            report.Warn(at + "." + key + " must be a number; ignored.");
            return null;
        }

        /// <summary>Accepts [min, max], [value], a number, or {"min": a, "max": b}; values are clamped to 0..1.</summary>
        private static Vector2? ReadRange(JObject entry, string key, string at, ImportReport report)
        {
            JToken token = entry[key];
            if (token == null || token.Type == JTokenType.Null) return null;

            float? min = null, max = null;
            if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float)
            {
                min = max = token.Value<float>();
            }
            else if (token is JArray array && array.Count >= 1 && array.Count <= 2 && IsNumber(array[0]) && IsNumber(array[array.Count - 1]))
            {
                min = array[0].Value<float>();
                max = array[array.Count - 1].Value<float>();
            }
            else if (token is JObject obj && IsNumber(obj["min"]) && IsNumber(obj["max"]))
            {
                min = obj["min"].Value<float>();
                max = obj["max"].Value<float>();
            }

            if (!min.HasValue || !max.HasValue)
            {
                report.Warn(at + "." + key + " must be [min, max], a number or {min, max}; ignored.");
                return null;
            }
            if (min.Value > max.Value)
            {
                report.Warn(at + "." + key + ": min > max; swapped.");
                float t = min.Value;
                min = max;
                max = t;
            }
            return new Vector2(Mathf.Clamp01(min.Value), Mathf.Clamp01(max.Value));
        }

        private static bool IsNumber(JToken token) =>
            token != null && (token.Type == JTokenType.Integer || token.Type == JTokenType.Float);
    }
}
