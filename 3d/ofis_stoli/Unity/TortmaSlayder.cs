using UnityEngine;

/// <summary>
/// Tortmani faqat o'z o'qi bo'ylab (lokal -Z, ya'ni o'tiruvchi tomonga) harakatlantiradi
/// va 0..maxOchilish oralig'ida ushlab turadi.
///
/// Istalgan VR toolkit bilan ishlaydi (XR Interaction Toolkit - XR Grab Interactable,
/// Movement Type = Velocity Tracking, Track Rotation o'chiq; Meta Interaction SDK va h.k.).
/// Tortma obyekti "OfisStoli" ning bevosita bolasi bo'lishi kerak (FBX dagi ierarxiya).
/// </summary>
[RequireComponent(typeof(Rigidbody))]
public class TortmaSlayder : MonoBehaviour
{
    [Tooltip("Tortma qancha tortib chiqariladi (metr). Ong_1/Ong_2/Chap_1: 0.45, Ong_3: 0.50, Markaz: 0.35")]
    public float maxOchilish = 0.45f;

    [Tooltip("Qo'yib yuborilgandan keyin sekinlashish (ishqalanish)")]
    public float ishqalanish = 6f;

    Rigidbody rb;
    Transform ota;
    Vector3 yopiqHolat;
    Quaternion yopiqAylanish;

    void Awake()
    {
        rb = GetComponent<Rigidbody>();
        ota = transform.parent;
        yopiqHolat = transform.localPosition;
        yopiqAylanish = transform.localRotation;
        rb.useGravity = false;
        rb.interpolation = RigidbodyInterpolation.Interpolate;
#if UNITY_6000_0_OR_NEWER
        rb.linearDamping = ishqalanish;
#else
        rb.drag = ishqalanish;
#endif
    }

    void FixedUpdate()
    {
        Vector3 lokal = ota.InverseTransformPoint(rb.position);
        float d = Mathf.Clamp(yopiqHolat.z - lokal.z, 0f, maxOchilish);
        rb.position = ota.TransformPoint(yopiqHolat + Vector3.back * d);
        rb.rotation = ota.rotation * yopiqAylanish;

        Vector3 oq = ota.TransformDirection(Vector3.back);
#if UNITY_6000_0_OR_NEWER
        float v = Vector3.Dot(rb.linearVelocity, oq);
        if ((d <= 0f && v < 0f) || (d >= maxOchilish && v > 0f)) v = 0f;
        rb.linearVelocity = oq * v;
#else
        float v = Vector3.Dot(rb.velocity, oq);
        if ((d <= 0f && v < 0f) || (d >= maxOchilish && v > 0f)) v = 0f;
        rb.velocity = oq * v;
#endif
        rb.angularVelocity = Vector3.zero;
    }
}
