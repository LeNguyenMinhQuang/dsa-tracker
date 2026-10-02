const LEGACY_KEY = "dsa-tracker-data";
const USERS_KEY = "dsa-tracker:users";
const GROUPS_KEY = "dsa-tracker:groups";
const LEGACY_USER_ID = "default";
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
  userKey,
  DISCOVER_TOPICS,
  FALLBACK_WORDS,
  POS_SHORT,
};
