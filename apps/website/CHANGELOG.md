# @rapidkit/website

## 1.0.1

### Patch Changes

- ### Feature
  - Added documentation for `configuring Podman with China-based mirror sources`
  - Added `VitePress Tabs plugin`
  - Added `frontend project overview documentation`
  - Added a `quick installation guide`

  ### Fixed
  - Fixed incorrect navigation links for the `“Get Started”` and `“Introduction”` buttons in the documentation

## 1.0.0

### Major Changes

- 1319b05: ### Feature
  - Initialized VitePress documentation site
    - Configured `.vitepress/config.mts` with project title, logo, and navigation bar
    - Added Markdown templates for the homepage, guide, and example pages
    - Set up default theme, social links, and basic styling
  - Added project overview and Monorepo feature descriptions

### Patch Changes

- ### Fixed
  - Fixed the issue where the top navigation menu was not correctly highlighted
    - Added activeMatch config to ensure /backend/ routes properly activate the "Backend" nav item
    - Improved route matching behavior for all documentation pages
