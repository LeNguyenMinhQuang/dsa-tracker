const LEGACY_KEY = "dsa-tracker-data";
const USERS_KEY = "dsa-tracker:users";
const GROUPS_KEY = "dsa-tracker:groups";
const LEGACY_USER_ID = "default";

// Shared (cross-user) illustration images, keyed by normalized term
const IMAGES_KEY = "dsa-tracker:images"; // hash: term -> Cloudinary URL
const IMAGES_PENDING_KEY = "dsa-tracker:images:pending"; // set: "w:<term>"
const IMAGES_HINTS_KEY = "dsa-tracker:images:hints"; // hash: term -> English hint
const IMAGES_FAILS_KEY = "dsa-tracker:images:fails"; // hash: term -> failed attempts
const IMAGE_MAX_ATTEMPTS = 3;
const imageLockKey = (term) => `dsa-tracker:images:lock:${term}`;

// Authentication
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_SECONDS = 15 * 60;
const sessionKey = (token) => `dsa-tracker:session:${token}`;
const userSessionsKey = (id) => `dsa-tracker:user-sessions:${id}`;
const loginFailKey = (id) => `dsa-tracker:login-fails:${id}`;
const userKey = (id) => `dsa-tracker:user:${id}`;

const DISCOVER_TOPICS = [
  "office",
  "business",
  "contract",
  "finance",
  "marketing",
  "travel",
  "hotel",
  "restaurant",
  "health",
  "technology",
  "manufacturing",
  "shipping",
  "retail",
  "employment",
  "meeting",
  "banking",
  "insurance",
  "real estate",
  "education",
  "law",
  "energy",
  "advertising",
  "customer",
  "schedule",
  "project",
  "negotiation",
  "purchase",
  "event",
  "transportation",
  "environment",
  "management",
  "equipment",
  "report",
  "budget",
  "training",
];

const FALLBACK_WORDS = (
  "agenda invoice deadline warranty vendor inventory supplier proposal budget revenue expense payroll " +
  "employer colleague candidate resume interview promotion salary bonus benefit overtime itinerary " +
  "reservation luggage passenger boarding departure arrival customs destination accommodation reception " +
  "complimentary refund receipt purchase discount shipment delivery warehouse logistics freight manufacture " +
  "assembly equipment maintenance inspection quality supervisor director executive department headquarters " +
  "branch subsidiary merger acquisition investment shareholder dividend portfolio mortgage interest deposit " +
  "withdrawal balance insurance premium coverage lease tenant landlord property renovation construction " +
  "architect permit regulation compliance penalty license patent trademark negotiation agreement clause " +
  "amendment signature attorney verdict brochure catalog exhibition conference seminar workshop colleague " +
  "revise submit approve postpone reschedule confirm attach distribute implement evaluate acquire reimburse " +
  "temporary permanent mandatory voluntary complimentary beneficial efficient flexible previous upcoming " +
  "approximately significantly immediately recently occasionally subsequently currently"
)
  .split(/\s+/)
  .filter(Boolean);

const POS_SHORT = {
  noun: "n.",
  verb: "v.",
  adjective: "adj.",
  adverb: "adv.",
};

module.exports = {
  LEGACY_KEY,
  USERS_KEY,
  GROUPS_KEY,
  LEGACY_USER_ID,
  IMAGES_KEY,
  IMAGES_PENDING_KEY,
  IMAGES_HINTS_KEY,
  IMAGES_FAILS_KEY,
  IMAGE_MAX_ATTEMPTS,
  imageLockKey,
  SESSION_TTL_SECONDS,
  LOGIN_MAX_FAILS,
  LOGIN_LOCK_SECONDS,
  sessionKey,
  userSessionsKey,
  loginFailKey,
  userKey,
  DISCOVER_TOPICS,
  FALLBACK_WORDS,
  POS_SHORT,
};
