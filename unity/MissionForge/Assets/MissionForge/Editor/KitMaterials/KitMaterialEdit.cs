using UnityEngine;

namespace MissionForge.Editor.KitMaterials
{
    /// <summary>
    /// Change-tracking material writer: each setter compares first and only writes when the value
    /// differs, so an unchanged library leaves the asset untouched (idempotent re-runs). With
    /// apply = false it only records whether anything would change (dry run).
    /// </summary>
    internal sealed class KitMaterialEdit
    {
        private const float Tolerance = 1e-4f;
        private readonly Material _material;
        private readonly bool _apply;

        public KitMaterialEdit(Material material, bool apply)
        {
            _material = material;
            _apply = apply;
        }

        public bool Changed { get; private set; }

        public void SetShader(Shader shader)
        {
            if (_material.shader == shader) return;
            Changed = true;
            if (_apply) _material.shader = shader;
        }

        public void SetTexture(string property, Texture value)
        {
            if (!_material.HasProperty(property) || _material.GetTexture(property) == value) return;
            Changed = true;
            if (_apply) _material.SetTexture(property, value);
        }

        public void SetFloat(string property, float value)
        {
            if (!_material.HasProperty(property) || Mathf.Abs(_material.GetFloat(property) - value) <= Tolerance) return;
            Changed = true;
            if (_apply) _material.SetFloat(property, value);
        }

        public void SetColor(string property, Color value)
        {
            if (!_material.HasProperty(property) || Close(_material.GetColor(property), value)) return;
            Changed = true;
            if (_apply) _material.SetColor(property, value);
        }

        public void SetVector(string property, Vector4 value)
        {
            if (!_material.HasProperty(property) || Close(_material.GetVector(property), value)) return;
            Changed = true;
            if (_apply) _material.SetVector(property, value);
        }

        /// <summary>Clears a custom render queue so the shader's queue (Geometry or AlphaTest+1) applies.</summary>
        public void UseShaderRenderQueue()
        {
            if (_material.rawRenderQueue == -1) return;
            Changed = true;
            if (_apply) _material.renderQueue = -1;
        }

        public void SetParent(Material parent)
        {
            if (_material.parent == parent) return;
            Changed = true;
            if (_apply) _material.parent = parent;
        }

        private static bool Close(Vector4 a, Vector4 b) =>
            Mathf.Abs(a.x - b.x) <= Tolerance && Mathf.Abs(a.y - b.y) <= Tolerance
            && Mathf.Abs(a.z - b.z) <= Tolerance && Mathf.Abs(a.w - b.w) <= Tolerance;

        private static bool Close(Color a, Color b) => Close((Vector4)a, (Vector4)b);
    }
}
