// "Intro already seen" flag, apart from intro.js so the launcher can read it without loading the title screen
export const INTRO_FLAG = 'apexdynasty_intro';
export function introSeen() { try { return !!localStorage.getItem(INTRO_FLAG); } catch { return true; } }
