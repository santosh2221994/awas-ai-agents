# Tailwind CSS v3 to v4 Migration Guide

Comprehensive checklist and mapping for upgrading projects from Tailwind CSS v3 to v4.

## Key Changes Summary

| v3 Pattern                            | v4 Pattern                                                            |
| ------------------------------------- | --------------------------------------------------------------------- |
| `tailwind.config.ts`                  | `@theme` in CSS                                                       |
| `@tailwind base/components/utilities` | `@import "tailwindcss"`                                               |
| `darkMode: "class"`                   | `@custom-variant dark (&:where(.dark, .dark *))`                      |
| `theme.extend.colors`                 | `@theme { --color-*: value }`                                         |
| `require("tailwindcss-animate")`      | CSS `@keyframes` in `@theme` + `@starting-style` for entry animations |
| `h-10 w-10`                           | `size-10`                                                             |
| `React.forwardRef`                    | Direct `ref` prop (React 19)                                          |

## Migration Checklist

- [ ] Replace `tailwind.config.ts` with CSS `@theme` block
- [ ] Change `@tailwind base/components/utilities` to `@import "tailwindcss"`
- [ ] Move color definitions to `@theme { --color-*: value }`
- [ ] Replace `darkMode: "class"` with `@custom-variant dark (&:where(.dark, .dark *))`
- [ ] Move `@keyframes` inside `@theme` blocks (ensures keyframes output with theme)
- [ ] Replace `require("tailwindcss-animate")` with native CSS animations and `@starting-style`
- [ ] Update width/height combinations (`w-10 h-10`) to `size-10`
- [ ] Remove `forwardRef` in components targeting React 19
- [ ] Consider OKLCH colors for better perceptual uniformity
- [ ] Replace custom JavaScript plugins with `@utility` directives in CSS
