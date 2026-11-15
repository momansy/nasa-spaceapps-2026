using NUnit.Framework;
using UnityEngine;

namespace MissionForge.Screens.BuildBay.Tests
{
    /// <summary>T034 rework, U7: the weld spark emitter actually emits once played.</summary>
    public sealed class WeldSparksTests
    {
        [Test]
        public void CreateWeldSparks_EmitsParticles_WhenPlayed()
        {
            // Arrange
            var parent = new GameObject("SparksTestParent");
            var material = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit") ?? Shader.Find("Hidden/InternalErrorShader"));
            try
            {
                ParticleSystem sparks = BayStage.CreateWeldSparks(parent.transform, material);

                // Act
                sparks.Play();
                sparks.Simulate(0.3f, true, false, false);

                // Assert
                Assert.That(sparks.particleCount, Is.GreaterThan(20), "about 260 sparks/s: 0.3 s should leave dozens alive");
            }
            finally
            {
                Object.DestroyImmediate(parent);
                Object.DestroyImmediate(material);
            }
        }
    }
}
