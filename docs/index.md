---
layout: home
hero:
    name: FS Packages
    text: Shared frontend services
    tagline: A collection of framework-agnostic and Vue-powered service packages built by Script Development.
    actions:
        - theme: brand
          text: Get Started
          link: /getting-started
        - theme: alt
          text: View on GitHub
          link: https://github.com/script-development/fs-packages
        - theme: alt
          text: Browse on npm
          link: https://www.npmjs.com/org/script-development

features:
    - title: Factory Pattern
      details: Every package exports a createXxxService() factory that returns a plain object. No classes, no singletons, no hidden state. You control when and where services are created.
    - title: Loose Coupling
      details: Packages communicate through structural typing (duck types), not direct imports. Swap implementations without changing consumers. fs-theme doesn't import fs-storage — it accepts anything with get() and put().
    - title: Middleware Architecture
      details: HTTP, loading, dialog, and router all support composable middleware pipelines. Register a handler, get an unregister function back. Stack behaviors without modifying source code.
    - title: 100% Test Coverage
      details: Every package is held to 100% code coverage, and every package with a Stryker config to a 90% mutation score. Every pull request runs the full CI gate set — audit, format, lint, build, tarball and docs validation, typecheck, package lint, coverage, mutation testing and a real-browser lane.
    - title: Component Agnostic
      details: Toast and dialog services manage lifecycle and state — you bring your own Vue components. No opinionated UI. Your design system, our plumbing.
    - title: Type Safe
      details: Built with TypeScript 6.0+ in strict mode. Router navigation is type-checked against your route definitions. Translation keys are validated at compile time. No stringly-typed APIs.
---

## The Packages

All packages are published under the `@script-development` scope on npm.

### Foundation

These packages have zero Vue dependency — they work in any TypeScript project.

| Package                         | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| [fs-http](/packages/http)       | HTTP service factory with middleware architecture                 |
| [fs-storage](/packages/storage) | localStorage service factory with prefix namespacing              |
| [fs-helpers](/packages/helpers) | Tree-shakeable utilities: deep copy, type guards, case conversion |

### Services

Vue-powered reactive services for common application concerns.

| Package                                 | Description                                                               |
| --------------------------------------- | ------------------------------------------------------------------------- |
| [fs-theme](/packages/theme)             | Reactive dark/light mode with system preference detection                 |
| [fs-auth](/packages/auth)               | Sanctum SPA-cookie session store, safe-redirect guard and auth registrars |
| [fs-loading](/packages/loading)         | Loading state service with HTTP middleware integration                    |
| [fs-toast](/packages/toast)             | Component-agnostic toast notification queue                               |
| [fs-dialog](/packages/dialog)           | Component-agnostic dialog stack with error middleware                     |
| [fs-form](/packages/form)               | Double-submit guard plus 422 validation-error binding for fs-http         |
| [fs-translation](/packages/translation) | Type-safe reactive i18n with multi-locale support                         |

### Domain

Higher-level packages for domain-driven application architecture.

| Package                                                   | Description                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [fs-adapter-store](/packages/adapter-store)               | Reactive state management with CRUD resource adapters                                  |
| [fs-cached-adapter-store](/packages/cached-adapter-store) | fs-adapter-store that refetches only when the server's hash for the collection changes |
| [fs-router](/packages/router)                             | Type-safe router with CRUD navigation and middleware pipeline                          |

### UI Components

Themeable Vue components (the `ui-*` family) — behaviour and accessibility in the package, all styling through a CSS custom-property contract you map your design tokens onto. ui-inputs is headless; ui-form ships a default look on that contract.

| Package                          | Description                                                                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ui-form](/packages/ui-form)     | Form state and form controls in one package: `useForm` hands out controls bound to the form by name (`<TextField name>`), typed against the draft, plus the ui-inputs controls with a default look, themed via `--ui-*` variables |
| [ui-inputs](/packages/ui-inputs) | Headless UI components — field/label/error, text/number/date/textarea, checkbox/switch/radio, select/combobox/multi-select, plus the valueless controls `Pressable` / `Disclosure` — themed via `--ui-*` variables                |

### Integrations

Packages integrating a third-party platform. Runtime differs per package — `fs-cloudflare` runs in your server process (Express SSR/API), not the browser.

| Package                               | Description                                                             |
| ------------------------------------- | ----------------------------------------------------------------------- |
| [fs-cloudflare](/packages/cloudflare) | Express middleware gating inbound traffic to Cloudflare's egress ranges |

## Quality Guarantees

Every pull request runs the full CI gate set. [Contributing](/contributing#the-ci-pipeline) lists each gate with its command.

- **Security audit** — `npm audit` for known vulnerabilities
- **Formatting** — oxfmt enforces consistent code style
- **Linting** — oxlint catches bugs and anti-patterns
- **Build** — tsdown compiles to dual ESM + CJS output
- **Tarball validation** — every file a manifest promises ships in the tarball, non-empty
- **Release-pipeline validation** — the publish workflow's invariants hold
- **Docs validation** — every publishable package has a page, a sidebar entry, a row on this page and an install line, and none of those names a package that does not exist
- **Type checking** — TypeScript strict mode, no implicit any
- **Package lint** — publint and attw verify package exports are correct
- **Coverage** — 100% code coverage via vitest, for every package
- **Mutation testing** — a 90% mutation score via Stryker, for every package with a Stryker config
- **Browser tests** — behaviour a simulated DOM cannot show, plus axe-core audits, in real Chromium
