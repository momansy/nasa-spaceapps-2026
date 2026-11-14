using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>Kind of an absolute drawing command produced by <see cref="SvgPath"/>.</summary>
    public enum SvgCommandType : byte
    {
        /// <summary>Start a subpath at <see cref="SvgCommand.A"/>.</summary>
        MoveTo = 0,
        /// <summary>Straight line to <see cref="SvgCommand.A"/>.</summary>
        LineTo = 1,
        /// <summary>Cubic Bezier: controls A and B, end point C.</summary>
        CubicTo = 2,
        /// <summary>Quadratic Bezier: control A, end point B.</summary>
        QuadTo = 3,
        /// <summary>Close the current subpath.</summary>
        Close = 4,
        /// <summary>
        /// A round dot centred on A. Lucide draws dots as near-zero-length strokes ("M12 16v.01")
        /// that rely on round caps; these are replayed as filled discs so they never vanish.
        /// </summary>
        Dot = 5,
    }

    /// <summary>One absolute drawing command in SVG user units (Lucide: a 24 x 24 viewBox).</summary>
    public readonly struct SvgCommand
    {
        public readonly SvgCommandType Type;
        public readonly Vector2 A;
        public readonly Vector2 B;
        public readonly Vector2 C;

        public SvgCommand(SvgCommandType type, Vector2 a, Vector2 b, Vector2 c)
        {
            Type = type;
            A = a;
            B = b;
            C = c;
        }

        /// <summary>Number of meaningful points (A, B, C) for this command type.</summary>
        public int PointCount
        {
            get
            {
                switch (Type)
                {
                    case SvgCommandType.CubicTo: return 3;
                    case SvgCommandType.QuadTo: return 2;
                    case SvgCommandType.Close: return 0;
                    default: return 1;
                }
            }
        }

        /// <summary>Pen position after this command (undefined for Close).</summary>
        public Vector2 End
        {
            get
            {
                switch (Type)
                {
                    case SvgCommandType.CubicTo: return C;
                    case SvgCommandType.QuadTo: return B;
                    default: return A;
                }
            }
        }

        public Vector2 GetPoint(int index)
        {
            switch (index)
            {
                case 0: return A;
                case 1: return B;
                default: return C;
            }
        }

        public override string ToString() => $"{Type} {A} {B} {C}";
    }

    /// <summary>
    /// SVG path data ("d" attribute) parsed into absolute MoveTo / LineTo / cubic / quadratic / Close
    /// commands. Supports M m L l H h V v C c S s Q q T t A a Z z, implicit repeated commands and
    /// compact numbers ("1.5.5", "-.5", "10-5", exponents). Elliptical arcs become cubic Beziers of
    /// at most 90 degrees each. Parse once and keep the instance: replaying allocates nothing.
    /// </summary>
    public sealed class SvgPath
    {
        /// <summary>Tiny strokes shorter than this (user units) are treated as dots.</summary>
        private const float DotMaxLength = 0.05f;

        private readonly SvgCommand[] _commands;
        private readonly bool _hasStroke;
        private readonly bool _hasDots;

        private SvgPath(SvgCommand[] commands)
        {
            _commands = commands;
            for (int i = 0; i < commands.Length; i++)
            {
                if (commands[i].Type == SvgCommandType.Dot) _hasDots = true;
                else if (commands[i].Type != SvgCommandType.MoveTo) _hasStroke = true;
            }
        }

        /// <summary>Parsed commands, in order. Do not cast back to an array and mutate.</summary>
        public IReadOnlyList<SvgCommand> Commands => _commands;

        public int Count => _commands.Length;

        public SvgCommand this[int index] => _commands[index];

        /// <summary>Parses one path data string.</summary>
        /// <exception cref="FormatException">The data is not valid SVG path syntax.</exception>
        public static SvgPath Parse(string d)
        {
            var list = new List<SvgCommand>(32);
            ParseInto(d, list);
            return new SvgPath(DetectDots(list));
        }

        /// <summary>Parses several path data strings (one per SVG element) into one path.</summary>
        /// <exception cref="FormatException">Any string is not valid SVG path syntax.</exception>
        public static SvgPath Parse(IReadOnlyList<string> paths)
        {
            if (paths == null) throw new ArgumentNullException(nameof(paths));
            var list = new List<SvgCommand>(64);
            for (int i = 0; i < paths.Count; i++) ParseInto(paths[i], list);
            return new SvgPath(DetectDots(list));
        }

        /// <summary>
        /// Appends the absolute commands for <paramref name="d"/> to <paramref name="output"/>.
        /// Dots are not detected here (see <see cref="Parse(string)"/>).
        /// </summary>
        /// <exception cref="FormatException">The data is not valid SVG path syntax.</exception>
        public static void ParseInto(string d, List<SvgCommand> output)
        {
            if (d == null) throw new ArgumentNullException(nameof(d));
            if (output == null) throw new ArgumentNullException(nameof(output));

            var r = new Reader(d);
            char cmd = '\0';
            char prev = '\0';
            bool hasCurrent = false;
            bool needMove = false;
            Vector2 cur = Vector2.zero;
            Vector2 start = Vector2.zero;
            Vector2 lastCtrl = Vector2.zero;

            while (!r.AtEnd())
            {
                if (r.TryReadCommand(out char c))
                {
                    cmd = c;
                }
                else if (cmd == '\0')
                {
                    throw r.Error("path data must start with a command");
                }
                else if (cmd == 'Z' || cmd == 'z')
                {
                    throw r.Error("unexpected number after Z");
                }
                else if (cmd == 'M')
                {
                    cmd = 'L';
                }
                else if (cmd == 'm')
                {
                    cmd = 'l';
                }

                bool rel = cmd >= 'a';
                char up = rel ? (char)(cmd - 32) : cmd;

                if (up != 'M')
                {
                    if (!hasCurrent) throw r.Error("path data must begin with M or m");
                    if (needMove && up != 'Z')
                    {
                        output.Add(new SvgCommand(SvgCommandType.MoveTo, cur, default, default));
                        needMove = false;
                    }
                }

                Vector2 origin = rel ? cur : Vector2.zero;
                switch (up)
                {
                    case 'M':
                    {
                        Vector2 p = (rel && hasCurrent ? cur : Vector2.zero) + r.ReadPoint();
                        output.Add(new SvgCommand(SvgCommandType.MoveTo, p, default, default));
                        cur = p;
                        start = p;
                        hasCurrent = true;
                        needMove = false;
                        break;
                    }
                    case 'L':
                    {
                        Vector2 p = origin + r.ReadPoint();
                        output.Add(new SvgCommand(SvgCommandType.LineTo, p, default, default));
                        cur = p;
                        break;
                    }
                    case 'H':
                    {
                        float x = r.ReadNumber();
                        Vector2 p = new Vector2(rel ? cur.x + x : x, cur.y);
                        output.Add(new SvgCommand(SvgCommandType.LineTo, p, default, default));
                        cur = p;
                        break;
                    }
                    case 'V':
                    {
                        float y = r.ReadNumber();
                        Vector2 p = new Vector2(cur.x, rel ? cur.y + y : y);
                        output.Add(new SvgCommand(SvgCommandType.LineTo, p, default, default));
                        cur = p;
                        break;
                    }
                    case 'C':
                    {
                        Vector2 c1 = origin + r.ReadPoint();
                        Vector2 c2 = origin + r.ReadPoint();
                        Vector2 p = origin + r.ReadPoint();
                        output.Add(new SvgCommand(SvgCommandType.CubicTo, c1, c2, p));
                        lastCtrl = c2;
                        cur = p;
                        break;
                    }
                    case 'S':
                    {
                        Vector2 c1 = (prev == 'C' || prev == 'S') ? 2f * cur - lastCtrl : cur;
                        Vector2 c2 = origin + r.ReadPoint();
                        Vector2 p = origin + r.ReadPoint();
                        output.Add(new SvgCommand(SvgCommandType.CubicTo, c1, c2, p));
                        lastCtrl = c2;
                        cur = p;
                        break;
                    }
                    case 'Q':
                    {
                        Vector2 q = origin + r.ReadPoint();
                        Vector2 p = origin + r.ReadPoint();
                        output.Add(new SvgCommand(SvgCommandType.QuadTo, q, p, default));
                        lastCtrl = q;
                        cur = p;
                        break;
                    }
                    case 'T':
                    {
                        Vector2 q = (prev == 'Q' || prev == 'T') ? 2f * cur - lastCtrl : cur;
                        Vector2 p = origin + r.ReadPoint();
                        output.Add(new SvgCommand(SvgCommandType.QuadTo, q, p, default));
                        lastCtrl = q;
                        cur = p;
                        break;
                    }
                    case 'A':
                    {
                        float rx = r.ReadNumber();
                        float ry = r.ReadNumber();
                        float angle = r.ReadNumber();
                        bool large = r.ReadFlag();
                        bool sweep = r.ReadFlag();
                        Vector2 p = origin + r.ReadPoint();
                        AppendArc(output, cur, rx, ry, angle, large, sweep, p);
                        cur = p;
                        break;
                    }
                    case 'Z':
                    {
                        output.Add(new SvgCommand(SvgCommandType.Close, default, default, default));
                        cur = start;
                        needMove = true;
                        break;
                    }
                    default:
                        throw r.Error($"unsupported command '{cmd}'");
                }

                prev = up;
            }
        }

        /// <summary>
        /// Converts an SVG elliptical arc (endpoint form) to cubic Beziers, using the centre
        /// parametrisation from SVG 1.1 appendix F.6.5 and segments of at most 90 degrees.
        /// </summary>
        public static void AppendArc(List<SvgCommand> output, Vector2 from, float rx, float ry,
            float xAxisRotationDeg, bool largeArc, bool sweep, Vector2 to)
        {
            if (from == to) return; // F.6.2: identical endpoints omit the arc.

            double rX = Math.Abs((double)rx);
            double rY = Math.Abs((double)ry);
            if (rX < 1e-9 || rY < 1e-9)
            {
                output.Add(new SvgCommand(SvgCommandType.LineTo, to, default, default));
                return;
            }

            double phi = xAxisRotationDeg * (Math.PI / 180.0);
            double cosPhi = Math.Cos(phi);
            double sinPhi = Math.Sin(phi);

            double dx2 = (from.x - (double)to.x) * 0.5;
            double dy2 = (from.y - (double)to.y) * 0.5;
            double x1p = cosPhi * dx2 + sinPhi * dy2;
            double y1p = -sinPhi * dx2 + cosPhi * dy2;

            // F.6.6: scale radii up if they cannot span the endpoints.
            double lambda = (x1p * x1p) / (rX * rX) + (y1p * y1p) / (rY * rY);
            if (lambda > 1.0)
            {
                double s = Math.Sqrt(lambda);
                rX *= s;
                rY *= s;
            }

            double rx2 = rX * rX;
            double ry2 = rY * rY;
            double num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
            double den = rx2 * y1p * y1p + ry2 * x1p * x1p;
            double coef = den > 0.0 ? Math.Sqrt(Math.Max(0.0, num / den)) : 0.0;
            if (largeArc == sweep) coef = -coef;

            double cxp = coef * (rX * y1p / rY);
            double cyp = coef * -(rY * x1p / rX);
            double cx = cosPhi * cxp - sinPhi * cyp + (from.x + (double)to.x) * 0.5;
            double cy = sinPhi * cxp + cosPhi * cyp + (from.y + (double)to.y) * 0.5;

            double ux = (x1p - cxp) / rX;
            double uy = (y1p - cyp) / rY;
            double vx = (-x1p - cxp) / rX;
            double vy = (-y1p - cyp) / rY;
            double theta1 = Math.Atan2(uy, ux);
            double dTheta = Math.Atan2(ux * vy - uy * vx, ux * vx + uy * vy);
            if (!sweep && dTheta > 0.0) dTheta -= 2.0 * Math.PI;
            else if (sweep && dTheta < 0.0) dTheta += 2.0 * Math.PI;

            int segments = Math.Max(1, (int)Math.Ceiling(Math.Abs(dTheta) / (Math.PI * 0.5) - 1e-7));
            double delta = dTheta / segments;
            double t = 4.0 / 3.0 * Math.Tan(delta * 0.25);

            double a1 = theta1;
            double cos1 = Math.Cos(a1);
            double sin1 = Math.Sin(a1);
            for (int i = 0; i < segments; i++)
            {
                double a2 = a1 + delta;
                double cos2 = Math.Cos(a2);
                double sin2 = Math.Sin(a2);

                // Unit-circle control points, then map through the ellipse transform.
                Vector2 c1 = MapArcPoint(cos1 - t * sin1, sin1 + t * cos1, cx, cy, rX, rY, cosPhi, sinPhi);
                Vector2 c2 = MapArcPoint(cos2 + t * sin2, sin2 - t * cos2, cx, cy, rX, rY, cosPhi, sinPhi);
                Vector2 end = i == segments - 1
                    ? to
                    : MapArcPoint(cos2, sin2, cx, cy, rX, rY, cosPhi, sinPhi);
                output.Add(new SvgCommand(SvgCommandType.CubicTo, c1, c2, end));

                a1 = a2;
                cos1 = cos2;
                sin1 = sin2;
            }
        }

        private static Vector2 MapArcPoint(double ux, double uy, double cx, double cy, double rx, double ry,
            double cosPhi, double sinPhi)
        {
            double x = rx * ux;
            double y = ry * uy;
            return new Vector2((float)(cx + cosPhi * x - sinPhi * y), (float)(cy + sinPhi * x + cosPhi * y));
        }

        /// <summary>Replaces "MoveTo + tiny LineTo" subpaths (Lucide dots) with a Dot command.</summary>
        private static SvgCommand[] DetectDots(List<SvgCommand> list)
        {
            var result = new List<SvgCommand>(list.Count);
            for (int i = 0; i < list.Count; i++)
            {
                SvgCommand c = list[i];
                bool isDot = c.Type == SvgCommandType.MoveTo
                    && i + 1 < list.Count
                    && list[i + 1].Type == SvgCommandType.LineTo
                    && (i + 2 == list.Count || list[i + 2].Type == SvgCommandType.MoveTo)
                    && (list[i + 1].A - c.A).sqrMagnitude <= DotMaxLength * DotMaxLength;
                if (isDot)
                {
                    Vector2 centre = (c.A + list[i + 1].A) * 0.5f;
                    result.Add(new SvgCommand(SvgCommandType.Dot, centre, default, default));
                    i++;
                }
                else
                {
                    result.Add(c);
                }
            }
            return result.ToArray();
        }

        /// <summary>Axis-aligned bounds of every point, control points included. False if empty.</summary>
        public bool TryGetBounds(out Vector2 min, out Vector2 max)
        {
            min = new Vector2(float.PositiveInfinity, float.PositiveInfinity);
            max = new Vector2(float.NegativeInfinity, float.NegativeInfinity);
            bool any = false;
            for (int i = 0; i < _commands.Length; i++)
            {
                SvgCommand c = _commands[i];
                int n = c.PointCount;
                for (int k = 0; k < n; k++)
                {
                    Vector2 p = c.GetPoint(k);
                    min = Vector2.Min(min, p);
                    max = Vector2.Max(max, p);
                    any = true;
                }
            }
            return any;
        }

        /// <summary>
        /// Adds the stroke subpaths to the painter's current path, mapping each point as
        /// <c>offset + point * scale</c>. Dot commands are skipped (see <see cref="FillDots"/>).
        /// Call <see cref="Painter2D.BeginPath"/> before and <see cref="Painter2D.Stroke()"/> after.
        /// </summary>
        public void AppendTo(Painter2D painter, Vector2 offset, float scale)
        {
            SvgCommand[] cmds = _commands;
            for (int i = 0; i < cmds.Length; i++)
            {
                SvgCommand c = cmds[i];
                switch (c.Type)
                {
                    case SvgCommandType.MoveTo:
                        painter.MoveTo(offset + c.A * scale);
                        break;
                    case SvgCommandType.LineTo:
                        painter.LineTo(offset + c.A * scale);
                        break;
                    case SvgCommandType.CubicTo:
                        painter.BezierCurveTo(offset + c.A * scale, offset + c.B * scale, offset + c.C * scale);
                        break;
                    case SvgCommandType.QuadTo:
                        painter.QuadraticCurveTo(offset + c.A * scale, offset + c.B * scale);
                        break;
                    case SvgCommandType.Close:
                        painter.ClosePath();
                        break;
                }
            }
        }

        /// <summary>Fills every Dot command as a disc of <paramref name="radius"/> pixels with the current fillColor.</summary>
        public void FillDots(Painter2D painter, Vector2 offset, float scale, float radius)
        {
            if (!_hasDots) return;
            SvgCommand[] cmds = _commands;
            for (int i = 0; i < cmds.Length; i++)
            {
                if (cmds[i].Type != SvgCommandType.Dot) continue;
                painter.BeginPath();
                painter.Arc(offset + cmds[i].A * scale, radius, 0f, 360f);
                painter.Fill();
            }
        }

        /// <summary>
        /// Strokes the whole path with the painter's current stroke settings, then fills dots with
        /// <see cref="Painter2D.strokeColor"/> at half the line width. Allocation free.
        /// </summary>
        public void Stroke(Painter2D painter, Vector2 offset, float scale)
        {
            if (painter == null) throw new ArgumentNullException(nameof(painter));
            if (_hasStroke)
            {
                painter.BeginPath();
                AppendTo(painter, offset, scale);
                painter.Stroke();
            }
            if (_hasDots)
            {
                painter.fillColor = painter.strokeColor;
                FillDots(painter, offset, scale, painter.lineWidth * 0.5f);
            }
        }

        /// <summary>Character cursor over path data. Mutable struct: keep it in a local.</summary>
        private struct Reader
        {
            private readonly string _s;
            private int _i;

            public Reader(string s)
            {
                _s = s;
                _i = 0;
            }

            public FormatException Error(string message) =>
                new FormatException($"SVG path: {message} at index {_i} in \"{_s}\"");

            private void SkipSeparators()
            {
                while (_i < _s.Length)
                {
                    char c = _s[_i];
                    if (c == ' ' || c == ',' || c == '\t' || c == '\n' || c == '\r' || c == '\f') _i++;
                    else break;
                }
            }

            public bool AtEnd()
            {
                SkipSeparators();
                return _i >= _s.Length;
            }

            public bool TryReadCommand(out char cmd)
            {
                SkipSeparators();
                if (_i < _s.Length && IsCommand(_s[_i]))
                {
                    cmd = _s[_i++];
                    return true;
                }
                cmd = '\0';
                return false;
            }

            private static bool IsCommand(char c)
            {
                switch (c)
                {
                    case 'M': case 'm': case 'L': case 'l': case 'H': case 'h': case 'V': case 'v':
                    case 'C': case 'c': case 'S': case 's': case 'Q': case 'q': case 'T': case 't':
                    case 'A': case 'a': case 'Z': case 'z':
                        return true;
                    default:
                        return false;
                }
            }

            private static bool IsDigit(char c) => c >= '0' && c <= '9';

            public float ReadNumber()
            {
                SkipSeparators();
                int startIndex = _i;
                int len = _s.Length;
                if (_i < len && (_s[_i] == '+' || _s[_i] == '-')) _i++;
                int digits = 0;
                while (_i < len && IsDigit(_s[_i])) { _i++; digits++; }
                if (_i < len && _s[_i] == '.')
                {
                    _i++;
                    while (_i < len && IsDigit(_s[_i])) { _i++; digits++; }
                }
                if (digits == 0)
                {
                    _i = startIndex;
                    throw Error("expected a number");
                }
                if (_i < len && (_s[_i] == 'e' || _s[_i] == 'E'))
                {
                    int save = _i;
                    _i++;
                    if (_i < len && (_s[_i] == '+' || _s[_i] == '-')) _i++;
                    int expDigits = 0;
                    while (_i < len && IsDigit(_s[_i])) { _i++; expDigits++; }
                    if (expDigits == 0) _i = save;
                }

                // Parse-time only (results are cached), so the substring allocation is acceptable.
                float value = float.Parse(_s.Substring(startIndex, _i - startIndex),
                    NumberStyles.Float, CultureInfo.InvariantCulture);
                if (float.IsNaN(value) || float.IsInfinity(value)) throw Error("number out of range");
                return value;
            }

            public Vector2 ReadPoint()
            {
                float x = ReadNumber();
                float y = ReadNumber();
                return new Vector2(x, y);
            }

            /// <summary>Arc flags are a single '0' or '1' and may be written without separators.</summary>
            public bool ReadFlag()
            {
                SkipSeparators();
                if (_i >= _s.Length) throw Error("expected an arc flag");
                char c = _s[_i];
                if (c == '0') { _i++; return false; }
                if (c == '1') { _i++; return true; }
                throw Error("arc flag must be 0 or 1");
            }
        }
    }
}
