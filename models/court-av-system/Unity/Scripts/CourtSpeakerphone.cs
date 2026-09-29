using System;
using System.IO;
using UnityEngine;

namespace CourtAV
{
    /// <summary>
    /// Conference speakerphone of the courtroom.
    ///  • Power  — opens the session: the microphone array records the hearing to a WAV file (audio protocol).
    ///  • Mute   — the microphone is cut; silence goes into the recording so its timeline stays intact.
    ///  • Vol +/− — loudness of the speaker (remote participants, signal tones).
    ///  • Call   — videoconference: the camera starts streaming and the remote participant is heard.
    /// LED ring: off = power off, green = recording, blue = videoconference, red = muted,
    /// white = volume level for a moment after Vol +/−.
    /// </summary>
    public class CourtSpeakerphone : MonoBehaviour
    {
        [Header("Parts")]
        public LedIndicator ledRing;
        public CourtCamera videoCamera;
        [Tooltip("Incoming voice of the remote participant, played during a videoconference (optional).")]
        public AudioClip remoteParticipantAudio;

        [Header("Audio protocol")]
        public bool recordOnPowerOn = true;
        public int sampleRate = 16000;
        [Tooltip("Microphone device name; empty = system default.")]
        public string microphoneDevice = "";
        public string recordingsFolder = "CourtRecordings";

        [Header("Speaker")]
        [Range(0f, 1f)] public float volume = 0.6f;
        public float volumeStep = 0.1f;

        [Header("LED colours")]
        public Color colorRecording = new Color(0.1f, 1f, 0.35f);
        public Color colorCall = new Color(0.2f, 0.55f, 1f);
        public Color colorMuted = new Color(1f, 0.1f, 0.08f);

        [Header("Events")]
        public BoolEvent onPowerChanged = new BoolEvent();
        public BoolEvent onMuteChanged = new BoolEvent();
        public BoolEvent onCallChanged = new BoolEvent();
        public StringEvent onRecordingSaved = new StringEvent();

        public bool IsOn { get; private set; }
        public bool IsMuted { get; private set; }
        public bool InCall { get; private set; }
        public bool IsRecording { get { return writer != null; } }
        public float RecordedSeconds { get { return writer != null ? writer.SampleCount / (float)writer.SampleRate : 0f; } }
        public string LastRecordingPath { get; private set; }

        AudioSource speaker;
        AudioSource beeper;
        AudioClip beepOn, beepOff;
        AudioClip micClip;
        string micDevice;
        int readPos;
        float[] chunk;
        WavWriter writer;
        float flashUntil;

        void Awake()
        {
            speaker = gameObject.AddComponent<AudioSource>();
            speaker.playOnAwake = false;
            speaker.loop = true;
            speaker.spatialBlend = 1f;
            speaker.minDistance = 0.6f;
            beeper = gameObject.AddComponent<AudioSource>();
            beeper.playOnAwake = false;
            beeper.spatialBlend = 1f;
            beepOn = ToneBeep.Create("speakerphone_on", 1320f, 0.09f);
            beepOff = ToneBeep.Create("speakerphone_off", 660f, 0.12f);
        }

        void Start()
        {
            Refresh();
        }

        // ---------------------------------------------------------------- buttons
        public void TogglePower()
        {
            if (IsOn) PowerOff(); else PowerOn();
        }

        public void PowerOn()
        {
            if (IsOn) return;
            IsOn = true;
            beeper.volume = volume;
            beeper.PlayOneShot(beepOn);
            if (recordOnPowerOn) StartRecording();
            onPowerChanged.Invoke(true);
            Refresh();
        }

        public void PowerOff()
        {
            if (!IsOn) return;
            if (InCall) ToggleCall();
            StopRecording();
            IsOn = false;
            IsMuted = false;
            beeper.PlayOneShot(beepOff);
            onPowerChanged.Invoke(false);
            Refresh();
        }

        public void ToggleMute()
        {
            if (!IsOn) return;
            IsMuted = !IsMuted;
            beeper.PlayOneShot(IsMuted ? beepOff : beepOn);
            onMuteChanged.Invoke(IsMuted);
            Refresh();
        }

        public void VolumeUp() { ChangeVolume(volumeStep); }
        public void VolumeDown() { ChangeVolume(-volumeStep); }

        void ChangeVolume(float delta)
        {
            if (!IsOn) return;
            volume = Mathf.Clamp01(volume + delta);
            speaker.volume = volume;
            beeper.volume = volume;
            beeper.PlayOneShot(beepOn);
            flashUntil = Time.time + 1.2f;
            Refresh();
        }

        public void ToggleCall()
        {
            if (!IsOn) return;
            InCall = !InCall;
            if (videoCamera != null) videoCamera.SetStreaming(InCall);
            if (InCall && remoteParticipantAudio != null)
            {
                speaker.clip = remoteParticipantAudio;
                speaker.volume = volume;
                speaker.Play();
            }
            else
            {
                speaker.Stop();
            }
            onCallChanged.Invoke(InCall);
            Refresh();
        }

        // ---------------------------------------------------------------- audio protocol
        public void StartRecording()
        {
            if (writer != null) return;
            if (Microphone.devices.Length == 0)
            {
                Debug.LogWarning("[CourtSpeakerphone] No microphone found - the hearing is not being recorded.");
                return;
            }
            micDevice = string.IsNullOrEmpty(microphoneDevice) ? null : microphoneDevice;
            micClip = Microphone.Start(micDevice, true, 10, sampleRate);
            readPos = 0;
            string dir = Path.Combine(Application.persistentDataPath, recordingsFolder);
            Directory.CreateDirectory(dir);
            LastRecordingPath = Path.Combine(dir, "majlis_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".wav");
            writer = new WavWriter(LastRecordingPath, micClip.frequency, micClip.channels);
            Debug.Log("[CourtSpeakerphone] Recording the hearing to " + LastRecordingPath);
        }

        public void StopRecording()
        {
            if (writer == null) return;
            Pump();
            Microphone.End(micDevice);
            writer.Dispose();
            writer = null;
            micClip = null;
            Debug.Log("[CourtSpeakerphone] Hearing audio saved: " + LastRecordingPath);
            onRecordingSaved.Invoke(LastRecordingPath);
        }

        void Pump()
        {
            if (writer == null || micClip == null) return;
            int pos = Microphone.GetPosition(micDevice);
            int total = micClip.samples;
            int count = pos - readPos;
            if (count < 0) count += total;
            if (count <= 0) return;
            int first = Mathf.Min(count, total - readPos);
            CopyChunk(readPos, first);
            if (count > first) CopyChunk(0, count - first);
            readPos = pos;
        }

        void CopyChunk(int offset, int frames)
        {
            int n = frames * micClip.channels;
            if (chunk == null || chunk.Length != n) chunk = new float[n];
            micClip.GetData(chunk, offset);
            if (IsMuted) Array.Clear(chunk, 0, n);
            writer.Write(chunk, n);
        }

        void Update()
        {
            Pump();
            if (flashUntil > 0f && Time.time > flashUntil)
            {
                flashUntil = 0f;
                Refresh();
            }
        }

        void Refresh()
        {
            if (ledRing == null) return;
            if (!IsOn) ledRing.Set(Color.black);
            else if (flashUntil > 0f) ledRing.Set(Color.white * Mathf.Lerp(0.15f, 1f, volume));
            else if (IsMuted) ledRing.Set(colorMuted);
            else if (InCall) ledRing.Set(colorCall);
            else ledRing.Set(colorRecording);
        }

        void OnDisable()
        {
            StopRecording();
        }

        void OnApplicationQuit()
        {
            StopRecording();
        }
    }
}
