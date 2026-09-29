using UnityEngine;

namespace CourtAV
{
    /// <summary>Lights an LED part (LED ring, REC dot, reader LED) through its material colour and emission.
    /// Works with the Built-in Standard shader and URP/HDRP Lit.</summary>
    [RequireComponent(typeof(Renderer))]
    public class LedIndicator : MonoBehaviour
    {
        public float intensity = 3f;
        public Color offColor = new Color(0.125f, 0.125f, 0.133f);

        Material mat;
        Color color = Color.black;
        float blinkHz;
        int lastState = -1;

        public Color CurrentColor { get { return color; } }

        void Awake()
        {
            mat = GetComponent<Renderer>().material;      // instance: every LED has its own
            mat.EnableKeyword("_EMISSION");
            mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            Apply(true);
        }

        /// <param name="blink">Blinks per second; 0 = steady.</param>
        public void Set(Color c, float blink = 0f)
        {
            color = c;
            blinkHz = blink;
            Apply(true);
        }

        void Update()
        {
            if (blinkHz > 0f) Apply(false);
        }

        void Apply(bool force)
        {
            if (mat == null) return;
            bool lit = color.maxColorComponent > 0.001f && (blinkHz <= 0f || Mathf.Repeat(Time.time * blinkHz, 1f) < 0.5f);
            int state = lit ? 1 : 0;
            if (!force && state == lastState) return;
            lastState = state;
            mat.color = lit ? color : offColor;
            mat.SetColor("_EmissionColor", lit ? color * intensity : Color.black);
        }
    }
}
