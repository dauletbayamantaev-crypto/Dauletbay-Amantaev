using UnityEngine;
using UnityEngine.Events;

namespace CourtAV
{
    /// <summary>
    /// A physical key on the device. It is pressed by a VR hand/controller collider (any collider with a
    /// Rigidbody, or only ones with <see cref="presserTag"/>), by a mouse click in the editor, or by calling
    /// <see cref="Press"/> (for example from an XR Simple Interactable "Select Entered" event).
    /// The key dips along its own up axis, which the model sets to the surface normal.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class DeviceButton : MonoBehaviour
    {
        [Tooltip("Travel of the key when pressed, in metres.")]
        public float pressDepth = 0.0015f;
        public float pressTime = 0.14f;
        [Tooltip("Only colliders with this tag press the key. Empty: any collider that has a Rigidbody.")]
        public string presserTag = "";
        public float cooldown = 0.3f;
        public UnityEvent onPressed = new UnityEvent();

        Vector3 restLocalPos;
        float lastPress = -10f;
        float anim;

        void Awake()
        {
            restLocalPos = transform.localPosition;
        }

        public void Press()
        {
            if (Time.time - lastPress < cooldown) return;
            lastPress = Time.time;
            anim = 1f;
            onPressed.Invoke();
        }

        void OnMouseDown()
        {
            Press();
        }

        void OnTriggerEnter(Collider other)
        {
            if (!string.IsNullOrEmpty(presserTag))
            {
                if (!other.CompareTag(presserTag)) return;
            }
            else if (other.attachedRigidbody == null)
            {
                return;
            }
            Press();
        }

        void Update()
        {
            if (anim <= 0f) return;
            anim = Mathf.Max(0f, anim - Time.deltaTime / pressTime);
            float k = Mathf.Sin(anim * Mathf.PI);
            Vector3 up = transform.parent != null ? transform.parent.InverseTransformDirection(transform.up) : transform.up;
            transform.localPosition = restLocalPos - up * (pressDepth * k);
        }
    }
}
