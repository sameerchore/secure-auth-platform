/**
 * user.controller.js — Current user profile endpoint.
 *
 * GET /me returns ONLY the authenticated user's profile.
 * The user is determined solely from the validated session —
 * any userId in query/body is ignored for authorization.
 */

/**
 * GET /me
 */
async function getMe(req, res, next) {
  try {
    // req.user is set by auth middleware — guaranteed to be the authenticated user
    const user = req.user;

    return res.status(200).json({
      id:      user.id,
      email:   user.email,
      profile: {
        fullName:    user.full_name,
        displayName: user.display_name,
        bio:         user.bio,
        createdAt:   user.created_at,
        role:        user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe };
