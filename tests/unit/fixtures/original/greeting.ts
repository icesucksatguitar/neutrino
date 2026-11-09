// Verbatim copies of the UNFIXED greeting logic, including the developer-name fallback.
// Sources:
//   - Homescreen.tsx: displayName initialiser + getGreeting
//   - McpModal.tsx: getGreeting
// The only changes are that `localStorage` and the current time are passed in so the
// logic runs in node. Do not edit the bodies.

export interface GreetingStorage {
  getItem(key: string): string | null;
}

/** Homescreen.getGreeting for an already resolved display name. */
export function originalFormatGreeting(date: Date, displayName: string): string {
  const hour = date.getHours();
  if (hour >= 0 && hour < 12) {
    return `Good morning, ${displayName}`;
  } else if (hour >= 12 && hour < 17) {
    return `Good afternoon, ${displayName}`;
  } else {
    return `Good evening, ${displayName}`;
  }
}

/** Homescreen displayName initialiser (userName prop, then neutrino_user_profile, then 'Yash'). */
export function originalHomescreenDisplayName(userName: string | undefined, localStorage: GreetingStorage): string {
  if (userName) return userName;
  try {
    const saved = localStorage.getItem('neutrino_user_profile');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.name) return parsed.name;
    }
  } catch {}
  return 'Yash';
}

/** Full Homescreen greeting as rendered. */
export function originalHomescreenGreeting(date: Date, userName: string | undefined, localStorage: GreetingStorage): string {
  return originalFormatGreeting(date, originalHomescreenDisplayName(userName, localStorage));
}

/** McpModal.getGreeting as rendered. */
export function originalMcpGreeting(date: Date, localStorage: GreetingStorage): string {
  const hour = date.getHours();
  let name = 'Yash';
  try {
    const stored = localStorage.getItem('neutrino_user_name');
    if (stored) name = stored;
    else {
      const profile = localStorage.getItem('neutrino_user_profile');
      if (profile) {
        const parsed = JSON.parse(profile);
        if (parsed.name) name = parsed.name;
      }
    }
  } catch {}
  if (hour >= 0 && hour < 12) {
    return `Good morning, ${name}`;
  } else if (hour >= 12 && hour < 17) {
    return `Good afternoon, ${name}`;
  } else {
    return `Good evening, ${name}`;
  }
}
