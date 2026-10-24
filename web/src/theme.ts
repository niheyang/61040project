import { onMounted, onUnmounted, readonly, ref } from "vue";

type Theme = "light" | "dark";
const storageKey = "catchup-theme";

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function useTheme() {
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = savedTheme();
  const theme = ref<Theme>(preference ?? (system.matches ? "dark" : "light"));

  function apply(next: Theme) {
    theme.value = next;
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#0b2134" : "#edf8fa");
  }

  function toggleTheme() {
    preference = theme.value === "dark" ? "light" : "dark";
    apply(preference);
    try {
      localStorage.setItem(storageKey, preference);
    } catch {
      // The switch still works when browser storage is unavailable.
    }
  }

  function followSystem() {
    if (preference === null) apply(system.matches ? "dark" : "light");
  }

  function syncTabs(event: StorageEvent) {
    if (event.key !== storageKey && event.key !== null) return;
    preference = savedTheme();
    apply(preference ?? (system.matches ? "dark" : "light"));
  }

  apply(theme.value);
  onMounted(() => {
    system.addEventListener("change", followSystem);
    window.addEventListener("storage", syncTabs);
  });
  onUnmounted(() => {
    system.removeEventListener("change", followSystem);
    window.removeEventListener("storage", syncTabs);
  });

  return { theme: readonly(theme), toggleTheme };
}
