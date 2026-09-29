using System;
using System.IO;
using UnityEngine;

namespace CourtAV
{
    /// <summary>
    /// Courtroom camera. While streaming (videoconference) a lens camera renders the view into a
    /// RenderTexture that can be shown on a monitor, and the red REC LED blinks.
    /// <see cref="SaveSnapshot"/> stores a still frame as PNG (photo record of the session).
    /// The head can be turned to aim at the speaker; the lens looks along the head's +Z.
    /// </summary>
    public class CourtCamera : MonoBehaviour
    {
        public LedIndicator recLed;
        [Tooltip("Optional screen renderer that shows the camera feed while streaming.")]
        public Renderer monitorScreen;
        public RenderTexture target;
        public int width = 1280;
        public int height = 720;
        public float fieldOfView = 62f;
        public string snapshotsFolder = "CourtSnapshots";
        public Color recColor = new Color(1f, 0.08f, 0.05f);

        public Camera LensCamera { get; private set; }
        public bool IsStreaming { get; private set; }

        void Start()
        {
            Ensure();
        }

        void Ensure()
        {
            if (LensCamera != null) return;
            GameObject go = new GameObject("LensCamera");
            go.transform.SetParent(transform, false);
            MeshFilter mf = GetComponent<MeshFilter>();
            if (mf != null && mf.sharedMesh != null)
            {
                Bounds b = mf.sharedMesh.bounds;                    // lens = front of the head
                go.transform.localPosition = new Vector3(b.center.x, b.center.y, b.max.z + 0.002f);
            }
            LensCamera = go.AddComponent<Camera>();
            LensCamera.enabled = false;
            LensCamera.fieldOfView = fieldOfView;
            LensCamera.nearClipPlane = 0.02f;
            LensCamera.stereoTargetEye = StereoTargetEyeMask.None;   // never render to the VR headset
            if (target == null)
            {
                target = new RenderTexture(width, height, 24);
                target.name = "CourtCameraFeed";
            }
            LensCamera.targetTexture = target;
        }

        public void SetStreaming(bool on)
        {
            Ensure();
            IsStreaming = on;
            LensCamera.enabled = on;
            if (monitorScreen != null) monitorScreen.material.mainTexture = on ? target : null;
            if (recLed != null) recLed.Set(on ? recColor : Color.black, on ? 1f : 0f);
        }

        /// <returns>Path of the saved PNG.</returns>
        public string SaveSnapshot()
        {
            Ensure();
            RenderTexture previous = RenderTexture.active;
            LensCamera.Render();
            RenderTexture.active = target;
            Texture2D tex = new Texture2D(target.width, target.height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0);
            tex.Apply();
            RenderTexture.active = previous;
            string dir = Path.Combine(Application.persistentDataPath, snapshotsFolder);
            Directory.CreateDirectory(dir);
            string path = Path.Combine(dir, "kadr_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".png");
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Destroy(tex);
            Debug.Log("[CourtCamera] Snapshot saved: " + path);
            return path;
        }
    }
}
