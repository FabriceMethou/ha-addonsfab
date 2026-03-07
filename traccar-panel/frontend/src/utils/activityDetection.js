/**
 * Detect activity type from speed and context.
 * Returns one of: 'flying' | 'driving' | 'cycling' | 'walking' | 'home' | 'work' | 'stationary'
 */
export function detectActivity(speedKmh, position, geofences) {
  if (speedKmh > 200) return "flying";
  if (speedKmh > 15) return "driving";
  if (speedKmh > 5) return "cycling";
  if (speedKmh > 1) return "walking";

  // Check if at a named geofence
  const gfIds = position?.geofenceIds ?? [];
  if (gfIds.length > 0 && geofences) {
    for (const gf of geofences) {
      if (!gfIds.includes(gf.id)) continue;
      if (/home|huis|maison|casa|thuis/i.test(gf.name)) return "home";
      if (/work|bureau|kantoor|office|job|werk/i.test(gf.name)) return "work";
    }
  }

  return "stationary";
}

/**
 * SVG badge icons for each activity type (16x16 viewBox).
 * Returns an SVG group string to embed inside a larger SVG, positioned at (cx, cy).
 */
export function activityBadgeSvg(activity, cx, cy) {
  if (activity === "stationary") return "";

  const icons = {
    driving: `<path d="M3 10h2l1-3h4l1 3h2v2h-1v2h-2v-2H5v2H3v-2H2v-2h1zm3-2h4l-.5-1.5H6.5L6 8z" fill="#fff"/>`,
    cycling: `<circle cx="4" cy="11" r="2.5" fill="none" stroke="#fff" stroke-width="1.2"/><circle cx="12" cy="11" r="2.5" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M4 11l3-5h2l1 3h2" fill="none" stroke="#fff" stroke-width="1.2"/>`,
    walking: `<circle cx="8" cy="3" r="1.5" fill="#fff"/><path d="M8 5v4l-2 4M8 9l2 4M6 7h4" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`,
    home: `<path d="M8 2L2 7h2v6h3v-4h2v4h3V7h2L8 2z" fill="#fff"/>`,
    work: `<rect x="3" y="5" width="10" height="8" rx="1" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M6 5V3.5a2 2 0 0 1 4 0V5" fill="none" stroke="#fff" stroke-width="1.2"/><circle cx="8" cy="9" r="1" fill="#fff"/>`,
    flying: `<path d="M8 1L6 5H2l2 3-1 5 5-2 5 2-1-5 2-3H10L8 1z" fill="#fff"/>`,
  };

  const icon = icons[activity];
  if (!icon) return "";

  return `
    <g transform="translate(${cx - 8}, ${cy - 8})">
      <circle cx="8" cy="8" r="9" fill="rgba(0,0,0,0.6)" stroke="white" stroke-width="1"/>
      <svg viewBox="0 0 16 16" width="16" height="16">${icon}</svg>
    </g>
  `;
}
