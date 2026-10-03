/*
 * Create a user or set/reset a user's password and role from the command line.
 * Needed once after upgrading: existing profiles have no password yet.
 *
 * Usage (from the project root):
 *   node scripts/setPassword.js <name> <password> [--admin | --user]
 *
 * Examples:
 *   node scripts/setPassword.js Quang 'MyStrongPass1' --admin
 *   node scripts/setPassword.js Hoa 'AnotherPass2'
 *
 * - If a profile with that name exists, its password (and role, if a flag is
 *   given) is updated. Otherwise a new profile is created (role "user" unless --admin).
 * - In PowerShell, wrap the password in SINGLE quotes so $ and ! are not interpreted.
 */
require("dotenv").config({ quiet: true });

const userService = require("../src/services/userService");

async function main() {
  const [name, password, ...flags] = process.argv.slice(2);
  if (!name || !password) {
    console.log("Usage: node scripts/setPassword.js <name> <password> [--admin | --user]");
    process.exit(1);
  }
  const role = flags.includes("--admin") ? "admin" : flags.includes("--user") ? "user" : null;

  await userService.ensureReady();
  const users = await userService.getUsersFull();
  const existing = users.find((u) => u.name.toLowerCase() === name.trim().toLowerCase());

  if (existing) {
    await userService.setPassword(existing.id, password);
    if (role) await userService.setUserRole(existing.id, role);
    console.log(`✓ Updated "${existing.name}": password set${role ? `, role = ${role}` : ""}.`);
  } else {
    const u = await userService.createUser(name, password, role || "user");
    console.log(`✓ Created "${u.name}" with role = ${u.role}.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("✗", e.message);
    process.exit(1);
  });
