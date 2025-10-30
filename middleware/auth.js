const { supabase } = require('../lib/supabase');
const { verifySupabaseToken, getUserIdFromToken } = require('../lib/jwt');

const authenticateUser = async (req, res, next) => {
  try {
    const accessToken = req.cookies['sb-access-token'] || req.headers.authorization?.replace('Bearer ', '');

    if (!accessToken) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Try JWT verification first (faster)
    const { user: jwtUser, error: jwtError } = verifySupabaseToken(accessToken);
    
    if (jwtUser && !jwtError) {
      // JWT is valid, use it directly
      const user = {
        id: jwtUser.sub,
        email: jwtUser.email,
        user_metadata: jwtUser.user_metadata || {},
        app_metadata: jwtUser.app_metadata || {},
        created_at: jwtUser.created_at,
        email_confirmed_at: jwtUser.email_confirmed_at
      };

      // Ensure user exists in our database
      await ensureUserExists(user);

      req.user = user;
      return next();
    }

    // Fallback to Supabase API if JWT verification fails
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Ensure user exists in our database
    await ensureUserExists(user);

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper function to ensure user exists in our database
const ensureUserExists = async (user) => {
  try {
    // Check if user exists in our users table
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      // User doesn't exist, create them
      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
          email_verified: user.email_confirmed_at ? true : false,
          created_at: user.created_at || new Date()
        }]);

      if (insertError) {
        console.error('Error creating user in database:', insertError);
      } else {
        console.log('Created new user in database:', user.email);
      }
    }
  } catch (error) {
    console.error('Error ensuring user exists:', error);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const accessToken = req.cookies['sb-access-token'] || req.headers.authorization?.replace('Bearer ', '');

    if (accessToken) {
      // Try JWT verification first
      const { user: jwtUser, error: jwtError } = verifySupabaseToken(accessToken);
      
      if (jwtUser && !jwtError) {
        const user = {
          id: jwtUser.sub,
          email: jwtUser.email,
          user_metadata: jwtUser.user_metadata || {},
          app_metadata: jwtUser.app_metadata || {},
          created_at: jwtUser.created_at,
          email_confirmed_at: jwtUser.email_confirmed_at
        };

        await ensureUserExists(user);
        req.user = user;
      } else {
        // Fallback to Supabase API
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (!error && user) {
          await ensureUserExists(user);
          req.user = user;
        }
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
};

module.exports = { authenticateUser, optionalAuth };