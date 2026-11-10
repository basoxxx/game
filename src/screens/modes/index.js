// Game modes: screens + routing glue (imported by quickrace.js and challenges.js)
import './ui.js';
import './champ.js';
import './debrief.js';
import './daily.js';
import { installRouter } from './router.js';

installRouter();
