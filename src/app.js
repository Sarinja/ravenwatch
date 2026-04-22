import { initApp } from "./core/init.js";
import { normalizeTravelDrops } from "./features/travel/travelStore.js";

// 🔧 Clean up old / malformed travel data on startup
normalizeTravelDrops();

initApp();