using System;
using System.Collections.Generic;

namespace MissionForge.UI.Tests
{
    /// <summary>Minimal TrueType reader (table directory, cmap format 4, hhea, hmtx) to read digit advance widths.</summary>
    internal static class TrueTypeMetrics
    {
        public static IEnumerable<int> DigitAdvances(byte[] font)
        {
            var tables = new Dictionary<string, int>();
            int numTables = U16(font, 4);
            for (int i = 0; i < numTables; i++)
            {
                int rec = 12 + i * 16;
                string tag = System.Text.Encoding.ASCII.GetString(font, rec, 4);
                tables[tag] = (int)U32(font, rec + 8);
            }
            int hhea = tables["hhea"], hmtx = tables["hmtx"], cmap = tables["cmap"];
            int numberOfHMetrics = U16(font, hhea + 34);

            int sub = -1;
            int numSub = U16(font, cmap + 2);
            for (int i = 0; i < numSub; i++)
            {
                int rec = cmap + 4 + i * 8;
                int platform = U16(font, rec), encoding = U16(font, rec + 2);
                int offset = cmap + (int)U32(font, rec + 4);
                if (U16(font, offset) == 4 && (platform == 3 && encoding == 1 || platform == 0)) { sub = offset; break; }
            }
            if (sub < 0) throw new InvalidOperationException("No cmap format 4 subtable");

            for (char c = '0'; c <= '9'; c++)
            {
                int glyph = Glyph(font, sub, c);
                int index = Math.Min(glyph, numberOfHMetrics - 1);
                yield return U16(font, hmtx + index * 4);
            }
        }

        private static int Glyph(byte[] f, int sub, char ch)
        {
            int segX2 = U16(f, sub + 6);
            int ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
            for (int s = 0; s < segX2 / 2; s++)
            {
                int end = U16(f, ends + s * 2), start = U16(f, starts + s * 2);
                if (ch < start || ch > end) continue;
                int delta = (short)U16(f, deltas + s * 2);
                int rangeOffset = U16(f, ranges + s * 2);
                if (rangeOffset == 0) return (ch + delta) & 0xFFFF;
                int addr = ranges + s * 2 + rangeOffset + (ch - start) * 2;
                int g = U16(f, addr);
                return g == 0 ? 0 : (g + delta) & 0xFFFF;
            }
            return 0;
        }

        private static int U16(byte[] b, int o) => (b[o] << 8) | b[o + 1];
        private static uint U32(byte[] b, int o) => (uint)((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
    }
}
