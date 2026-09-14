# Advanced Theming & CSS Configuration in Tailwind v4

Comprehensive guide to advanced theming, `@theme` options, custom utilities, and native CSS variables in Tailwind CSS v4.

## Custom Utilities with `@utility`

Define reusable custom utilities directly in your CSS:

```css
/* Custom utility for decorative lines */
@utility line-t {
  @apply relative before:absolute before:top-0 before:-left-[100vw] before:h-px before:w-[200vw] before:bg-gray-950/5 dark:before:bg-white/10;
}

/* Custom utility for text gradients */
@utility text-gradient {
  @apply bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent;
}
```

## Theme Modifiers

### 1. `@theme inline`
Use `@theme inline` when referencing CSS variables defined elsewhere or via font loaders (e.g. Next.js font variables):

```css
@theme inline {
  --font-sans: var(--font-inter), system-ui, sans-serif;
}
```

### 2. `@theme static`
Use `@theme static` to always generate CSS variables even when unused in utility classes:

```css
@theme static {
  --color-brand: oklch(65% 0.15 240);
}

/* Import with theme options */
@import "tailwindcss" theme(static);
```

## Namespace Overrides

```css
@theme {
  /* Clear all default colors and define your own strict palette */
  --color-*: initial;
  --color-white: #fff;
  --color-black: #000;
  --color-primary: oklch(45% 0.2 260);
  --color-secondary: oklch(65% 0.15 200);

  /* Clear ALL defaults for an absolute minimal setup */
  /* --*: initial; */
}
```

## Semi-transparent Color Variants

Use standard CSS `color-mix()` for alpha opacity variants of semantic tokens:

```css
@theme {
  --color-primary-50: color-mix(in oklab, var(--color-primary) 5%, transparent);
  --color-primary-100: color-mix(in oklab, var(--color-primary) 10%, transparent);
  --color-primary-200: color-mix(in oklab, var(--color-primary) 20%, transparent);
}
```

## Container Queries

Configure custom container query breakpoints:

```css
@theme {
  --container-xs: 20rem;
  --container-sm: 24rem;
  --container-md: 28rem;
  --container-lg: 32rem;
}
```
