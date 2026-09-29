using System;
using System.IO;
using UnityEngine;

namespace CourtAV
{
    /// <summary>Streams 16-bit PCM audio to a .wav file, so hours of a hearing never sit in memory.</summary>
    public sealed class WavWriter : IDisposable
    {
        readonly FileStream stream;
        readonly BinaryWriter writer;
        long dataBytes;

        public string Path { get; private set; }
        public int SampleRate { get; private set; }
        public int Channels { get; private set; }
        public long SampleCount { get { return dataBytes / (2 * Channels); } }

        public WavWriter(string path, int sampleRate, int channels)
        {
            Path = path;
            SampleRate = sampleRate;
            Channels = Math.Max(1, channels);
            stream = new FileStream(path, FileMode.Create, FileAccess.Write);
            writer = new BinaryWriter(stream);
            WriteHeader(0);
        }

        /// <summary>Writes <paramref name="count"/> interleaved samples in the range -1..1.</summary>
        public void Write(float[] samples, int count)
        {
            for (int i = 0; i < count; i++)
            {
                float s = Mathf.Clamp(samples[i], -1f, 1f);
                writer.Write((short)(s * 32767f));
            }
            dataBytes += 2L * count;
        }

        void WriteHeader(long data)
        {
            writer.Write(new[] { 'R', 'I', 'F', 'F' });
            writer.Write((int)(36 + data));
            writer.Write(new[] { 'W', 'A', 'V', 'E', 'f', 'm', 't', ' ' });
            writer.Write(16);                                  // PCM chunk size
            writer.Write((short)1);                            // PCM
            writer.Write((short)Channels);
            writer.Write(SampleRate);
            writer.Write(SampleRate * Channels * 2);           // byte rate
            writer.Write((short)(Channels * 2));               // block align
            writer.Write((short)16);                           // bits per sample
            writer.Write(new[] { 'd', 'a', 't', 'a' });
            writer.Write((int)data);
        }

        public void Dispose()
        {
            writer.Flush();
            stream.Seek(0, SeekOrigin.Begin);
            WriteHeader(dataBytes);
            writer.Flush();
            writer.Close();
        }
    }
}
