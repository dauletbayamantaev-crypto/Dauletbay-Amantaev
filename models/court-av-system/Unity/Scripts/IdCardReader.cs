using UnityEngine;
using UnityEngine.Events;

namespace CourtAV
{
    /// <summary>
    /// NFC reader for identifying hearing participants. Lives on the reader pad, which carries a trigger
    /// collider: laying an <see cref="IdCard"/> on the pad reads it, the LED turns green and a tone sounds.
    /// Confirm key repeats the last identification; clear key resets the reader.
    /// </summary>
    public class IdCardReader : MonoBehaviour
    {
        public LedIndicator statusLed;
        public Color okColor = new Color(0.1f, 1f, 0.35f);
        public Color emptyColor = new Color(1f, 0.55f, 0.05f);
        public StringEvent onIdentified = new StringEvent();
        public UnityEvent onCleared = new UnityEvent();

        public IdCard LastCard { get; private set; }
        public string LastMessage { get; private set; }

        AudioSource beeper;
        AudioClip okBeep, errorBeep;
        float lastRead = -10f;

        void Awake()
        {
            beeper = gameObject.AddComponent<AudioSource>();
            beeper.playOnAwake = false;
            beeper.spatialBlend = 1f;
            okBeep = ToneBeep.Create("reader_ok", 1760f, 0.16f, 2);
            errorBeep = ToneBeep.Create("reader_error", 440f, 0.25f);
            LastMessage = "";
        }

        void OnTriggerEnter(Collider other)
        {
            IdCard card = other.GetComponentInParent<IdCard>();
            if (card == null || Time.time - lastRead < 0.5f) return;
            Read(card);
        }

        public void Read(IdCard card)
        {
            lastRead = Time.time;
            LastCard = card;
            LastMessage = "Shaxs tasdiqlandi: " + card.fullName + " (" + card.role + "), hujjat " + card.documentNumber;
            if (statusLed != null) statusLed.Set(okColor);
            beeper.PlayOneShot(okBeep);
            Debug.Log("[IdCardReader] " + LastMessage);
            onIdentified.Invoke(LastMessage);
        }

        /// <summary>Confirm key: repeats the last identification, or signals that no card was read.</summary>
        public void Announce()
        {
            if (LastCard != null)
            {
                Read(LastCard);
                return;
            }
            if (statusLed != null) statusLed.Set(emptyColor, 3f);
            beeper.PlayOneShot(errorBeep);
        }

        public void Clear()
        {
            LastCard = null;
            LastMessage = "";
            if (statusLed != null) statusLed.Set(Color.black);
            onCleared.Invoke();
        }
    }
}
