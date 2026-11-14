#!/usr/bin/env node
// Generates ../LucideIcons.g.cs from a pinned Lucide release.
//
// Usage (no npm dependencies; Node 18+):
//   node generate-lucide-icons.mjs <lucide-static/icons dir> [output .cs path]
//
// The icons dir is the `package/icons` folder of the npm tarball
//   https://registry.npmjs.org/lucide-static/-/lucide-static-<LUCIDE_VERSION>.tgz
// See ../README.md for the full regeneration steps.
//
// Every SVG child element (path, circle, ellipse, line, rect incl. rx/ry, polyline, polygon) is
// converted into SVG path data. Circles and ellipses become two half-arcs; MissionForge's
// SvgPath parser turns arcs into cubic Beziers at load time.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LUCIDE_VERSION = "1.73.0";
const SOURCE_URL = `https://registry.npmjs.org/lucide-static/-/lucide-static-${LUCIDE_VERSION}.tgz`;
const REPO_URL = `https://github.com/lucide-icons/lucide/tree/${LUCIDE_VERSION}/icons`;

// Current Lucide names. Old names (triangle-alert, circle-alert, ...) are aliases in LucideIcons.cs.
export const ICONS = [
  "check", "x", "circle", "circle-check", "triangle-exclamation-point", "octagon-x", "circle-dot",
  "circle-exclamation-point", "info", "signal", "wifi", "wifi-off", "users", "user", "user-plus",
  "qr-code", "settings", "book-open", "rocket", "play", "pause", "chevron-right", "chevron-left",
  "chevron-up", "chevron-down", "arrow-up", "arrow-down", "arrow-right", "clock", "timer",
  "hourglass", "git-compare", "expand", "ruler", "crosshair", "lock", "lock-open", "gauge", "flag",
  "zap", "satellite", "radio", "eye", "eye-off", "loader", "sparkles", "dollar-sign", "calendar",
  "calendar-clock", "weight", "fuel", "sun", "contrast", "type", "languages", "smartphone",
  "monitor", "wrench", "layers", "vote", "hand", "crown", "star", "award", "target", "orbit",
  "globe", "battery", "cpu", "thermometer", "wind", "mountain", "flame", "shield", "shield-check",
  "trending-up", "trending-down", "minus", "plus", "ellipsis", "list-checks", "construction",
  "package", "cable", "scan-line", "link",
];

function fmt(n) {
  if (!Number.isFinite(n)) throw new Error(`non-finite number ${n}`);
  const r = Math.round(n * 10000) / 10000;
  return String(r === 0 ? 0 : r);
}

function attrs(tagText) {
  const out = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagText)) !== null) out[m[1]] = m[2];
  return out;
}

function num(a, key, def) {
  if (a[key] === undefined) {
    if (def === undefined) throw new Error(`missing attribute ${key}`);
    return def;
  }
  const v = parseFloat(a[key]);
  if (!Number.isFinite(v)) throw new Error(`bad number in ${key}="${a[key]}"`);
  return v;
}

function points(str) {
  const nums = (str.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
  if (nums.length < 4 || nums.length % 2 !== 0) throw new Error(`bad points "${str}"`);
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function ellipsePath(cx, cy, rx, ry) {
  if (rx <= 0 || ry <= 0) return null;
  return `M${fmt(cx - rx)} ${fmt(cy)}A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)}` +
         `A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)}Z`;
}

function rectPath(a) {
  const x = num(a, "x", 0), y = num(a, "y", 0);
  const w = num(a, "width"), h = num(a, "height");
  if (w <= 0 || h <= 0) return null;
  // SVG 2 auto rules: a missing rx/ry takes the other's value; both are clamped to half size.
  let rx = a.rx !== undefined ? num(a, "rx") : undefined;
  let ry = a.ry !== undefined ? num(a, "ry") : undefined;
  if (rx === undefined && ry === undefined) { rx = 0; ry = 0; }
  else if (rx === undefined) rx = ry;
  else if (ry === undefined) ry = rx;
  rx = Math.min(Math.max(rx, 0), w / 2);
  ry = Math.min(Math.max(ry, 0), h / 2);
  if (rx === 0 || ry === 0) {
    return `M${fmt(x)} ${fmt(y)}H${fmt(x + w)}V${fmt(y + h)}H${fmt(x)}Z`;
  }
  const arc = (ex, ey) => `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(ex)} ${fmt(ey)}`;
  return `M${fmt(x + rx)} ${fmt(y)}` +
         `H${fmt(x + w - rx)}` + arc(x + w, y + ry) +
         `V${fmt(y + h - ry)}` + arc(x + w - rx, y + h) +
         `H${fmt(x + rx)}` + arc(x, y + h - ry) +
         `V${fmt(y + ry)}` + arc(x + rx, y) + "Z";
}

function elementToPath(tag, a) {
  switch (tag) {
    case "path": {
      const d = (a.d || "").replace(/\s+/g, " ").trim();
      return d.length > 0 ? d : null;
    }
    case "circle": return ellipsePath(num(a, "cx", 0), num(a, "cy", 0), num(a, "r"), num(a, "r"));
    case "ellipse": return ellipsePath(num(a, "cx", 0), num(a, "cy", 0), num(a, "rx"), num(a, "ry"));
    case "line":
      return `M${fmt(num(a, "x1", 0))} ${fmt(num(a, "y1", 0))}L${fmt(num(a, "x2", 0))} ${fmt(num(a, "y2", 0))}`;
    case "rect": return rectPath(a);
    case "polyline":
    case "polygon": {
      const pts = points(a.points || "");
      let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) d += `L${fmt(pts[i][0])} ${fmt(pts[i][1])}`;
      return tag === "polygon" ? d + "Z" : d;
    }
    default:
      throw new Error(`unsupported SVG element <${tag}>`);
  }
}

function convertSvg(text, name) {
  const header = text.match(/@license lucide-static v([\d.]+)/);
  if (!header || header[1] !== LUCIDE_VERSION) {
    throw new Error(`${name}: expected lucide-static v${LUCIDE_VERSION}, found ${header ? header[1] : "no header"}`);
  }
  const svgOpen = text.match(/<svg\b[^>]*>/);
  if (!svgOpen) throw new Error(`${name}: no <svg> element`);
  const svgAttrs = attrs(svgOpen[0]);
  if (svgAttrs.viewBox !== "0 0 24 24") throw new Error(`${name}: unexpected viewBox ${svgAttrs.viewBox}`);
  if (svgAttrs["stroke-width"] !== "2") throw new Error(`${name}: unexpected stroke-width`);

  const body = text.slice(text.indexOf(svgOpen[0]) + svgOpen[0].length, text.lastIndexOf("</svg>"));
  const out = [];
  const re = /<([a-z]+)\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const a = attrs(m[2]);
    if (a.fill && a.fill !== "none") {
      // MfIcon strokes only; a filled child would render wrong, so fail loudly.
      throw new Error(`${name}: <${m[1]}> has fill="${a.fill}"`);
    }
    const d = elementToPath(m[1], a);
    if (d !== null) {
      if (/["\\]/.test(d)) throw new Error(`${name}: path data contains quote or backslash`);
      out.push(d);
    }
  }
  if (out.length === 0) throw new Error(`${name}: no drawable elements`);
  return out;
}

function main() {
  const iconsDir = process.argv[2];
  if (!iconsDir || !existsSync(iconsDir)) {
    console.error("usage: node generate-lucide-icons.mjs <lucide-static/package/icons> [out.cs]");
    process.exit(2);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(process.argv[3] || join(here, "..", "LucideIcons.g.cs"));

  const unique = new Set(ICONS);
  if (unique.size !== ICONS.length) throw new Error("duplicate icon name in ICONS");

  const lines = [];
  lines.push("// <auto-generated>");
  lines.push("//   Generated by UI/Icons/Tools~/generate-lucide-icons.mjs. Do not edit by hand.");
  lines.push(`//   Source: Lucide (lucide-static) v${LUCIDE_VERSION}, ISC licence (see LICENSE-lucide.txt).`);
  lines.push(`//   Tarball: ${SOURCE_URL}`);
  lines.push(`//   Repo:    ${REPO_URL}`);
  lines.push("//   Each icon is a 24x24 viewBox outline drawn with a 2 px round-capped stroke.");
  lines.push("//   Non-path elements were converted to equivalent SVG path data.");
  lines.push("// </auto-generated>");
  lines.push("using System.Collections.Generic;");
  lines.push("");
  lines.push("namespace MissionForge.UI");
  lines.push("{");
  lines.push("    public static partial class LucideIcons");
  lines.push("    {");
  lines.push(`        public const string Version = "${LUCIDE_VERSION}";`);
  lines.push(`        public const string SourceUrl = "${SOURCE_URL}";`);
  lines.push("");
  lines.push(`        internal static readonly Dictionary<string, string[]> Paths = new Dictionary<string, string[]>(${ICONS.length})`);
  lines.push("        {");
  for (const name of ICONS) {
    const file = join(iconsDir, `${name}.svg`);
    if (!existsSync(file)) throw new Error(`missing icon ${name}.svg (renamed upstream?)`);
    const ds = convertSvg(readFileSync(file, "utf8"), name);
    lines.push(`            ["${name}"] = new[]`);
    lines.push("            {");
    for (const d of ds) lines.push(`                "${d}",`);
    lines.push("            },");
  }
  lines.push("        };");
  lines.push("    }");
  lines.push("}");
  lines.push("");
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`wrote ${ICONS.length} icons to ${outPath}`);
}

main();
