using UnityEngine;

namespace CarJump
{
    /// Kısa titreşimler: nitro, kalkış, iniş, çarpma. Android'de süre ayarlı; iOS'ta Unity'nin standart titreşimi.
    public static class Haptics
    {
        public static bool Enabled = true;
#if UNITY_ANDROID && !UNITY_EDITOR
        static AndroidJavaObject vibrator;
        static int sdk = -1;
#endif

        public static void Pulse(int milliseconds)
        {
            if (!Enabled || milliseconds <= 0) return;
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                if (vibrator == null)
                {
                    using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                    using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                        vibrator = activity.Call<AndroidJavaObject>("getSystemService", "vibrator");
                    using (var ver = new AndroidJavaClass("android.os.Build$VERSION")) sdk = ver.GetStatic<int>("SDK_INT");
                }
                if (sdk >= 26)
                {
                    using (var effect = new AndroidJavaClass("android.os.VibrationEffect"))
                    {
                        var e = effect.CallStatic<AndroidJavaObject>("createOneShot", (long)milliseconds, -1);
                        vibrator.Call("vibrate", e);
                    }
                }
                else vibrator.Call("vibrate", (long)milliseconds);
            }
            catch (System.Exception) { /* titreşim yoksa sessizce geç */ }
#elif UNITY_IOS && !UNITY_EDITOR
            if (milliseconds >= 60) Handheld.Vibrate();
#endif
        }
    }
}
