import { useEffect, useRef } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Keeps keyboard focus inside a custom modal and restores it when the modal closes. */
export function useDialogFocus(onEscape?: () => void) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const scope = scopeRef.current;
    if (!scope) return;

    const focusables = () => Array.from(
      scope.querySelectorAll<HTMLElement>(focusableSelector),
    ).filter((element) => element.offsetParent !== null);

    window.requestAnimationFrame(() => {
      const preferred = scope.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? focusables()[0] ?? scope).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        scope.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    scope.addEventListener("keydown", handleKeyDown);
    return () => {
      scope.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return scopeRef;
}
