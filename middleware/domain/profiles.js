'use strict';

/**
 * domain/profiles.js — pure core vocabulary for access tiers.
 * No I/O. No HTTP. No Sheets.
 * Outer layers may read these constants; they must not redefine them.
 */

const PROFILE = Object.freeze({
  PUBLIC: 1,
  USER: 2,
  MODERATOR: 3,
  SUPER_ADMIN: 4,
});

const ROLE_CODE = Object.freeze({
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
});

const ROLE_NAME = Object.freeze({
  1: 'Public Viewer',
  2: 'User',
  3: 'Moderator',
  4: 'Super Admin',
});

function normalizeProfile(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < PROFILE.PUBLIC) return PROFILE.PUBLIC;
  if (n > PROFILE.SUPER_ADMIN) return PROFILE.SUPER_ADMIN;
  return Math.floor(n);
}

function roleCode(profile) {
  return ROLE_CODE[normalizeProfile(profile)] || ROLE_CODE[1];
}

function roleName(profile) {
  return ROLE_NAME[normalizeProfile(profile)] || ROLE_NAME[1];
}

module.exports = {
  PROFILE,
  ROLE_CODE,
  ROLE_NAME,
  normalizeProfile,
  roleCode,
  roleName,
};
