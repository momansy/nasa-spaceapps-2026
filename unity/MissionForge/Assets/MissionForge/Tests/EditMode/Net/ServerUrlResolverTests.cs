using MissionForge.Net;
using NUnit.Framework;

namespace MissionForge.Tests.Net
{
    public sealed class ServerUrlResolverTests
    {
        private const string Configured = "ws://localhost:8787";
        private const string Template = "{origin}/play/?room={code}";
        private const string FallbackOrigin = "http://localhost:5173";

        [TestCase(null)]
        [TestCase("")]
        [TestCase("https://game.example.com/host/")]
        [TestCase("https://game.example.com/host/?room=ABCD")]
        public void ResolveServerUrl_WithoutServerParameter_ReturnsConfiguredUrl(string pageUrl)
        {
            Assert.AreEqual(Configured, ServerUrlResolver.ResolveServerUrl(Configured, pageUrl));
        }

        [Test]
        public void ResolveServerUrl_DecodesAnEncodedServerParameter()
        {
            const string pageUrl = "https://game.example.com/host/?server=ws%3A%2F%2Fhost%3A8787";

            Assert.AreEqual("ws://host:8787", ServerUrlResolver.ResolveServerUrl(Configured, pageUrl));
        }

        [Test]
        public void ResolveServerUrl_AcceptsAnUnencodedServerParameter()
        {
            const string pageUrl = "http://192.168.1.20:8080/index.html?server=ws://192.168.1.20:8787";

            Assert.AreEqual("ws://192.168.1.20:8787", ServerUrlResolver.ResolveServerUrl(Configured, pageUrl));
        }

        [Test]
        public void ResolveServerUrl_FindsTheParameterAmongOthersAndIgnoresTheFragment()
        {
            const string pageUrl = "https://game.example.com/?lang=en&server=wss%3A%2F%2Frooms.example.com%2Fws&debug=1#section?server=ws://wrong";

            Assert.AreEqual("wss://rooms.example.com/ws", ServerUrlResolver.ResolveServerUrl(Configured, pageUrl));
        }

        [TestCase("https://game.example.com/#?server=ws://in-fragment:1", TestName = "ResolveServerUrl_Ignores_ParameterInsideFragment")]
        [TestCase("https://game.example.com/?server=http%3A%2F%2Fnot-a-websocket", TestName = "ResolveServerUrl_Ignores_HttpValue")]
        [TestCase("https://game.example.com/?server=javascript:alert(1)", TestName = "ResolveServerUrl_Ignores_JavascriptValue")]
        [TestCase("https://game.example.com/?server=", TestName = "ResolveServerUrl_Ignores_EmptyValue")]
        [TestCase("https://game.example.com/?server", TestName = "ResolveServerUrl_Ignores_ParameterWithoutValue")]
        [TestCase("https://game.example.com/?server=ws://", TestName = "ResolveServerUrl_Ignores_SchemeOnly")]
        [TestCase("https://game.example.com/?myserver=ws://other:1", TestName = "ResolveServerUrl_Ignores_SimilarParameterName")]
        public void ResolveServerUrl_IgnoresUnusableServerParameters(string pageUrl)
        {
            Assert.AreEqual(Configured, ServerUrlResolver.ResolveServerUrl(Configured, pageUrl));
        }

        [Test]
        public void BuildJoinUrl_ServerProvidedUrlWins()
        {
            string url = ServerUrlResolver.BuildJoinUrl(
                Template,
                "https://game.example.com/host/?server=ws%3A%2F%2Fhost%3A8787",
                FallbackOrigin,
                "ABCD",
                "https://join.example.com/r/ABCD");

            Assert.AreEqual("https://join.example.com/r/ABCD", url);
        }

        [Test]
        public void BuildJoinUrl_UsesTheHttpsPageOriginIncludingPort()
        {
            string url = ServerUrlResolver.BuildJoinUrl(
                Template, "https://game.example.com:8443/host/index.html?x=1#top", FallbackOrigin, "ABCD", null);

            Assert.AreEqual("https://game.example.com:8443/play/?room=ABCD", url);
        }

        [Test]
        public void BuildJoinUrl_UsesTheHttpPageOrigin()
        {
            string url = ServerUrlResolver.BuildJoinUrl(Template, "http://192.168.1.20:8080/", FallbackOrigin, "WXYZ", "");

            Assert.AreEqual("http://192.168.1.20:8080/play/?room=WXYZ", url);
        }

        [TestCase(null)]
        [TestCase("")]
        [TestCase("file:///Users/dev/build/index.html")]
        [TestCase("not a url")]
        public void BuildJoinUrl_FallsBackWhenThePageIsNotHttp(string pageUrl)
        {
            string url = ServerUrlResolver.BuildJoinUrl(Template, pageUrl, FallbackOrigin, "ABCD", null);

            Assert.AreEqual("http://localhost:5173/play/?room=ABCD", url);
        }

        [Test]
        public void BuildJoinUrl_TrimsATrailingSlashFromTheFallbackOrigin()
        {
            string url = ServerUrlResolver.BuildJoinUrl(Template, null, "http://localhost:5173/", "ABCD", null);

            Assert.AreEqual("http://localhost:5173/play/?room=ABCD", url);
        }

        [Test]
        public void BuildJoinUrl_AppendsTheEncodedServerOverride()
        {
            string url = ServerUrlResolver.BuildJoinUrl(
                Template, "https://game.example.com/host/?server=ws%3A%2F%2F10.0.0.5%3A8787", FallbackOrigin, "ABCD", null);

            Assert.AreEqual("https://game.example.com/play/?room=ABCD&server=ws%3A%2F%2F10.0.0.5%3A8787", url);
        }

        [Test]
        public void BuildJoinUrl_StartsAQueryWhenTheTemplateHasNoneAndKeepsTheFragment()
        {
            string url = ServerUrlResolver.BuildJoinUrl(
                "{origin}/join/{code}#go", "https://game.example.com/?server=ws://10.0.0.5:8787", FallbackOrigin, "ABCD", null);

            Assert.AreEqual("https://game.example.com/join/ABCD?server=ws%3A%2F%2F10.0.0.5%3A8787#go", url);
        }

        [Test]
        public void BuildJoinUrl_DoesNotAppendAnUnusableServerOverride()
        {
            string url = ServerUrlResolver.BuildJoinUrl(
                Template, "https://game.example.com/?server=http%3A%2F%2Fevil.example", FallbackOrigin, "ABCD", null);

            Assert.AreEqual("https://game.example.com/play/?room=ABCD", url);
        }

        [TestCase(null)]
        [TestCase("")]
        public void BuildJoinUrl_UsesTheDefaultTemplateWhenNoneIsGiven(string template)
        {
            string url = ServerUrlResolver.BuildJoinUrl(template, null, FallbackOrigin, "ABCD", null);

            Assert.AreEqual("http://localhost:5173/play/?room=ABCD", url);
        }
    }
}
