using System;
using System.Globalization;
using UnityEngine;
using UnityEngine.UIElements;

namespace MissionForge.UI
{
    /// <summary>
    /// Motion helpers on the motion tokens (tokens.json motion, VISUAL_TARGET 3.1; all game_value):
    /// enter/exit with a 40 ms stagger capped at 8 items, number count-up (ease-out-quart), and the timer pulse
    /// (1600 ms period, ease-in-out-sine, last 5 s only). Every helper honours reduced motion: movement becomes an
    /// opacity fade of 150 ms or less (Motion.uss), there is no pulse, and count-ups jump to the value.
    /// </summary>
    public static class MfMotion
    {
        public const int MicroMs = 120, StateMs = 200, EnterMs = 320, ExitMs = 220, ScreenMs = 600, CountMs = 1000,
            PulseMs = 1600, CelebrateMs = 480, StaggerMs = 40, MaxStaggered = 8, ReducedMs = 150;

        /// <summary>Root class that switches every sheet to reduced motion.</summary>
        public const string ReducedClass = "mf-reduced-motion";
        /// <summary>Class an element carries before it enters (opacity 0, offset); removing it plays the enter transition.</summary>
        public const string EnterFromClass = "mf-enter";

        /// <summary>Global reduced-motion preference (settings or the OS). Apply it to a panel with <see cref="ApplyTo"/>.</summary>
        public static bool Reduced { get; set; }

        public static void ApplyTo(VisualElement panelRoot) => panelRoot?.EnableInClassList(ReducedClass, Reduced);

        /// <summary>Delay in ms for the <paramref name="index"/>-th item of a staggered list (40 ms each, max 8 items).</summary>
        public static int StaggerDelay(int index) => Reduced ? 0 : Mathf.Clamp(index, 0, MaxStaggered - 1) * StaggerMs;

        /// <summary>
        /// Plays an enter transition: the element starts in <paramref name="fromClass"/> (opacity 0 and an offset in USS)
        /// and the class is removed after the stagger delay so its USS transition runs.
        /// </summary>
        public static void Enter(VisualElement element, int index = 0, string fromClass = EnterFromClass)
        {
            if (element == null) return;
            element.AddToClassList(fromClass);
            element.schedule.Execute(() => element.RemoveFromClassList(fromClass)).StartingIn(16 + StaggerDelay(index));
        }

        /// <summary>Plays the exit transition by adding <paramref name="toClass"/>; optionally removes the element afterwards.</summary>
        public static void Exit(VisualElement element, bool remove, string toClass = EnterFromClass)
        {
            if (element == null) return;
            element.AddToClassList(toClass);
            if (remove) element.schedule.Execute(() => element.RemoveFromHierarchy()).StartingIn((Reduced ? ReducedMs : ExitMs) + 30);
        }

        /// <summary>ease-out-quart, t in 0..1.</summary>
        public static float EaseOutQuart(float t)
        {
            t = Mathf.Clamp01(t);
            float u = 1f - t;
            return 1f - u * u * u * u;
        }

        /// <summary>ease-in-out-sine, t in 0..1.</summary>
        public static float EaseInOutSine(float t) => -(Mathf.Cos(Mathf.PI * Mathf.Clamp01(t)) - 1f) / 2f;

        /// <summary>
        /// Counts <paramref name="label"/> from <paramref name="from"/> to <paramref name="to"/> over the count token,
        /// formatting with <paramref name="format"/>. Reduced motion jumps straight to the value. Returns the scheduled item.
        /// </summary>
        public static IVisualElementScheduledItem CountUp(Label label, double from, double to, Func<double, string> format, int durationMs = CountMs)
        {
            if (label == null || format == null) return null;
            if (Reduced || durationMs <= 0)
            {
                label.text = format(to);
                return null;
            }
            float start = Time.realtimeSinceStartup;
            IVisualElementScheduledItem item = null;
            item = label.schedule.Execute(() =>
            {
                float t = (Time.realtimeSinceStartup - start) * 1000f / durationMs;
                label.text = format(from + (to - from) * EaseOutQuart(t));
                if (t >= 1f) item.Pause();
            }).Every(16);
            return item;
        }

        /// <summary>Formats with invariant group separators, e.g. Number(9718.2, 0) = "9,718".</summary>
        public static string Number(double v, int decimals) => v.ToString("N" + decimals, CultureInfo.InvariantCulture);

        /// <summary>
        /// Timer warning pulse: while <paramref name="active"/> the element scales 1.00-1.06 on a 1600 ms sine period.
        /// No pulse in reduced motion (the timer ring's colour, icon and number still change).
        /// </summary>
        public static void Pulse(VisualElement element, bool active)
        {
            if (element == null) return;
            if (!active || Reduced)
            {
                element.style.scale = new Scale(Vector3.one);
                element.userData = null;
                return;
            }
            if (element.userData is PulseState) return;
            var state = new PulseState { Start = Time.realtimeSinceStartup };
            element.userData = state;
            state.Item = element.schedule.Execute(() =>
            {
                if (!(element.userData is PulseState s) || Reduced)
                {
                    state.Item.Pause();
                    element.style.scale = new Scale(Vector3.one);
                    return;
                }
                float phase = ((Time.realtimeSinceStartup - s.Start) * 1000f % PulseMs) / PulseMs;
                float k = EaseInOutSine(phase < 0.5f ? phase * 2f : 2f - phase * 2f);
                float scale = 1f + 0.06f * k;
                element.style.scale = new Scale(new Vector3(scale, scale, 1f));
            }).Every(16);
        }

        private sealed class PulseState
        {
            public float Start;
            public IVisualElementScheduledItem Item;
        }
    }
}
