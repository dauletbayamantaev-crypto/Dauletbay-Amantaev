using System;
using UnityEngine;
using UnityEngine.Events;

namespace CourtAV
{
    [Serializable] public class BoolEvent : UnityEvent<bool> { }
    [Serializable] public class StringEvent : UnityEvent<string> { }

    /// <summary>Short synthesised signal tones, so the set works without any audio assets.</summary>
    public static class ToneBeep
    {
        public static AudioClip Create(string name, float frequency, float seconds, int pulses = 1, int rate = 44100)
        {
            int n = Mathf.CeilToInt(seconds * rate);
            float[] data = new float[n];
            float fade = rate * 0.004f;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)rate;
                float env = Mathf.Min(1f, Mathf.Min(i, n - i) / fade);
                float gate = pulses > 1 && Mathf.Repeat(t * pulses / seconds, 1f) > 0.6f ? 0f : 1f;
                data[i] = Mathf.Sin(2f * Mathf.PI * frequency * t) * 0.3f * env * gate;
            }
            AudioClip clip = AudioClip.Create(name, n, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
