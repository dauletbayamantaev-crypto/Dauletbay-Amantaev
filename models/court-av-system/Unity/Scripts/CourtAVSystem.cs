using UnityEngine;
using UnityEngine.Events;

namespace CourtAV
{
    /// <summary>
    /// Put this on the root of the imported CourtAVSystem model. On start it finds the parts by name,
    /// adds the behaviours, colliders and audio sources, and wires every key to its function.
    /// Nothing else has to be set up by hand; the fields below are optional extras.
    /// </summary>
    [DisallowMultipleComponent]
    public class CourtAVSystem : MonoBehaviour
    {
        [Tooltip("Optional screen (e.g. a monitor quad) that shows the camera feed during a videoconference.")]
        public Renderer monitorScreen;
        [Tooltip("Optional incoming voice of the remote participant during a videoconference.")]
        public AudioClip remoteParticipantAudio;
        [Tooltip("Record the hearing to a WAV file while the speakerphone is on.")]
        public bool recordAudio = true;
        [Tooltip("Turn the speakerphone on when the scene starts.")]
        public bool powerOnAtStart = false;

        public CourtSpeakerphone Speakerphone { get; private set; }
        public CourtCamera VideoCamera { get; private set; }
        public IdCardReader Reader { get; private set; }

        Collider cardCollider;

        void Awake()
        {
            Transform spk = Need("Speakerphone");
            Speakerphone = GetOrAdd<CourtSpeakerphone>(spk.gameObject);
            Speakerphone.ledRing = GetOrAdd<LedIndicator>(Need("Speakerphone_LEDRing").gameObject);
            Speakerphone.recordOnPowerOn = recordAudio;
            if (remoteParticipantAudio != null) Speakerphone.remoteParticipantAudio = remoteParticipantAudio;

            VideoCamera = GetOrAdd<CourtCamera>(Need("Camera_Head").gameObject);
            VideoCamera.recLed = GetOrAdd<LedIndicator>(Need("Camera_RecLED").gameObject);
            if (monitorScreen != null) VideoCamera.monitorScreen = monitorScreen;
            Speakerphone.videoCamera = VideoCamera;

            Transform pad = Need("IdReader_Pad");
            BoxCollider zone = GetOrAdd<BoxCollider>(pad.gameObject);
            zone.isTrigger = true;
            zone.center += new Vector3(0f, 0.012f, 0f);                // detect a card lying on the pad
            zone.size += new Vector3(0.004f, 0.024f, 0.004f);
            Reader = GetOrAdd<IdCardReader>(pad.gameObject);
            Reader.statusLed = GetOrAdd<LedIndicator>(Need("IdReader_LED").gameObject);

            Transform card = Find("IdCard");
            if (card != null)
            {
                GetOrAdd<IdCard>(card.gameObject);
                cardCollider = GetOrAdd<BoxCollider>(card.gameObject);
                Rigidbody rb = GetOrAdd<Rigidbody>(card.gameObject);
                rb.mass = 0.005f;
            }

            Wire("Btn_Power", Speakerphone.TogglePower);
            Wire("Btn_Mute", Speakerphone.ToggleMute);
            Wire("Btn_VolumeUp", Speakerphone.VolumeUp);
            Wire("Btn_VolumeDown", Speakerphone.VolumeDown);
            Wire("Btn_Call", Speakerphone.ToggleCall);
            Wire("Btn_ReaderConfirm", Reader.Announce);
            Wire("Btn_ReaderClear", Reader.Clear);
        }

        void Start()
        {
            if (powerOnAtStart) Speakerphone.PowerOn();
        }

        void Wire(string name, UnityAction action)
        {
            Transform t = Find(name);
            if (t == null)
            {
                Debug.LogWarning("[CourtAVSystem] Key not found: " + name);
                return;
            }
            BoxCollider col = GetOrAdd<BoxCollider>(t.gameObject);
            col.isTrigger = true;
            if (cardCollider != null) Physics.IgnoreCollision(cardCollider, col);   // the card only talks to the pad
            GetOrAdd<DeviceButton>(t.gameObject).onPressed.AddListener(action);
        }

        Transform Need(string name)
        {
            Transform t = Find(name);
            if (t == null) Debug.LogError("[CourtAVSystem] Part not found in the model: " + name);
            return t;
        }

        Transform Find(string name)
        {
            return FindDeep(transform, name);
        }

        static Transform FindDeep(Transform t, string name)
        {
            if (t.name == name) return t;
            foreach (Transform child in t)
            {
                Transform hit = FindDeep(child, name);
                if (hit != null) return hit;
            }
            return null;
        }

        static T GetOrAdd<T>(GameObject go) where T : Component
        {
            T c = go.GetComponent<T>();
            return c != null ? c : go.AddComponent<T>();
        }
    }
}
