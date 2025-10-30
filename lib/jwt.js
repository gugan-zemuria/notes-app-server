const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('SUPABASE_JWT_SECRET environment variable is required');
}

/**
 * Verify and decode a Supabase JWT token
 * @param {string} token - The JWT token to verify
 * @returns {object} - Decoded token payload
 */
const verifySupabaseToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'supabase'
    });
    return { user: decoded, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
};

/**
 * Decode a JWT token without verification (for debugging)
 * @param {string} token - The JWT token to decode
 * @returns {object} - Decoded token payload
 */
const decodeToken = (token) => {
  try {
    const decoded = jwt.decode(token, { complete: true });
    return decoded;
  } catch (error) {
    return null;
  }
};

/**
 * Extract user ID from JWT token
 * @param {string} token - The JWT token
 * @returns {string|null} - User ID or null
 */
const getUserIdFromToken = (token) => {
  const { user, error } = verifySupabaseToken(token);
  if (error || !user) {
    return null;
  }
  return user.sub; // 'sub' is the user ID in Supabase JWT
};

module.exports = {
  verifySupabaseToken,
  decodeToken,
  getUserIdFromToken
};