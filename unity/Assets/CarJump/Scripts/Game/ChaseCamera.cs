using UnityEngine;

namespace CarJump
{
    /// Arabanın arkasında ve üstünde duran takip kamerası.
    /// Kamera arabaya göre bir ofsette durur ve yalnızca ofset yumuşatılır; böylece 300 km/sa'te bile geride kalmaz.
    /// Hız hissi: hızla açılan görüş açısı, nitroda geri savrulma (yay), hıza bağlı titreşim ve hafif yatış.
    [RequireComponent(typeof(Camera))]
    public class ChaseCamera : MonoBehaviour
    {
        public enum Shot { Showroom, Ready, Ground, Flight, Wreck }

        [Header("Mesafeler (m)")]
        public float groundDistance = 5.0f, groundHeight = 1.45f;
        public float flightDistance = 8f, flightHeight = 2.7f;
        public float readyDistance = 8.6f, readyHeight = 3f;
        public float wreckDistance = 13f, wreckHeight = 6f;

        [Header("Görüş açısı")]
        public float baseFov = 56f, portraitFovBonus = 10f, fovPerKmh = 0.085f, nitroFov = 9f, maxFov = 104f;

        [Header("Sarsıntı")]
        public float speedShake = 0.06f, nitroShake = 0.045f;

        public Camera Cam { get; private set; }
        Vector3 off, lookOff;
        float heading, kick, kickV, shake, fov;
        Vector3 showroomCenter;

        void Awake() { Cam = GetComponent<Camera>(); fov = Cam.fieldOfView; }

        public void NitroKick(float amount) => kickV += amount;
        public void Shake(float amount) => shake = Mathf.Max(shake, amount);
        public void SetShowroom(Vector3 center) => showroomCenter = center;

        /// focus: arabanın merkezi; headingRad: hareket yönünün açısı (fizik düzleminde); kmh: hız.
        public void Follow(Shot shot, Vector3 focus, float headingRad, float kmh, bool nitro, bool onGround, float dt, bool snap = false)
        {
            kickV += (-30f * kick - 7f * kickV) * dt;
            kick += kickV * dt;
            bool portrait = Cam.aspect < 1f;
            bool landscapeLow = Cam.aspect > 1.4f && Screen.height < 900;

            if (shot == Shot.Showroom)
            {
                float a = Time.time * 0.22f, R = portrait ? 10.5f : 8.4f;
                var p = showroomCenter + new Vector3(Mathf.Cos(a) * R, (portrait ? 2f : 1.7f) + Mathf.Sin(Time.time * 0.3f) * 0.2f, Mathf.Sin(a) * R);
                transform.position = Vector3.Lerp(transform.position, p, 1 - Mathf.Exp(-dt * 3));
                transform.LookAt(showroomCenter + Vector3.up * (portrait ? -0.9f : 0.3f));
                SetFov(portrait ? 58 : 46, dt, 2);
                return;
            }

            float sp = kmh / 3.6f;
            float dist, height, ahead, lookUp, side = 0;
            switch (shot)
            {
                case Shot.Ready: dist = readyDistance; height = readyHeight; ahead = 18; lookUp = -1.2f; break;
                case Shot.Wreck: dist = wreckDistance; height = wreckHeight; ahead = 0; lookUp = 0; break;
                case Shot.Flight: dist = flightDistance + kick; height = flightHeight; ahead = 30; lookUp = landscapeLow ? -6 : -4; side = 0.5f; break;
                default: dist = groundDistance + sp * 0.012f + kick; height = groundHeight + sp * 0.005f; ahead = 18 + sp * 0.15f; lookUp = landscapeLow ? -1.6f : -0.2f; break;
            }
            if (shot != Shot.Wreck) heading = snap ? headingRad : Mathf.LerpAngle(heading * Mathf.Rad2Deg, headingRad * Mathf.Rad2Deg, 1 - Mathf.Exp(-dt * 3.5f)) * Mathf.Deg2Rad;
            var h = new Vector3(Mathf.Cos(heading), Mathf.Sin(heading), 0);
            var wantOff = -h * dist + Vector3.up * height + Vector3.forward * side * dist * 0.3f;
            var wantLook = h * ahead + Vector3.up * (lookUp + 0.4f);
            off = snap ? wantOff : Vector3.Lerp(off, wantOff, 1 - Mathf.Exp(-dt * 3));
            lookOff = snap ? wantLook : Vector3.Lerp(lookOff, wantLook, 1 - Mathf.Exp(-dt * 5));

            var pos = focus + off;
            var look = focus + lookOff;
            // Hıza bağlı sürekli titreşim
            float amp = Mathf.Clamp01((kmh - 90) / 260f) * (onGround ? speedShake : speedShake * 0.4f) + (nitro ? nitroShake : 0) + shake * 0.35f;
            float t = Time.time;
            pos += new Vector3((Mathf.Sin(t * 53) + Mathf.Sin(t * 31.7f)) * 0.5f, (Mathf.Sin(t * 47.3f) + Mathf.Sin(t * 23.1f)) * 0.5f, Mathf.Sin(t * 39.9f) * 0.5f) * amp;
            shake = Mathf.Max(0, shake - dt * 1.8f);
            transform.position = pos;
            transform.LookAt(look);
            transform.Rotate(0, 0, Mathf.Sin(t * 17) * amp * 7f, Space.Self);

            float target = shot == Shot.Ready ? baseFov + 2 : Mathf.Min(maxFov, baseFov + (portrait ? portraitFovBonus : 0) + Mathf.Clamp(kmh - 60, 0, 300) * fovPerKmh + (nitro ? nitroFov : 0));
            SetFov(target, dt, nitro ? 5 : 2.5f);
        }

        void SetFov(float target, float dt, float rate)
        {
            fov = Mathf.Lerp(fov, target, 1 - Mathf.Exp(-dt * rate));
            Cam.fieldOfView = fov;
        }

        /// Kameranın yerin içine girmesini önler.
        public void ClampAbove(System.Func<float, float, float> groundY, float margin = 1f)
        {
            var p = transform.position;
            float gy = groundY(p.x, p.z) + margin;
            if (p.y < gy) transform.position = new Vector3(p.x, gy, p.z);
        }
    }
}
