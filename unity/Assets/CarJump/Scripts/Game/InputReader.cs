using UnityEngine;
using UnityEngine.EventSystems;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CarJump
{
    /// Tek parmak girdisi: ekrana basılı mı? Hem yeni Input System hem eski Input Manager ile çalışır.
    /// Arayüz düğmelerinin üstündeki dokunuşlar oyuna sayılmaz.
    public static class InputReader
    {
        public static bool Held()
        {
            bool held = false;
#if ENABLE_INPUT_SYSTEM
            if (Touchscreen.current != null)
            {
                foreach (var t in Touchscreen.current.touches)
                    if (t.press.isPressed && !OverUi(t.touchId.ReadValue())) { held = true; break; }
            }
            if (!held && Mouse.current != null && Mouse.current.leftButton.isPressed && !OverUi(-1)) held = true;
            if (!held && Keyboard.current != null && Keyboard.current.spaceKey.isPressed) held = true;
#elif ENABLE_LEGACY_INPUT_MANAGER
            for (int i = 0; i < Input.touchCount; i++)
            {
                var t = Input.GetTouch(i);
                if (t.phase != TouchPhase.Ended && t.phase != TouchPhase.Canceled && !OverUi(t.fingerId)) { held = true; break; }
            }
            if (!held && Input.GetMouseButton(0) && !OverUi(-1)) held = true;
            if (!held && Input.GetKey(KeyCode.Space)) held = true;
#endif
            return held;
        }

        static bool OverUi(int pointerId)
        {
            var es = EventSystem.current;
            if (es == null) return false;
            return pointerId >= 0 ? es.IsPointerOverGameObject(pointerId) : es.IsPointerOverGameObject();
        }
    }
}
