using UnityEngine;

namespace CourtAV
{
    /// <summary>Data carried by an ID card (the sample card in the model gets one automatically).
    /// Add it to any other card object to make it readable by the <see cref="IdCardReader"/>.</summary>
    public class IdCard : MonoBehaviour
    {
        public string fullName = "Namuna Shaxs";
        public string role = "Guvoh";
        public string documentNumber = "AA0000000";
    }
}
