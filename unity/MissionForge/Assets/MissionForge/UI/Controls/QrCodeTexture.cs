using Net.Codecrete.QrCodeGenerator;
using UnityEngine;

namespace MissionForge.UI
{
    /// <summary>Builds a point-filtered QR code texture (dark modules on white, with quiet zone).</summary>
    public static class QrCodeTexture
    {
        /// <summary>Quiet zone required by the QR specification, in modules.</summary>
        public const int QuietZoneModules = 4;

        /// <summary>Returns the module matrix size (without quiet zone) for the text, for tests.</summary>
        public static int ModuleCount(string text) => QrCode.EncodeText(text, QrCode.Ecc.Medium).Size;

        /// <summary>Encodes <paramref name="text"/> at error-correction level M. Caller owns the texture.</summary>
        public static Texture2D Create(string text, Color32 dark, Color32 light)
        {
            QrCode qr = QrCode.EncodeText(text, QrCode.Ecc.Medium);
            int size = qr.Size + QuietZoneModules * 2;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
                name = "QrCode",
                hideFlags = HideFlags.HideAndDontSave,
            };
            var pixels = new Color32[size * size];
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    int mx = x - QuietZoneModules;
                    int my = y - QuietZoneModules;
                    bool on = mx >= 0 && my >= 0 && mx < qr.Size && my < qr.Size && qr.GetModule(mx, my);
                    // Texture rows are bottom-up; QR rows are top-down.
                    pixels[(size - 1 - y) * size + x] = on ? dark : light;
                }
            }
            texture.SetPixels32(pixels);
            texture.Apply(false, false);
            return texture;
        }
    }
}
