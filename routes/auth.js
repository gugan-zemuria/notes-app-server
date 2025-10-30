const express = require('express');
const { supabase } = require('../lib/supabase');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Sign up with email and password
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Sign up attempt:', { email, hasPassword: !!password });

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error('Supabase sign up error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log('Sign up successful for:', email);

    res.json({
      message: 'User created successfully. Please check your email for verification.',
      user: data.user
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign in with email and password
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Sign in attempt:', { email, hasPassword: !!password });

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Supabase sign in error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log('Sign in successful for:', email);

    // Set session cookie
    res.cookie('sb-access-token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.cookie('sb-refresh-token', data.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Signed in successfully',
      user: data.user,
      session: {
        access_token: data.session.access_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth sign in
router.post('/google', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.CLIENT_URL}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });

    if (error) {
      console.error('Google OAuth error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    console.log('OAuth URL generated:', data.url);
    res.json({ url: data.url });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle OAuth callback - exchange code for session
router.post('/callback', async (req, res) => {
  try {
    const { code } = req.body;

    console.log('OAuth callback received:', { code: !!code });

    if (!code) {
      console.error('No authorization code provided');
      return res.status(400).json({ error: 'Authorization code required' });
    }

    console.log('Exchanging code for session...');
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Code exchange error:', error.message);
      return res.status(400).json({ error: error.message });
    }

    if (!data.session) {
      console.error('No session returned from code exchange');
      return res.status(400).json({ error: 'Failed to create session' });
    }

    console.log('Session created successfully for user:', data.user?.email);

    // Set session cookies with proper domain settings
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/'
    };

    res.cookie('sb-access-token', data.session.access_token, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.cookie('sb-refresh-token', data.session.refresh_token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Authentication successful',
      user: data.user,
      session: {
        access_token: data.session.access_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Sign out
router.post('/signout', async (req, res) => {
  try {
    const accessToken = req.cookies['sb-access-token'];

    if (accessToken) {
      await supabase.auth.signOut();
    }

    res.clearCookie('sb-access-token');
    res.clearCookie('sb-refresh-token');

    res.json({ message: 'Signed out successfully' });
  } catch (error) {
    console.error('Signout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle direct token authentication (for implicit flow)
router.post('/token', async (req, res) => {
  try {
    const { access_token, refresh_token } = req.body;

    console.log('Token authentication attempt:', { hasAccessToken: !!access_token, hasRefreshToken: !!refresh_token });

    if (!access_token) {
      return res.status(400).json({ error: 'Access token required' });
    }

    // Verify the token and get user
    const { data: { user }, error } = await supabase.auth.getUser(access_token);

    if (error) {
      console.error('Token verification error:', error.message);
      return res.status(401).json({ error: error.message });
    }

    console.log('Token verified for user:', user?.email);

    // Set session cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/'
    };

    res.cookie('sb-access-token', access_token, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    if (refresh_token) {
      res.cookie('sb-refresh-token', refresh_token, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    res.json({
      message: 'Token authentication successful',
      user
    });
  } catch (error) {
    console.error('Token authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/user', async (req, res) => {
  try {
    const accessToken = req.cookies['sb-access-token'];

    console.log('Get user request:', { hasToken: !!accessToken });

    if (!accessToken) {
      return res.status(401).json({ error: 'No access token' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error) {
      console.error('Get user error:', error.message);
      return res.status(401).json({ error: error.message });
    }

    console.log('User retrieved:', user?.email);
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.protocol}://${req.get('host')}/reset-password`
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify JWT token (for testing)
router.post('/verify-jwt', async (req, res) => {
  try {
    const { token } = req.body;
    const { verifySupabaseToken, decodeToken } = require('../lib/jwt');

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const { user, error } = verifySupabaseToken(token);

    if (error) {
      // Also provide decoded token for debugging
      const decoded = decodeToken(token);
      return res.status(401).json({
        error: 'Invalid token',
        details: error,
        decoded: decoded
      });
    }

    res.json({
      message: 'Token is valid',
      user: {
        id: user.sub,
        email: user.email,
        role: user.role,
        exp: user.exp,
        iat: user.iat
      }
    });
  } catch (error) {
    console.error('JWT verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;