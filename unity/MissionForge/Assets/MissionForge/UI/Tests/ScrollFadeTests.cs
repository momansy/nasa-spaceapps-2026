using NUnit.Framework;

namespace MissionForge.UI.Tests
{
    public sealed class ScrollFadeTests
    {
        [Test]
        public void HasOverflowBelow_IsFalse_WhenContentFitsTheViewport()
        {
            Assert.IsFalse(MfScrollFade.HasOverflowBelow(contentHeight: 800f, viewportHeight: 820f, scrollOffset: 0f));
        }

        [Test]
        public void HasOverflowBelow_IgnoresSubPixelLayoutRounding()
        {
            Assert.IsFalse(MfScrollFade.HasOverflowBelow(contentHeight: 820.6f, viewportHeight: 820f, scrollOffset: 0f));
        }

        [Test]
        public void HasOverflowBelow_IsTrue_WhenRowsExtendPastTheBottom()
        {
            Assert.IsTrue(MfScrollFade.HasOverflowBelow(contentHeight: 860f, viewportHeight: 820f, scrollOffset: 0f));
        }

        [Test]
        public void HasOverflowBelow_IsFalse_WhenScrolledToTheEnd()
        {
            Assert.IsFalse(MfScrollFade.HasOverflowBelow(contentHeight: 860f, viewportHeight: 820f, scrollOffset: 40f));
        }
    }
}
