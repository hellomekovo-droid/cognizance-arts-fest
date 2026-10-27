# Cognizance Arts Fest

Official website for the Cognizance Arts Fest — celebrating student creativity, talent, and achievements.

## Project Architecture & Directory Structure

```text
cognizance/
├── index.html                           # Root HTML entry point (accessible for static hosting)
├── package.json                         # Project configuration and local dev server scripts
├── .gitignore                           # Git ignore rules for logs, OS files, and raw scratch assets
├── README.md                            # Project documentation and architectural overview
│
└── assets/                              # Static production assets
    ├── brand/                           # Official festival logos, badges, and icons
    │   ├── cognizance-26-logo.png       # Primary Cognizance '26 emblem artwork
    │   ├── cognizance-ribbons-logo.png  # Team ribbons badge variant
    │   ├── cognizance-icon.png          # High-resolution icon mark
    │   ├── cognizance-favicon.png       # Raster favicon (128x128)
    │   └── cognizance-favicon.svg       # Vector favicon
    │
    ├── css/                             # Stylesheets
    │   ├── styles.css                   # Main production stylesheet (typography, hero lantern, marquee)
    │   └── components/                  # Isolated component stylesheets
    │       └── cognizance-ribbons.css   # Standalone 3-layer marquee ribbons component
    │
    ├── js/                              # JavaScript
    │   └── app.js                       # Client interactivity (search, filtering, scroll reveals, accessibility)
    │
    ├── images/                          # Production visual assets
    │   ├── hero/                        # Hero section artwork
    │   │   ├── lantern-pure.png         # Clean cutout glowing lantern centerpiece
    │   │   ├── hero-bg-composite.png    # Composite backdrop asset
    │   │   ├── hero-bg-desktop.png      # Desktop backdrop asset
    │   │   └── hero-bg-mobile.png       # Mobile backdrop asset
    │   │
    │   └── photos/                      # Festival photography & sample visual reserves
    │       ├── fest-campus-photo.jpg    # Campus pavilion and audience photography
    │       ├── fest-stage-photo.jpg     # Student stage performance photography
    │       ├── photo-placeholder.svg    # Neutral SVG placeholder for empty slots
    │       ├── sample-art.webp          # Visual arts placeholder
    │       └── sample-stage.webp        # Performing arts placeholder
    │
    └── raw/                             # Intermediate design experiments & raw lantern sources (git-ignored)
        ├── lamp.png
        ├── lantern-checker.jpg
        ├── lantern-clean.png
        ├── lantern-cream.png
        ├── lantern-cutout.png
        ├── lantern-raw.png
        ├── lantern-source.png
        ├── lantern-transparent.png
        └── lantern.png
```

---

## Getting Started

### Local Development
To launch the site locally with automatic live-serving:

```bash
# Using npm
npm run dev
# or
npm start
```

This serves the site at `http://localhost:5500`.

---

## Asset Guidelines

- **Brand Assets (`assets/brand/`)**: Store high-resolution SVG or PNG artwork for logos, seals, and favicons.
- **Hero Artwork (`assets/images/hero/`)**: Store hero centerpiece imagery and backdrop variations.
- **Photos (`assets/images/photos/`)**: Store optimized WebP or JPEG photos from the festival. Keep width under 1600px and compress to < 400 KB for optimal load times.
- **Raw / Working Assets (`assets/raw/`)**: Place raw PSDs, unclipped sources, and intermediate iteration renders here. These are excluded from version control via `.gitignore`.
