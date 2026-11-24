import React from "react";

/**
 * CyBridge brand assets.
 *
 * The source artwork (public/brand/) is drawn on a white ground, so both marks
 * render inside a light "plate" — see .brand-mark / .brand-lockup-plate in
 * index.css. That keeps the logo legible on all six palettes instead of showing
 * a white rectangle on the dark ones.
 */

interface BrandMarkProps {
  /** Rendered box size in px, including the plate padding. */
  size?: number;
  /** Shimmer sweep + hover lift. Turn off for dense/repeated placements. */
  animated?: boolean;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 40,
  animated = true,
  className = ""
}) => (
  <span
    className={`brand-mark ${animated ? "brand-mark-animated" : ""} ${className}`}
    style={{ width: size, height: size }}
  >
    <img
      src="/brand/cybridge-mark.webp"
      alt="CyBridge"
      width={size}
      height={size}
      decoding="async"
    />
  </span>
);

interface BrandLockupProps {
  /** Width of the plate contents in px. */
  width?: number;
  className?: string;
}

export const BrandLockup: React.FC<BrandLockupProps> = ({
  width = 300,
  className = ""
}) => (
  <span className={`brand-lockup-plate ${className}`} style={{ width: width + 44 }}>
    <img
      src="/brand/cybridge-logo.webp"
      alt="CyBridge — Workforce Capability Intelligence"
      className="brand-lockup"
      style={{ width }}
      decoding="async"
    />
  </span>
);
