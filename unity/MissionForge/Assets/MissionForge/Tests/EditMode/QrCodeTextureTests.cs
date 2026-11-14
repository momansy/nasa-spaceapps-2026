using MissionForge.UI;
using NUnit.Framework;
using UnityEngine;

namespace MissionForge.Tests
{
    public sealed class QrCodeTextureTests
    {
        private const string JoinUrl = "http://localhost:5173/play/?room=ABCD"; // 37 bytes → QR version 3 at level M.
        private const int Version3Modules = 29;
        private static readonly Color32 Dark = new Color32(0, 0, 0, 255);
        private static readonly Color32 Light = new Color32(255, 255, 255, 255);

        [Test]
        public void Create_SizesTheTextureAsModulesPlusQuietZone()
        {
            Texture2D texture = QrCodeTexture.Create(JoinUrl, Dark, Light);
            try
            {
                Assert.That(QrCodeTexture.ModuleCount(JoinUrl), Is.EqualTo(Version3Modules));
                Assert.That(texture.width, Is.EqualTo(Version3Modules + 2 * QrCodeTexture.QuietZoneModules));
                Assert.That(texture.height, Is.EqualTo(texture.width));
                Assert.That(texture.filterMode, Is.EqualTo(FilterMode.Point));
            }
            finally
            {
                Object.DestroyImmediate(texture);
            }
        }

        [Test]
        public void Create_DrawsFinderPatternsAndAQuietZone()
        {
            Texture2D texture = QrCodeTexture.Create(JoinUrl, Dark, Light);
            try
            {
                int q = QrCodeTexture.QuietZoneModules;
                int top = texture.height - 1 - q; // Texture rows are bottom-up.

                // Quiet zone corner is light; the top-left finder pattern's corner and centre are dark, its inner ring light.
                Assert.That(texture.GetPixel(0, texture.height - 1), Is.EqualTo((Color)Light));
                Assert.That(texture.GetPixel(q, top), Is.EqualTo((Color)Dark));
                Assert.That(texture.GetPixel(q + 1, top - 1), Is.EqualTo((Color)Light));
                Assert.That(texture.GetPixel(q + 3, top - 3), Is.EqualTo((Color)Dark));
            }
            finally
            {
                Object.DestroyImmediate(texture);
            }
        }
    }
}
